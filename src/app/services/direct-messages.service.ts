import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { NOTIFICATIONS } from '../notifications';
import type { DirectMessage, DirectMessageEntry, DirectMessageMeta } from '../types';
import { AuthService } from './auth.service';
import { createAuthenticatedFirestoreStream } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class DirectMessagesService {
  private directMessagesCache = new Map<string, Observable<DirectMessageEntry[]>>();
  private directMessages$?: Observable<DirectMessage[]>;
  private directMessageMetaCache = new Map<string, Observable<DirectMessageMeta[]>>();

  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  getDirectMessages(): Observable<DirectMessage[]> {
    if (!this.directMessages$) {
      this.directMessages$ = runInInjectionContext(this.injector, () => {
        return createAuthenticatedFirestoreStream<DirectMessage[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => {
            const usersCollection = collection(this.firestore, 'users');
            return collectionData(usersCollection, { idField: 'id' }).pipe(
              map((users) =>
                (users as any[]).map((user) => ({
                  id: user.id ?? 'unbekannt',
                  name: user.name ?? 'Unbenannter Nutzer',
                  email: user.email ?? null,
                  photoUrl: user.photoUrl ?? null,
                }))
              )
            );
          },
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });
    }

    return this.directMessages$;
  }

  getDirectMessageMetas(userId: string): Observable<DirectMessageMeta[]> {
    if (!this.directMessageMetaCache.has(userId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const metaCollection = collection(this.firestore, 'directMessages');
        const metaQuery = query(metaCollection, where('participants', 'array-contains', userId));

        return createAuthenticatedFirestoreStream<DirectMessageMeta[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          isUserAllowed: (currentUser) => currentUser.uid === userId,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(metaQuery, { idField: 'id' }).pipe(
              map((metas) =>
                (metas as Array<Record<string, unknown>>).map((meta) => ({
                  id: meta['id'] as string,
                  participants: (meta['participants'] as string[]) ?? [],
                  messageCount: (meta['messageCount'] as number) ?? 0,
                  lastMessageAt: meta['lastMessageAt'] as Timestamp | undefined,
                  lastMessageAuthorId: meta['lastMessageAuthorId'] as string | undefined,
                }))
              )
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
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
        createAuthenticatedFirestoreStream<DirectMessageEntry[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          isUserAllowed: (currentUser) => currentUser.uid === currentUserId,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(messagesQuery, { idField: 'id' }).pipe(
              map((messages) =>
                (messages as Array<Record<string, unknown>>).map((message) => ({
                  id: message['id'] as string,
                  authorId: message['authorId'] as string,
                  authorName: (message['authorName'] as string) ?? 'Unbekannter Nutzer',
                  authorAvatar: (message['authorAvatar'] as string) ?? 'imgs/default-profile-picture.png',
                  text: (message['text'] as string) ?? '',
                  createdAt: message['createdAt'] as Timestamp,
                  reactions: (message['reactions'] as Record<string, string[]>) ?? {},
                }))
              )
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: true }))
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
      reactions: {},
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

  async deleteAllDirectMessagesByParticipant(userId: string): Promise<void> {
    const conversationsSnap = await getDocs(
      query(collection(this.firestore, 'directMessages'), where('participants', 'array-contains', userId))
    );

    const results = await Promise.allSettled(
      conversationsSnap.docs.map(async (conversationDoc) => {
        const messagesSnap = await getDocs(collection(conversationDoc.ref, 'messages'));
        await Promise.all(messagesSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));

        const readStatusSnap = await getDocs(collection(conversationDoc.ref, 'readStatus'));
        await Promise.all(readStatusSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));

        await deleteDoc(conversationDoc.ref);
      })
    );

    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((failure) => console.error(NOTIFICATIONS.DIRECT_MESSAGES_DELETE_FAILED, failure));

    if (failures.length) {
      throw new Error(NOTIFICATIONS.DIRECT_MESSAGES_DELETE_FAILED);
    }
  }
}
