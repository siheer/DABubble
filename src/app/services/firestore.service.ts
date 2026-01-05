import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDocs,
  writeBatch,
  serverTimestamp,
  setDoc,
  updateDoc,
  increment,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import type { AppUser } from './user.service';
export interface Channel {
  id?: string;
  title?: string;
  description?: string;
}
export interface ChannelAttachment {
  title?: string;
  description?: string;
  linkLabel?: string;
  linkHref?: string;
  badgeLabel?: string;
}

export interface ThreadReply {
  id?: string;
  authorId: string;
  text: string;
  createdAt?: any;
  isOwn?: boolean;
}

export interface ThreadDocument {
  authorId: string;
  text: string;
  createdAt?: any;
  channelTitle?: string;
}

export interface ChannelMessage {
  id?: string;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  text?: string;
  replies?: number;
  lastReplyAt?: Timestamp;
  tag?: string;
  attachment?: ChannelAttachment;
}

export interface DirectMessage {
  id: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
}

export interface DirectMessageEntry {
  id?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  text?: string;
  createdAt?: Timestamp;
}
export interface DirectMessageReadStatus {
  userId: string;
  lastReadAt?: Timestamp;
  updatedAt?: Timestamp;
}
export interface ChannelMember {
  id: string;
  name: string;
  avatar: string;
  subtitle?: string;
  addedAt?: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private directMessagesCache = new Map<string, Observable<DirectMessageEntry[]>>();
  private readStatusCache = new Map<string, Observable<Timestamp | null>>();
  private channelMessagesCache = new Map<string, Observable<ChannelMessage[]>>();
  private channelMembersCache = new Map<string, Observable<ChannelMember[]>>();
  private threadRepliesCache = new Map<string, Observable<ThreadReply[]>>();
  private threadCache = new Map<string, Observable<ThreadDocument | null>>();

  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  // Feste Dokument-ID für die Thread-Metadaten, damit der Pfad eine gerade Segmentzahl hat:
  // channels/{channelId}/messages/{messageId}/thread/{THREAD_DOC_ID}
  private static readonly THREAD_DOC_ID = 'meta';
  private static readonly DEFAULT_CHANNELS: Array<Pick<Channel, 'title' | 'description'>> = [
    { title: 'Willkommen' },
    { title: 'Allgemeines' },
    { title: 'Meetings' },
  ];

