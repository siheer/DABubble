import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collectionData,
  collectionGroup,
  doc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import {
  BehaviorSubject,
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  from,
  map,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { AppUser, UserService } from './user.service';
import { ChannelService } from './channel.service';
import { DirectMessagesService } from './direct-messages.service';
import { ChannelMembershipService } from './membership.service';
import { AuthService } from './auth.service';
import type { Channel, ChannelListItem, DirectMessageMeta, DirectMessageUser, ReadStatusEntry } from '../types';
import { createAuthenticatedFirestoreStream } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class UnreadMessagesService {
  private readonly channelService = inject(ChannelService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private readonly activeChannelIdSubject = new BehaviorSubject<string | null>(null);
  private readonly activeDmIdSubject = new BehaviorSubject<string | null>(null);
  private readonly readStatusEntriesByUserCache = new Map<string, Observable<ReadStatusEntry[]>>();

  readonly channelsWithUnreadCount$: Observable<ChannelListItem[]> = this.userService.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) return of<ChannelListItem[]>([]);

      return combineLatest([
        this.membershipService.getChannelsForUser(currentUser.uid),
        this.getReadStatusEntriesByUser(currentUser.uid),
        this.activeChannelIdSubject,
      ]).pipe(
        map(([channels, readStatusEntries, activeChannelId]) =>
          this.mapChannelsWithUnread(channels, readStatusEntries, activeChannelId)
        )
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  readonly directMessageUsersWithUnreadCount$: Observable<DirectMessageUser[]> = this.userService.currentUser$.pipe(
    switchMap((currentUser) => {
      if (!currentUser) {
        return of<DirectMessageUser[]>([]);
      }

      return combineLatest([
        this.userService.getAllUsers(),
        this.directMessagesService.getDirectMessageMetas(currentUser.uid),
        this.getReadStatusEntriesByUser(currentUser.uid),
        this.activeDmIdSubject,
      ]).pipe(
        map(([users, metas, readStatusEntries, activeDmId]) =>
          this.mapDirectMessagesWithUnread(users, metas, readStatusEntries, activeDmId, currentUser.uid)
        )
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  readonly directMessageUnreadTotalCount$: Observable<number> = this.directMessageUsersWithUnreadCount$.pipe(
    map((users) => users.reduce((total, user) => total + (user.unreadCount ?? 0), 0))
  );
  readonly channelUnreadTotalCount$: Observable<number> = this.channelsWithUnreadCount$.pipe(
    map((channels) => channels.reduce((total, channel) => total + (channel.unreadCount ?? 0), 0))
  );

  constructor() {
    this.syncActiveChannelReads();
    this.syncActiveDirectMessageReads();
  }

  setActiveChannelId(channelId: string | null): void {
    this.activeChannelIdSubject.next(channelId);
  }

  setActiveDmId(dmId: string | null): void {
    this.activeDmIdSubject.next(dmId);
  }

  private mapChannelsWithUnread(
    channels: Channel[],
    readStatusEntries: ReadStatusEntry[],
    activeChannelId: string | null
  ): ChannelListItem[] {
    const readStatusMap = new Map(
      readStatusEntries
        .filter((status) => !!status.channelId && (!status.scope || status.scope === 'channel'))
        .map((status) => [status.channelId ?? '', status])
    );

    const mapped = channels.map((channel) => {
      const channelId = channel.id;
      if (!channelId) return { ...channel, unreadCount: 0 };

      const messageCount = channel.messageCount ?? 0;
      const lastReadCount = readStatusMap.get(channelId)?.lastReadCount ?? 0;
      const unreadCount = Math.max(0, messageCount - lastReadCount);
      const isActive = activeChannelId === channelId;

      return { ...channel, unreadCount: isActive ? 0 : unreadCount };
    });
    return [...mapped].sort((a, b) => {
      const aUnread = a.unreadCount ?? 0;
      const bUnread = b.unreadCount ?? 0;

      if (aUnread !== bUnread) {
        return bUnread - aUnread;
      }

      const aTitle = a.title ?? '';
      const bTitle = b.title ?? '';

      return aTitle.localeCompare(bTitle);
    });
  }

  private mapDirectMessagesWithUnread(
    users: AppUser[],
    metas: DirectMessageMeta[],
    readStatusEntries: ReadStatusEntry[],
    activeDmId: string | null,
    currentUserId: string
  ): DirectMessageUser[] {
    const metaMap = new Map(metas.map((meta) => [meta.id ?? '', meta]));
    const readStatusMap = new Map(
      readStatusEntries
        .filter((status) => !!status.conversationId && (!status.scope || status.scope === 'dm'))
        .map((status) => [status.conversationId!, status])
    );

    const directMessageUsers = users.map((user) => {
      const displayName = user.uid === currentUserId ? `${user.name} (Du)` : user.name;
      if (user.uid === currentUserId) {
        return { ...user, displayName, unreadCount: 0, lastMessageAt: undefined };
      }

      const conversationId = this.directMessagesService.buildConversationId(currentUserId, user.uid);
      const meta = metaMap.get(conversationId);
      const readStatus = readStatusMap.get(conversationId);
      const messageCount = meta?.messageCount ?? 0;
      const lastReadCount = readStatus?.lastReadCount ?? 0;
      const unreadCount = Math.max(0, messageCount - lastReadCount);
      const isActive = activeDmId === user.uid;

      return {
        ...user,
        displayName,
        unreadCount: isActive ? 0 : unreadCount,
        lastMessageAt: meta?.lastMessageAt,
      };
    });

    return [...directMessageUsers].sort((a, b) => {
      const aTime = a.lastMessageAt?.toDate?.().getTime() ?? 0;
      const bTime = b.lastMessageAt?.toDate?.().getTime() ?? 0;

      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private syncActiveChannelReads(): void {
    combineLatest([this.userService.currentUser$, this.activeChannelIdSubject])
      .pipe(
        switchMap(([currentUser, channelId]) => {
          if (!currentUser || !channelId) return of(null);

          return combineLatest([
            this.channelService.getChannel(channelId),
            this.getReadStatusEntriesByUser(currentUser.uid),
          ]).pipe(
            map(([channel, readStatusEntries]) => {
              if (!channel) return null;
              const messageCount = channel.messageCount ?? 0;
              const lastReadCount =
                readStatusEntries.find(
                  (status) => status.channelId === channelId && (!status.scope || status.scope === 'channel')
                )?.lastReadCount ?? 0;
              return { userId: currentUser.uid, channelId, messageCount, lastReadCount };
            })
          );
        }),
        filter((state): state is { userId: string; channelId: string; messageCount: number; lastReadCount: number } =>
          Boolean(state)
        ),
        distinctUntilChanged(
          (a, b) =>
            a.userId === b.userId &&
            a.channelId === b.channelId &&
            a.messageCount === b.messageCount &&
            a.lastReadCount === b.lastReadCount
        ),
        filter((state) => state.messageCount > state.lastReadCount),
        switchMap((state) =>
          from(this.setChannelReadStatus(state.userId, state.channelId, state.messageCount)).pipe(
            catchError((error) => {
              console.error(error);
              return of(null);
            })
          )
        )
      )
      .subscribe();
  }

  private syncActiveDirectMessageReads(): void {
    combineLatest([this.userService.currentUser$, this.activeDmIdSubject])
      .pipe(
        switchMap(([currentUser, dmId]) => {
          if (!currentUser || !dmId) return of(null);

          const conversationId = this.directMessagesService.buildConversationId(currentUser.uid, dmId);
          return combineLatest([
            this.directMessagesService.getDirectMessageMetas(currentUser.uid),
            this.getReadStatusEntriesByUser(currentUser.uid),
          ]).pipe(
            map(([metas, readStatusEntries]) => {
              const meta = metas.find((entry) => entry.id === conversationId);
              const readStatus = readStatusEntries.find(
                (status) => status.conversationId === conversationId && (!status.scope || status.scope === 'dm')
              );
              const messageCount = meta?.messageCount ?? 0;
              const lastReadCount = readStatus?.lastReadCount ?? 0;
              return {
                userId: currentUser.uid,
                dmId,
                conversationId,
                messageCount,
                lastReadCount,
              };
            })
          );
        }),
        filter(
          (
            state
          ): state is {
            userId: string;
            dmId: string;
            conversationId: string;
            messageCount: number;
            lastReadCount: number;
          } => Boolean(state)
        ),
        distinctUntilChanged(
          (a, b) =>
            a.userId === b.userId &&
            a.dmId === b.dmId &&
            a.conversationId === b.conversationId &&
            a.messageCount === b.messageCount &&
            a.lastReadCount === b.lastReadCount
        ),
        filter((state) => state.messageCount > state.lastReadCount),
        switchMap((state) =>
          from(this.setDirectMessageReadStatus(state.userId, state.conversationId, state.messageCount)).pipe(
            catchError((error) => {
              console.error(error);
              return of(null);
            })
          )
        )
      )
      .subscribe();
  }

  private getReadStatusEntriesByUser(userId: string): Observable<ReadStatusEntry[]> {
    if (!this.readStatusEntriesByUserCache.has(userId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const readStatusCollection = collectionGroup(this.firestore, 'readStatus');
        const readStatusQuery = query(readStatusCollection, where('userId', '==', userId));

        return createAuthenticatedFirestoreStream<ReadStatusEntry[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          isUserAllowed: (currentUser) => currentUser.uid === userId,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(readStatusQuery).pipe(
              map((statuses) =>
                (statuses as Array<Record<string, unknown>>).map((status) => ({
                  userId: status['userId'] as string,
                  conversationId: status['conversationId'] as string | undefined,
                  channelId: status['channelId'] as string | undefined,
                  lastReadAt: status['lastReadAt'] as Timestamp | undefined,
                  lastReadCount: (status['lastReadCount'] as number) ?? 0,
                  updatedAt: status['updatedAt'] as Timestamp | undefined,
                  scope: status['scope'] as 'channel' | 'dm' | undefined,
                }))
              )
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
      });

      this.readStatusEntriesByUserCache.set(userId, stream$);
    }

    return this.readStatusEntriesByUserCache.get(userId)!;
  }

  private async setDirectMessageReadStatus(
    userId: string,
    conversationId: string,
    messageCount: number
  ): Promise<void> {
    const readDoc = doc(this.firestore, `directMessages/${conversationId}/readStatus/${userId}`);
    await setDoc(
      readDoc,
      {
        userId,
        conversationId,
        scope: 'dm',
        lastReadAt: serverTimestamp(),
        lastReadCount: messageCount,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  private async setChannelReadStatus(userId: string, channelId: string, messageCount: number): Promise<void> {
    const readDoc = doc(this.firestore, `channels/${channelId}/readStatus/${userId}`);
    await setDoc(
      readDoc,
      {
        userId,
        channelId,
        scope: 'channel',
        lastReadAt: serverTimestamp(),
        lastReadCount: messageCount,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}
