import { Injectable, inject } from '@angular/core';
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
import type { Channel, ChannelMessage } from '../types';
import { AuthService } from './auth.service';
import { AuthenticatedFirestoreStreamService } from './authenticated-firestore-stream';

const DEFAULT_CHANNEL_DESCRIPTION = 'Keine Beschreibung.';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  private channelMessagesCache = new Map<string, Observable<ChannelMessage[]>>();
  private channelMessageCache = new Map<string, Observable<ChannelMessage | null>>();
  private channels$?: Observable<Channel[]>;
  private channelCache = new Map<string, Observable<Channel | null>>();

  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly authenticatedFirestoreStreamService = inject(AuthenticatedFirestoreStreamService);

  getChannels(): Observable<Channel[]> {
    if (!this.channels$) {
      this.channels$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<Channel[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => {
            const channelsCollection = collection(this.firestore, 'channels');
            return collectionData(channelsCollection, { idField: 'id', serverTimestamps: 'estimate' }).pipe(
              map((channels) =>
                (channels as Array<Record<string, unknown>>).map((channel) => ({
                  id: (channel['id'] as string) ?? '',
                  title: (channel['title'] as string) ?? 'Unbenannter Channel',
                  description: (channel['description'] as string) ?? DEFAULT_CHANNEL_DESCRIPTION,
                  isPublic: (channel['isPublic'] as boolean) ?? false,
                  messageCount: (channel['messageCount'] as number) ?? 0,
                  lastMessageAt: channel['lastMessageAt'] as Timestamp | undefined,
                }))
              )
            );
          },
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    return this.channels$;
  }

  getChannel(channelId: string): Observable<Channel | null> {
    if (!this.channelCache.has(channelId)) {
      const channelDoc = doc(this.firestore, `channels/${channelId}`);

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<Channel | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            docData(channelDoc, { serverTimestamps: 'estimate' }).pipe(
              map((data) => {
                if (!data) return null;
                const docData = data as Record<string, unknown>;
                return {
                  id: channelId,
                  title: (docData['title'] as string) ?? 'Unbenannter Channel',
                  description: (docData['description'] as string) ?? DEFAULT_CHANNEL_DESCRIPTION,
                  isPublic: (docData['isPublic'] as boolean) ?? false,
                  messageCount: (docData['messageCount'] as number) ?? 0,
                  lastMessageAt: docData['lastMessageAt'] as Timestamp | undefined,
                } as Channel;
              })
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

      this.channelCache.set(channelId, stream$);
    }

    return this.channelCache.get(channelId)!;
  }

  getChannelMessages(channelId: string): Observable<ChannelMessage[]> {
    if (!this.channelMessagesCache.has(channelId)) {
      const messagesCollection = collection(this.firestore, `channels/${channelId}/messages`);

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<ChannelMessage[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(messagesCollection, { idField: 'id', serverTimestamps: 'estimate' }).pipe(
              map((messages) =>
                (messages as any[]).map((message) => {
                  const createdAt = (message.createdAt as Timestamp) ?? Timestamp.now();
                  return {
                    id: message.id,
                    authorId: message.authorId,
                    text: message.text ?? '',
                    createdAt,
                    updatedAt: (message.updatedAt as Timestamp) ?? createdAt,
                    replies: message.replies ?? 0,
                    lastReplyAt: message.lastReplyAt,
                    tag: message.tag,
                    reactions: message.reactions ?? {},
                  };
                })
              )
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

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
      updatedAt: serverTimestamp(),
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

  async createChannel(title: string, description: string, isPublic = false): Promise<string> {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    // Prüfe, ob ein Channel mit diesem Namen bereits existiert
    const nameExists = await this.checkIfChannelNameExists(trimmedTitle);
    if (nameExists) {
      throw new Error('Ein Channel mit diesem Namen existiert bereits. Bitte wähle einen anderen Namen.');
    }

    const channelPayload: Record<string, unknown> = {
      title: trimmedTitle,
      isPublic,
      description: trimmedDescription || DEFAULT_CHANNEL_DESCRIPTION,
      createdAt: serverTimestamp(),
      messageCount: 0,
    };
    const channelsCollection = collection(this.firestore, 'channels');
    const newChannel = await addDoc(channelsCollection, channelPayload);

    return newChannel.id;
  }

  /**
   * Prüft, ob ein Channelname bereits existiert (case-insensitive)
   */
  async checkIfChannelNameExists(title: string): Promise<boolean> {
    const channelsCollection = collection(this.firestore, 'channels');
    const snapshot = await getDocs(channelsCollection);

    const normalizedTitle = title.toLowerCase().trim();
    return snapshot.docs.some((doc) => {
      const data = doc.data() as Channel;
      return data.title?.toLowerCase().trim() === normalizedTitle;
    });
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
      const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<ChannelMessage | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            docData(messageDoc, { serverTimestamps: 'estimate' }).pipe(
              map((data) => {
                if (!data) return null;

                return {
                  id: messageId,
                  authorId: data['authorId'] as string,
                  text: (data['text'] as string) ?? '',
                  createdAt: (data['createdAt'] as Timestamp) ?? Timestamp.now(),
                  replies: (data['replies'] as number) ?? 0,
                  lastReplyAt: data['lastReplyAt'] as Timestamp | undefined,
                  tag: data['tag'] as string | undefined,
                  reactions: (data['reactions'] as Record<string, string[]>) ?? {},
                  updatedAt: (data['updatedAt'] as Timestamp) ?? (data['createdAt'] as Timestamp) ?? Timestamp.now(),
                } as ChannelMessage;
              })
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

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
