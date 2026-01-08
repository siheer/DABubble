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
  where,
  arrayUnion,
  arrayRemove,
  runTransaction,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import type { AppUser } from './user.service';
export interface Channel {
  id?: string;
  title?: string;
  description?: string;
  isPublic?: boolean;
  messageCount?: number;
  lastMessageAt?: Timestamp;
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
}

export interface ThreadDocument {
  authorId: string;
  text: string;
  createdAt?: any;
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
  reactions?: {
    [emoji: string]: string[];
  };
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
export interface DirectMessageMeta {
  id?: string;
  participants: string[];
  messageCount?: number;
  lastMessageAt?: Timestamp;
  lastMessageAuthorId?: string;
}
export interface ChannelMember {
  id: string;
  name: string;
  avatar: string;
  subtitle?: string;
  addedAt?: Timestamp;
  channelId?: string;
  scope?: 'channel';
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private directMessagesCache = new Map<string, Observable<DirectMessageEntry[]>>();
  private directMessages$?: Observable<DirectMessage[]>;
  private directMessageMetaCache = new Map<string, Observable<DirectMessageMeta[]>>();
  private channelMessagesCache = new Map<string, Observable<ChannelMessage[]>>();
  private channelMembersCache = new Map<string, Observable<ChannelMember[]>>();
  private threadRepliesCache = new Map<string, Observable<ThreadReply[]>>();
  private threadCache = new Map<string, Observable<ThreadDocument | null>>();
  private channelMessageCache = new Map<string, Observable<ChannelMessage | null>>();
  private channels$?: Observable<Channel[]>;
  private channelCache = new Map<string, Observable<Channel | null>>();

  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  // Feste Dokument-ID für die Thread-Metadaten, damit der Pfad eine gerade Segmentzahl hat:
  // channels/{channelId}/messages/{messageId}/thread/{THREAD_DOC_ID}
  private static readonly THREAD_DOC_ID = 'meta';