  getChannels(): Observable<Channel[]> {
    return runInInjectionContext(this.injector, () => {
      const channelsCollection = collection(this.firestore, 'channels');
      return collectionData(channelsCollection, { idField: 'id' }).pipe(
        map((channels) => channels as Channel[]),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    });
  }

  getChannelsForUser(userId: string): Observable<Channel[]> {
    return this.getChannels().pipe(
      switchMap((channels) => {
        if (!channels.length) {
          return of<Channel[]>([]);
        }

        const channelsWithMembers$ = channels
          .filter((channel): channel is Channel & { id: string } => !!channel.id)
          .map((channel) => this.getChannelMembers(channel.id).pipe(map((members) => ({ channel, members }))));

        if (!channelsWithMembers$.length) {
          return of<Channel[]>([]);
        }

        return combineLatest(channelsWithMembers$).pipe(
          map((results) =>
            results
              .filter(({ members }) => members.length > 0 && members.some((member) => member.id === userId))
              .map(({ channel }) => channel)
          )
        );
      })
    );
  }

  getChannelMessages(channelId: string): Observable<ChannelMessage[]> {
    if (!this.channelMessagesCache.has(channelId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const messagesCollection = collection(this.firestore, `channels/${channelId}/messages`);

        return collectionData(messagesCollection, { idField: 'id' }).pipe(
          map((messages) =>
            (messages as any[]).map((message) => ({
              id: message.id,
              authorId: message.authorId,
              text: message.text ?? '',
              createdAt: message.createdAt,
              replies: message.replies ?? 0,
              lastReplyAt: message.lastReplyAt,
              tag: message.tag,
              attachment: message.attachment,
              updatedAt: message.updatedAt,
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      });

      this.channelMessagesCache.set(channelId, stream$);
    }

    return this.channelMessagesCache.get(channelId)!;
  }

  async addChannelMessage(channelId: string, message: Pick<ChannelMessage, 'text' | 'authorId'>): Promise<void> {
    const messagesCollection = collection(this.firestore, `channels/${channelId}/messages`);

    await addDoc(messagesCollection, {
      authorId: message.authorId,
      text: message.text,
      createdAt: serverTimestamp(),
      replies: 0,
    });
  }

  async updateChannelMessage(
    channelId: string,
    messageId: string,
    payload: Partial<Pick<ChannelMessage, 'text'>>
  ): Promise<void> {
    const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

    await updateDoc(messageDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  getChannelMessagesResolved(
    channelId: string,
    users$: Observable<AppUser[]>
  ): Observable<(ChannelMessage & { author?: AppUser })[]> {
    return combineLatest([this.getChannelMessages(channelId), users$]).pipe(
      map(([messages, users]) =>
        messages.map((msg) => ({
          ...msg,
          author: users.find((u) => u.uid === msg.authorId),
        }))
      )
    );
  }

  getFirstChannelTitle(): Observable<string> {
    return this.getChannels().pipe(
      map((channels) => {
        const [firstChannel] = channels;
        return firstChannel?.title ?? 'Unbenannter Channel';
      })
    );
  }

  getDirectMessages(): Observable<DirectMessage[]> {
    return runInInjectionContext(this.injector, () => {
      const usersCollection = collection(this.firestore, 'users');

      return collectionData(usersCollection, { idField: 'id' }).pipe(
        map((users) =>
          (users as any[]).map((user) => ({
            id: user.id ?? 'unbekannt',
            name: user.name ?? 'Unbenannter Nutzer',
            email: user.email ?? null,
            photoUrl: user.photoUrl ?? null,
          }))
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    });
  }

  getDirectConversationMessages(currentUserId: string, otherUserId: string): Observable<DirectMessageEntry[]> {
    const conversationId = this.buildConversationId(currentUserId, otherUserId);
    if (!this.directMessagesCache.has(conversationId)) {
      const messagesCollection = collection(this.firestore, `directMessages/${conversationId}/messages`);

      const messagesQuery = query(messagesCollection, orderBy('createdAt', 'asc'));

      const stream$ = runInInjectionContext(this.injector, () =>
        collectionData(messagesQuery, { idField: 'id' }).pipe(
          map((messages) =>
            (messages as Array<Record<string, unknown>>).map((message) => ({
              id: message['id'] as string,
              authorId: message['authorId'] as string,
              authorName: (message['authorName'] as string) ?? 'Unbekannter Nutzer',
              authorAvatar: (message['authorAvatar'] as string) ?? 'imgs/default-profile-picture.png',
              text: (message['text'] as string) ?? '',
              createdAt: message['createdAt'] as Timestamp,
            }))
          ),
          catchError(() => of([])),
          shareReplay({ bufferSize: 1, refCount: true })
        )
      );

      this.directMessagesCache.set(conversationId, stream$);
    }

    return this.directMessagesCache.get(conversationId)!;
  }

  getDirectMessageReadStatus(currentUserId: string, otherUserId: string): Observable<Timestamp | null> {
    const conversationId = this.buildConversationId(currentUserId, otherUserId);
    const key = `${conversationId}:${currentUserId}`;

    if (!this.readStatusCache.has(key)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const readDoc = doc(this.firestore, `directMessages/${conversationId}/readStatus/${currentUserId}`);

        return docData(readDoc).pipe(
          map((data) => (data as DirectMessageReadStatus)?.lastReadAt ?? null),
          catchError(() => of(null)),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      });

      this.readStatusCache.set(key, stream$);
    }

    return this.readStatusCache.get(key)!;
  }

  async updateDirectMessageReadStatus(currentUserId: string, otherUserId: string): Promise<void> {
    const conversationId = this.buildConversationId(currentUserId, otherUserId);
    const readDoc = doc(this.firestore, `directMessages/${conversationId}/readStatus/${currentUserId}`);

    await setDoc(
      readDoc,
      {
        userId: currentUserId,
        lastReadAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async sendDirectMessage(
    currentUser: Pick<DirectMessageEntry, 'authorId' | 'authorName' | 'authorAvatar'> & { text: string },
    recipientId: string
  ): Promise<void> {
    const conversationId = this.buildConversationId(currentUser.authorId ?? '', recipientId);
    const messagesCollection = collection(this.firestore, `directMessages/${conversationId}/messages`);

    await addDoc(messagesCollection, {
      ...currentUser,
      text: currentUser.text,
      createdAt: serverTimestamp(),
    });
  }

  async updateDirectMessage(
    currentUserId: string,
    otherUserId: string,
    messageId: string,
    payload: Partial<Pick<DirectMessageEntry, 'text'>>
  ): Promise<void> {
    const conversationId = this.buildConversationId(currentUserId, otherUserId);
    const messageDoc = doc(this.firestore, `directMessages/${conversationId}/messages/${messageId}`);

    await updateDoc(messageDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }
  private buildConversationId(userA: string, userB: string): string {
    return [userA, userB].sort((a, b) => a.localeCompare(b)).join('__');
  }

  async createChannel(title: string, description?: string): Promise<string> {
    const trimmedTitle = title.trim();
    const trimmedDescription = description?.trim();

    const channelPayload: Record<string, unknown> = {
      title: trimmedTitle,
      createdAt: serverTimestamp(),
    };

    if (trimmedDescription) {
      channelPayload['description'] = trimmedDescription;
    }

    const channelsCollection = collection(this.firestore, 'channels');
    const newChannel = await addDoc(channelsCollection, channelPayload);

    return newChannel.id;
  }

  private async ensureDefaultChannels(): Promise<Map<string, string>> {
    const channelsCollection = collection(this.firestore, 'channels');
    const snapshot = await getDocs(channelsCollection);
    const existingByTitle = new Map<string, string>();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Channel;
      if (data.title) existingByTitle.set(data.title, docSnap.id);
    });

    const channelIds = new Map(existingByTitle);

    for (const channel of FirestoreService.DEFAULT_CHANNELS) {
      const title = channel.title?.trim();
      if (!title) continue;

      if (channelIds.has(title)) continue;

      // ✅ Payload ohne undefined bauen
      const payload: Record<string, unknown> = {
        title,
        createdAt: serverTimestamp(),
        isDefault: true,
      };

      const description = channel.description?.trim();
      if (description) payload['description'] = description;

      const newChannel = await addDoc(channelsCollection, payload);
      channelIds.set(title, newChannel.id);
    }

    return channelIds;
  }
  async ensureDefaultChannelMembership(user: AppUser): Promise<void> {
    const channelIds = await this.ensureDefaultChannels();

    const memberships = FirestoreService.DEFAULT_CHANNELS.map((channel) => {
      const channelId = channel.title ? channelIds.get(channel.title) : undefined;
      if (!channelId) return undefined;

      // ✅ payload ohne subtitle bauen
      const memberPayload: Pick<ChannelMember, 'id' | 'name' | 'avatar' | 'subtitle'> = {
        id: user.uid,
        name: user.name,
        avatar: user.photoUrl,
      };

      // ✅ subtitle nur setzen, wenn email wirklich ein string ist
      if (user.email) {
        memberPayload.subtitle = user.email;
      }

      return this.upsertChannelMember(channelId, memberPayload);
    }).filter((p): p is Promise<void> => Boolean(p));

    if (!memberships.length) return;
    await Promise.all(memberships);
  }
  async ensureDefaultChannelMembershipForAllUsers(): Promise<void> {
    const channelIds = await this.ensureDefaultChannels();
    if (!channelIds.size) return;

    const usersCollection = collection(this.firestore, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    if (usersSnapshot.empty) return;

    const defaultChannelIds = FirestoreService.DEFAULT_CHANNELS.map((channel) =>
      channel.title ? channelIds.get(channel.title) : undefined
    ).filter((id): id is string => Boolean(id));
    if (!defaultChannelIds.length) return;
    let batch = writeBatch(this.firestore);
    let operationCount = 0;

    const commitBatch = async (): Promise<void> => {
      if (!operationCount) return;
      await batch.commit();
      batch = writeBatch(this.firestore);
      operationCount = 0;
    };

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data() as AppUser;
      const userId = userData.uid ?? userDoc.id;
      if (!userId) continue;

      const basePayload: Record<string, unknown> = {
        id: userId,
        name: userData.name ?? 'Unbekannter Nutzer',
        avatar: userData.photoUrl ?? 'imgs/users/placeholder.svg',
        addedAt: serverTimestamp(),
      };

      if (userData.email) {
        basePayload['subtitle'] = userData.email;
      }

      for (const channelId of defaultChannelIds) {
        const memberDoc = doc(this.firestore, `channels/${channelId}/members/${userId}`);
        batch.set(memberDoc, basePayload, { merge: true });
        operationCount += 1;

        if (operationCount >= 450) {
          await commitBatch();
        }
      }
    }

    await commitBatch();
  }

  async updateChannel(channelId: string, payload: Partial<Pick<Channel, 'title' | 'description'>>): Promise<void> {
    const updates: Record<string, unknown> = {};

    if (payload.title !== undefined) {
      updates['title'] = payload.title.trim();
    }

    if (payload.description !== undefined) {
      updates['description'] = payload.description.trim();
    }

    if (!Object.keys(updates).length) {
      return;
    }

    const channelDoc = doc(this.firestore, `channels/${channelId}`);
    await updateDoc(channelDoc, updates);
  }

  getChannelMembers(channelId: string): Observable<ChannelMember[]> {
    if (!this.channelMembersCache.has(channelId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const membersCollection = collection(this.firestore, `channels/${channelId}/members`);

        return collectionData(membersCollection, { idField: 'id' }).pipe(
          map((members) =>
            (members as Array<Record<string, unknown>>).map((member) => ({
              id: member['id'] as string,
              name: (member['name'] as string) ?? 'Unbekannter Nutzer',
              avatar: (member['avatar'] as string) ?? 'imgs/users/placeholder.svg',
              subtitle: member['subtitle'] as string | undefined,
              addedAt: member['addedAt'] as Timestamp | undefined,
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      });

      this.channelMembersCache.set(channelId, stream$);
    }

    return this.channelMembersCache.get(channelId)!;
  }

  async upsertChannelMember(
    channelId: string,
    member: Pick<ChannelMember, 'id' | 'name' | 'avatar' | 'subtitle'>
  ): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const memberDoc = doc(this.firestore, `channels/${channelId}/members/${member.id}`);

      // ✅ payload bauen ohne undefined
      const payload: Record<string, unknown> = {
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        addedAt: serverTimestamp(),
      };

      if (member.subtitle) {
        payload['subtitle'] = member.subtitle;
      }

      await setDoc(memberDoc, payload, { merge: true });
    });
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

  getThreadReplies(channelId: string, messageId: string): Observable<ThreadReply[]> {
    const key = `${channelId}:${messageId}`;

    if (!this.threadRepliesCache.has(key)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const repliesCollection = collection(this.firestore, `channels/${channelId}/messages/${messageId}/threads`);

        const repliesQuery = query(repliesCollection, orderBy('createdAt', 'asc'));

        return collectionData(repliesQuery, { idField: 'id' }).pipe(
          map((replies) =>
            (replies as any[]).map((reply) => ({
              id: reply.id,
              authorId: reply.authorId,
              text: reply.text ?? '',
              createdAt: reply.createdAt,
              isOwn: reply.isOwn,
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      });

      this.threadRepliesCache.set(key, stream$);
    }

    return this.threadRepliesCache.get(key)!;
  }

  async addThreadReply(
    channelId: string,
    messageId: string,
    reply: Pick<ThreadReply, 'authorId' | 'text' | 'isOwn'>
  ): Promise<void> {
    const repliesCollection = collection(this.firestore, `channels/${channelId}/messages/${messageId}/threads`);

    await addDoc(repliesCollection, {
      authorId: reply.authorId,
      text: reply.text,
      isOwn: reply.isOwn ?? false,
      createdAt: serverTimestamp(),
    });

    const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

    await updateDoc(messageDoc, {
      replies: increment(1),
      lastReplyAt: serverTimestamp(),
    });
  }
  async updateThreadReply(
    channelId: string,
    messageId: string,
    replyId: string,
    payload: Partial<Pick<ThreadReply, 'text'>>
  ): Promise<void> {
    const replyDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}/threads/${replyId}`);

    await updateDoc(replyDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  async saveThread(
    channelId: string,
    messageId: string,
    payload: Pick<ThreadDocument, 'authorId' | 'text' | 'channelTitle'>
  ): Promise<void> {
    const threadDoc = doc(
      this.firestore,
      `channels/${channelId}/messages/${messageId}/thread/${FirestoreService.THREAD_DOC_ID}`
    );

    await setDoc(
      threadDoc,
      {
        authorId: payload.authorId,
        text: payload.text,
        channelTitle: payload.channelTitle,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async updateThreadMeta(
    channelId: string,
    messageId: string,
    payload: Partial<Pick<ThreadDocument, 'text' | 'channelTitle'>>
  ): Promise<void> {
    const threadDoc = doc(
      this.firestore,
      `channels/${channelId}/messages/${messageId}/thread/${FirestoreService.THREAD_DOC_ID}`
    );

    await updateDoc(threadDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  getThread(channelId: string, messageId: string): Observable<ThreadDocument | null> {
    const key = `${channelId}:${messageId}`;

    if (!this.threadCache.has(key)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const threadDocRef = doc(
          this.firestore,
          `channels/${channelId}/messages/${messageId}/thread/${FirestoreService.THREAD_DOC_ID}`
        );

        return docData(threadDocRef, { idField: 'id' }).pipe(
          map((data) => (data as ThreadDocument) ?? null),
          catchError(() => of(null)),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      });

      this.threadCache.set(key, stream$);
    }

    return this.threadCache.get(key)!;
  }
}
