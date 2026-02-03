import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { ChannelService } from './channel.service';
import { AuthService } from './auth.service';
import type { AppUser } from './user.service';
import { Observable, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import { NOTIFICATIONS } from '../notifications';
import type { Channel, ChannelMember } from '../types';
import { AuthenticatedFirestoreStreamService } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class ChannelMembershipService {
  private channelService = inject(ChannelService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private authenticatedFirestoreStreamService = inject(AuthenticatedFirestoreStreamService);

  private channelMembersCache = new Map<string, Observable<ChannelMember[]>>();

  /**
   * Emits the set of channel IDs the current user is a member of.
   * Always emits (empty set if logged out).
   */
  getAllowedChannelIds$(currentUser$: Observable<AppUser | null>): Observable<Set<string>> {
    return currentUser$.pipe(
      switchMap((user: AppUser | null) => {
        if (!user?.uid) {
          // 衁"' EXTREM WICHTIG: IMMER emitten
          return of(new Set<string>());
        }

        return this.getChannelsForUser(user.uid).pipe(
          map((channels) => new Set(channels.map((c) => c.id).filter((id): id is string => typeof id === 'string')))
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getChannelsForUser(userId: string): Observable<Channel[]> {
    return this.channelService.getChannels().pipe(
      switchMap((channels) => {
        if (!channels.length) {
          return of<Channel[]>([]);
        }

        const channelChecks$ = channels
          .filter((channel): channel is Channel & { id: string } => !!channel.id)
          .map((channel) => {
            if (channel.isPublic) {
              return of({ channel, hasAccess: true });
            }

            return this.getChannelMembers(channel.id).pipe(
              map((members) => ({ channel, hasAccess: members.some((member) => member.id === userId) }))
            );
          });

        if (!channelChecks$.length) {
          return of<Channel[]>([]);
        }

        return combineLatest(channelChecks$).pipe(
          map((results) => results.filter((result) => result.hasAccess).map((result) => result.channel))
        );
      })
    );
  }

  getChannelMembers(channelId: string): Observable<ChannelMember[]> {
    if (!this.channelMembersCache.has(channelId)) {
      const membersCollection = collection(this.firestore, `channels/${channelId}/members`);

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<ChannelMember[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(membersCollection, { idField: 'id' }).pipe(
              map((members) => members as ChannelMember[])
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

      this.channelMembersCache.set(channelId, stream$);
    }

    return this.channelMembersCache.get(channelId)!;
  }

  async upsertChannelMember(
    channelId: string,
    member: Pick<ChannelMember, 'id' | 'name' | 'profilePictureKey' | 'subtitle'>
  ): Promise<void> {
    const memberDoc = doc(this.firestore, `channels/${channelId}/members/${member.id}`);

    const payload: Record<string, unknown> = {
      id: member.id,
      name: member.name,
      profilePictureKey: member.profilePictureKey,
      channelId,
      scope: 'channel',
      addedAt: serverTimestamp(),
    };

    if (member.subtitle) {
      payload['subtitle'] = member.subtitle;
    }

    await setDoc(memberDoc, payload, { merge: true });
  }

  async syncPublicChannelMembers(channelId: string, users: AppUser[], members: ChannelMember[]): Promise<void> {
    const missingUsers = this.getMissingChannelUsers(users, members);
    if (!missingUsers.length) return;

    await this.addChannelMembersBatch(channelId, missingUsers);
  }

  async leaveChannel(channelId: string, userId: string): Promise<void> {
    const memberDoc = doc(this.firestore, `channels/${channelId}/members/${userId}`);
    await deleteDoc(memberDoc);

    const membersCollection = collection(this.firestore, `channels/${channelId}/members`);
    const remainingMembers = await getDocs(membersCollection);

    if (remainingMembers.empty) {
      const channelDoc = doc(this.firestore, `channels/${channelId}`);
      await deleteDoc(channelDoc);
    }
  }

  async removeUserFromAllChannels(userId: string): Promise<void> {
    const membersQuery = query(
      collectionGroup(this.firestore, 'members'),
      where('scope', '==', 'channel'),
      where('id', '==', userId)
    );

    const membersSnap = await getDocs(membersQuery);

    const channelIds = new Set<string>();
    for (const memberDoc of membersSnap.docs) {
      const channelId = memberDoc.data()['channelId'] as string | undefined;
      if (channelId) {
        channelIds.add(channelId);
      } else {
        await deleteDoc(memberDoc.ref);
      }
    }

    const results = await Promise.allSettled([...channelIds].map((channelId) => this.leaveChannel(channelId, userId)));

    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((failure) => console.error(NOTIFICATIONS.LEAVE_CHANNEL_FAILED, failure));

    if (failures.length) {
      throw new Error(NOTIFICATIONS.LEAVE_CHANNEL_FAILED);
    }
  }

  private getMissingChannelUsers(users: AppUser[], members: ChannelMember[]): Array<{ userId: string; data: AppUser }> {
    const memberIds = new Set(members.map((member) => member.id));

    return users
      .filter((user) => user.uid && !memberIds.has(user.uid))
      .map((user) => ({ userId: user.uid, data: user }));
  }

  private async addChannelMembersBatch(
    channelId: string,
    missingUsers: Array<{ userId: string; data: AppUser }>
  ): Promise<void> {
    let batch = writeBatch(this.firestore);
    let operationCount = 0;

    for (const { userId, data } of missingUsers) {
      const payload = this.buildChannelMemberPayload(userId, data, channelId);
      const memberDoc = doc(this.firestore, `channels/${channelId}/members/${userId}`);
      batch.set(memberDoc, payload, { merge: true });
      operationCount += 1;

      if (operationCount >= 450) {
        ({ batch, operationCount } = await this.commitBatch(batch, operationCount));
      }
    }

    await this.commitBatch(batch, operationCount);
  }

  private async commitBatch(
    batch: ReturnType<typeof writeBatch>,
    operationCount: number
  ): Promise<{ batch: ReturnType<typeof writeBatch>; operationCount: number }> {
    if (!operationCount) return { batch, operationCount };

    await batch.commit();
    return { batch: writeBatch(this.firestore), operationCount: 0 };
  }

  private buildChannelMemberPayload(userId: string, data: AppUser, channelId: string): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      id: userId,
      name: data.name,
      profilePictureKey: data.profilePictureKey,
      scope: 'channel',
      addedAt: serverTimestamp(),
      channelId,
    };

    if (data.email) {
      payload['subtitle'] = data.email;
    }

    return payload;
  }
}
