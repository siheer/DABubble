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
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import type { AppUser } from './user.service';
import type { Channel, ChannelAttachment, ChannelMessage } from '../types';
import { AuthService } from './auth.service';
import { createAuthenticatedFirestoreStream } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  private channelMessagesCache = new Map<string, Observable<ChannelMessage[]>>();
  private channelMessageCache = new Map<string, Observable<ChannelMessage | null>>();
  private channels$?: Observable<Channel[]>;
  private channelCache = new Map<string, Observable<Channel | null>>();

  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly authService = inject(AuthService);

  getChannels(): Observable<Channel[]> {
    if (!this.channels$) {
      this.channels$ = runInInjectionContext(this.injector, () => {
        return createAuthenticatedFirestoreStream<Channel[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => {
            const channelsCollection = collection(this.firestore, 'channels');
            return collectionData(channelsCollection, { idField: 'id' }).pipe(map((channels) => channels as Channel[]));
          },
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });
    }

    return this.channels$;
  }

  getChannel(channelId: string): Observable<Channel | null> {
    if (!this.channelCache.has(channelId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const channelDoc = doc(this.firestore, `channels/${channelId}`);

        return createAuthenticatedFirestoreStream<Channel | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => docData(channelDoc).pipe(map((data) => (data as Channel) ?? null)),
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });

      this.channelCache.set(channelId, stream$);
    }

    return this.channelCache.get(channelId)!;
  }

  getChannelMessages(channelId: string): Observable<ChannelMessage[]> {
    if (!this.channelMessagesCache.has(channelId)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const messagesCollection = collection(this.firestore, `channels/${channelId}/messages`);

        return createAuthenticatedFirestoreStream<ChannelMessage[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(messagesCollection, { idField: 'id' }).pipe(
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
              )
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
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

  getChannelMessage(channelId: string, messageId: string): Observable<ChannelMessage | null> {
    const key = `${channelId}:${messageId}`;

    if (!this.channelMessageCache.has(key)) {
      const stream$ = runInInjectionContext(this.injector, () => {
        const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

        return createAuthenticatedFirestoreStream<ChannelMessage | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            docData(messageDoc).pipe(
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
              })
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });

      this.channelMessageCache.set(key, stream$);
    }

    return this.channelMessageCache.get(key)!;
  }

  async deleteAllChannelMessagesByAuthor(userId: string): Promise<void> {
    const channelsSnap = await getDocs(collection(this.firestore, 'channels'));

    for (const channel of channelsSnap.docs) {
      const messagesSnap = await getDocs(
        query(collection(this.firestore, `channels/${channel.id}/messages`), where('authorId', '==', userId))
      );

      for (const message of messagesSnap.docs) {
        const threadsSnap = await getDocs(collection(message.ref, 'threads'));
        for (const reply of threadsSnap.docs) {
          await deleteDoc(reply.ref);
        }

        await deleteDoc(message.ref);
      }
    }
  }
}