  getChannels(): Observable<Channel[]> {
    if (!this.channels$) {
      this.channels$ = runInInjectionContext(this.injector, () => {
        const channelsCollection = collection(this.firestore, 'channels');
        return collectionData(channelsCollection, { idField: 'id' }).pipe(
          map((channels) => channels as Channel[]),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });
    }

    return this.channels$;
  }

  getChannel(channelId: string): Observable<Channel | null> {
    if (!this.channelCache.has(channelId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const channelDoc = doc(this.firestore, `channels/${channelId}`);

        return docData(channelDoc).pipe(
          map((data) => (data as Channel) ?? null),
          catchError((error) => {
            console.error(error);
            return of(null);
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.channelCache.set(channelId, stream$);
    }

    return this.channelCache.get(channelId)!;
  }

  getChannelsForUser(userId: string): Observable<Channel[]> {
    return this.getChannels().pipe(
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
              reactions: message.reactions ?? {},
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.channelMessagesCache.set(channelId, stream$);
    }

    return this.channelMessagesCache.get(channelId)!;
  }

  async addChannelMessage(channelId: string, message: Pick<ChannelMessage, 'text' | 'authorId'>): Promise<void> {
    const messagesCollection = collection(this.firestore, `channels/${channelId}/messages`);

    await addDoc(messagesCollection, {
      channelId,
      authorId: message.authorId,
      text: message.text,
      createdAt: serverTimestamp(),
      replies: 0,
    });

    const channelDoc = doc(this.firestore, `channels/${channelId}`);
    await updateDoc(channelDoc, {
      messageCount: increment(1),
      lastMessageAt: serverTimestamp(),
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
    if (!this.directMessages$) {
      this.directMessages$ = runInInjectionContext(this.injector, () => {
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
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });
    }

    return this.directMessages$;
  }

  getDirectMessageMetas(userId: string): Observable<DirectMessageMeta[]> {
    if (!this.directMessageMetaCache.has(userId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const metaCollection = collection(this.firestore, 'directMessages');
        const metaQuery = query(metaCollection, where('participants', 'array-contains', userId));

        return collectionData(metaQuery, { idField: 'id' }).pipe(
          map((metas) =>
            (metas as Array<Record<string, unknown>>).map((meta) => ({
              id: meta['id'] as string,
              participants: (meta['participants'] as string[]) ?? [],
              messageCount: (meta['messageCount'] as number) ?? 0,
              lastMessageAt: meta['lastMessageAt'] as Timestamp | undefined,
              lastMessageAuthorId: meta['lastMessageAuthorId'] as string | undefined,
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.directMessageMetaCache.set(userId, stream$);
    }

    return this.directMessageMetaCache.get(userId)!;
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
          catchError((error) => {
            console.error(error);
            return of([]);
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        )
      );

      this.directMessagesCache.set(conversationId, stream$);
    }

    return this.directMessagesCache.get(conversationId)!;
  }

  async sendDirectMessage(
    currentUser: Pick<DirectMessageEntry, 'authorId' | 'authorName' | 'authorAvatar'> & { text: string },
    recipientId: string
  ): Promise<void> {
    const authorId = currentUser.authorId ?? '';
    const conversationId = this.buildConversationId(authorId, recipientId);
    const messagesCollection = collection(this.firestore, `directMessages/${conversationId}/messages`);

    await addDoc(messagesCollection, {
      ...currentUser,
      text: currentUser.text,
      createdAt: serverTimestamp(),
    });

    const metaDoc = doc(this.firestore, `directMessages/${conversationId}`);
    await setDoc(
      metaDoc,
      {
        participants: [authorId, recipientId].filter(Boolean),
        lastMessageAt: serverTimestamp(),
        lastMessageAuthorId: authorId,
        messageCount: increment(1),
      },
      { merge: true }
    );

    if (authorId) {
      const readDoc = doc(this.firestore, `directMessages/${conversationId}/readStatus/${authorId}`);
      await setDoc(
        readDoc,
        {
          userId: authorId,
          conversationId,
          scope: 'dm',
          lastReadAt: serverTimestamp(),
          lastReadCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
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
  buildConversationId(userA: string, userB: string): string {
    return [userA, userB].sort((a, b) => a.localeCompare(b)).join('__');
  }

  async createChannel(title: string, description?: string, isPublic = false): Promise<string> {
    const trimmedTitle = title.trim();
    const trimmedDescription = description?.trim();

    const channelPayload: Record<string, unknown> = {
      title: trimmedTitle,
      createdAt: serverTimestamp(),
      messageCount: 0,
    };

    if (trimmedDescription) {
      channelPayload['description'] = trimmedDescription;
    }
    if (isPublic) {
      channelPayload['isPublic'] = true;
    }

    const channelsCollection = collection(this.firestore, 'channels');
    const newChannel = await addDoc(channelsCollection, channelPayload);

    return newChannel.id;
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
              id: (member['id'] as string) ?? 'unbekannt',
              name: (member['name'] as string) ?? 'Unbekannter Nutzer',
              avatar: (member['avatar'] as string) ?? 'imgs/users/placeholder.svg',
              subtitle: member['subtitle'] as string | undefined,
              addedAt: member['addedAt'] as Timestamp | undefined,
              channelId: (member['channelId'] as string) ?? channelId,
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: false })
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
        channelId,
        scope: 'channel',
        addedAt: serverTimestamp(),
      };

      if (member.subtitle) {
        payload['subtitle'] = member.subtitle;
      }

      await setDoc(memberDoc, payload, { merge: true });
    });
  }

  async syncPublicChannelMembers(channelId: string, users: AppUser[], members: ChannelMember[]): Promise<void> {
    const missingUsers = this.getMissingChannelUsers(users, members);
    if (!missingUsers.length) return;

    await this.addChannelMembersBatch(channelId, missingUsers);
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

  async commitBatch(
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
      name: data.name ?? 'Unbekannter Nutzer',
      avatar: data.photoUrl ?? 'imgs/users/placeholder.svg',
      scope: 'channel',
      addedAt: serverTimestamp(),
      channelId,
    };

    if (data.email) {
      payload['subtitle'] = data.email;
    }

    return payload;
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
            }))
          ),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.threadRepliesCache.set(key, stream$);
    }

    return this.threadRepliesCache.get(key)!;
  }

  async addThreadReply(
    channelId: string,
    messageId: string,
    reply: Pick<ThreadReply, 'authorId' | 'text'>
  ): Promise<void> {
    const repliesCollection = collection(this.firestore, `channels/${channelId}/messages/${messageId}/threads`);

    await addDoc(repliesCollection, {
      channelId,
      parentMessageId: messageId,
      authorId: reply.authorId,
      text: reply.text,
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
    payload: Pick<ThreadDocument, 'authorId' | 'text'>
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
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  getChannelMessage(channelId: string, messageId: string): Observable<ChannelMessage | null> {
    const key = `${channelId}:${messageId}`;

    if (!this.channelMessageCache.has(key)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

        return docData(messageDoc).pipe(
          map((data) => {
            if (!data) return null;

            return {
              id: messageId,
              authorId: data['authorId'] as string,
              text: (data['text'] as string) ?? '',
              createdAt: data['createdAt'] as Timestamp,
              replies: (data['replies'] as number) ?? 0,
              lastReplyAt: data['lastReplyAt'] as Timestamp | undefined,
              tag: data['tag'] as string | undefined,
              attachment: data['attachment'] as ChannelAttachment | undefined,
              updatedAt: data['updatedAt'] as Timestamp | undefined,
            } as ChannelMessage;
          }),
          catchError((error) => {
            console.error(error);
            return of(null);
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.channelMessageCache.set(key, stream$);
    }

    return this.channelMessageCache.get(key)!;
  }

  async updateThreadMeta(
    channelId: string,
    messageId: string,
    payload: Partial<Pick<ThreadDocument, 'text'>>
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
          catchError((error) => {
            console.error(error);
            return of(null);
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      });

      this.threadCache.set(key, stream$);
    }

    return this.threadCache.get(key)!;
  }

  async toggleChannelMessageReaction(
    channelId: string,
    messageId: string,
    userId: string,
    emoji: string,
    hasReacted: boolean
  ): Promise<void> {
    const messageRef = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

    await runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(messageRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const reactions = { ...(data['reactions'] ?? {}) };
      const users: string[] = reactions[emoji] ?? [];

      if (hasReacted) {
        reactions[emoji] = users.filter((id) => id !== userId);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      } else {
        reactions[emoji] = [...new Set([...users, userId])];
      }

      tx.update(messageRef, {
        reactions,
        updatedAt: serverTimestamp(),
      });
    });
  }

}
