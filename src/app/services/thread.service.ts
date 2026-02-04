import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  docData,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, Subject, combineLatest, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { ChannelService } from './channel.service';
import { UserService } from './user.service';
import { AuthService } from './auth.service';
import type {
  ChannelMessage,
  MessageView,
  ProfilePictureKey,
  ThreadDocument,
  ThreadReply,
  ThreadContext,
  ThreadSource,
  ThreadState,
} from '../types';
import { AuthenticatedFirestoreStreamService } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class ThreadService {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly channelService = inject(ChannelService);
  private readonly firestore = inject(Firestore);
  private readonly authenticatedFirestoreStreamService = inject(AuthenticatedFirestoreStreamService);

  private readonly closeRequests = new Subject<void>();
  readonly closeRequests$ = this.closeRequests.asObservable();
  private readonly threadPanelOpenSubject = new BehaviorSubject(false);
  readonly threadPanelOpen$ = this.threadPanelOpenSubject.asObservable();

  private readonly authUser$ = this.authService.authState$.pipe(startWith(this.authService.auth.currentUser));
  private readonly threadSubject = new BehaviorSubject<ThreadState | null>(null);
  private threadRepliesCache = new Map<string, Observable<ThreadReply[]>>();
  private threadCache = new Map<string, Observable<ThreadDocument | null>>();
  // Feste Dokument-ID für die Thread-Metadaten, damit der Pfad eine gerade Segmentzahl hat:
  // channels/{channelId}/messages/{messageId}/thread/{THREAD_DOC_ID}
  private static readonly THREAD_DOC_ID = 'meta';
  readonly thread$ = this.threadSubject.pipe(
    switchMap((context) => {
      if (!context?.channelId || !context.root.id) return of(null);

      return combineLatest([
        this.getThread(context.channelId, context.root.id),
        this.getThreadReplies(context.channelId, context.root.id),
        this.userService.getAllUsers(),
        this.channelService.getChannel(context.channelId),
        this.channelService.getChannelMessage(context.channelId, context.root.id),
        this.authUser$,
      ]).pipe(
        map(([storedThread, replies, users, channel, rootMessage, authUser]) => {
          if (!authUser) return null;
          const userMap = new Map(users.map((u) => [u.uid, u]));

          const mapUser = (authorId: string) => {
            const user = userMap.get(authorId);
            return {
              authorName: user?.name ?? 'Gelöschter Nutzer',
              profilePictureKey: user!.profilePictureKey,
            };
          };

          const root = this.toRootMessage(context, storedThread, rootMessage, authUser.uid, mapUser);

          return {
            channelId: context.channelId,
            channelTitle: channel?.title ?? 'Unbekannter Channel',
            root,
            replies: replies.map((reply) => this.toThreadMessage(reply, authUser.uid, mapUser)),
          };
        })
      );
    })
  );

  openThread(source: ThreadSource): void {
    this.setThreadState(source.channelId, {
      id: source.id,
      authorId: source.authorId,
      timeLabel: source.timeLabel,
      text: source.text,
    });

    void this.saveThread(source.channelId, source.id, {
      authorId: source.authorId,
      text: source.text,
    });
  }

  loadThread(channelId: string, messageId: string): void {
    const current = this.threadSubject.value;
    if (current && current.channelId === channelId && current.root.id === messageId) return;
    if (!channelId || !messageId) {
      this.reset();
      return;
    }

    this.setThreadState(channelId, {
      id: messageId,
      authorId: '',
      text: '',
      timeLabel: '',
    });
  }

  private setThreadState(
    channelId: string,
    root: { id: string; authorId: string; text: string; timeLabel: string }
  ): void {
    this.threadSubject.next({
      channelId,
      root: {
        id: root.id,
        authorId: root.authorId ?? '',
        timeLabel: root.timeLabel ?? '',
        text: root.text ?? '',
      },
    });
  }

  requestClose(): void {
    this.closeRequests.next();
  }

  setThreadPanelOpen(isOpen: boolean): void {
    this.threadPanelOpenSubject.next(isOpen);
  }

  async addReply(text: string): Promise<void> {
    const current = this.threadSubject.value;
    const user = this.userService.currentUser();
    if (!current || !user) return;

    await this.addThreadReply(current.channelId, current.root.id, {
      authorId: user.uid,
      text,
    });
  }

  reset(): void {
    this.threadSubject.next(null);
  }
  async updateRootMessage(text: string): Promise<void> {
    const current = this.threadSubject.value;
    if (!current?.channelId || !current.root.id) return;

    await Promise.all([
      this.channelService.updateChannelMessage(current.channelId, current.root.id, { text }),
      this.updateThreadMeta(current.channelId, current.root.id, { text }),
    ]);

    this.threadSubject.next({
      ...current,
      root: {
        ...current.root,
        text,
      },
    });
  }

  async updateReply(replyId: string, text: string): Promise<void> {
    const current = this.threadSubject.value;
    if (!current?.channelId || !current.root.id || !replyId) return;

    await this.updateThreadReply(current.channelId, current.root.id, replyId, {
      text,
    });
  }

  private getThreadReplies(channelId: string, messageId: string): Observable<ThreadReply[]> {
    const key = `${channelId}:${messageId}`;

    if (!this.threadRepliesCache.has(key)) {
      const repliesCollection = collection(this.firestore, `channels/${channelId}/messages/${messageId}/threads`);

      const repliesQuery = query(repliesCollection, orderBy('createdAt', 'asc'));

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<ThreadReply[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(repliesQuery, { idField: 'id', serverTimestamps: 'estimate' }).pipe(
              map((replies) => replies as ThreadReply[])
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

      this.threadRepliesCache.set(key, stream$);
    }

    return this.threadRepliesCache.get(key)!;
  }

  private async addThreadReply(
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
      updatedAt: serverTimestamp(),
      reactions: {},
    });

    const messageDoc = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

    await updateDoc(messageDoc, {
      replies: increment(1),
      lastReplyAt: serverTimestamp(),
    });
  }

  private async updateThreadReply(
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

  private async saveThread(
    channelId: string,
    messageId: string,
    payload: Pick<ThreadDocument, 'authorId' | 'text'>
  ): Promise<void> {
    const threadDoc = doc(
      this.firestore,
      `channels/${channelId}/messages/${messageId}/thread/${ThreadService.THREAD_DOC_ID}`
    );

    await setDoc(
      threadDoc,
      {
        authorId: payload.authorId,
        text: payload.text,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  private async updateThreadMeta(
    channelId: string,
    messageId: string,
    payload: Partial<Pick<ThreadDocument, 'text'>>
  ): Promise<void> {
    const threadDoc = doc(
      this.firestore,
      `channels/${channelId}/messages/${messageId}/thread/${ThreadService.THREAD_DOC_ID}`
    );

    await updateDoc(threadDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  private getThread(channelId: string, messageId: string): Observable<ThreadDocument | null> {
    const key = `${channelId}:${messageId}`;

    if (!this.threadCache.has(key)) {
      const threadDocRef = doc(
        this.firestore,
        `channels/${channelId}/messages/${messageId}/thread/${ThreadService.THREAD_DOC_ID}`
      );

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<ThreadDocument | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            docData(threadDocRef, { idField: 'id', serverTimestamps: 'estimate' }).pipe(
              map((data) => {
                if (!data) return null;
                return {
                  ...(data as ThreadDocument),
                };
              })
            ),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));

      this.threadCache.set(key, stream$);
    }

    return this.threadCache.get(key)!;
  }

  private toRootMessage(
    context: ThreadState,
    storedThread: ThreadDocument | null,
    channelMessage: ChannelMessage | null,
    authUserId: string,
    mapUser: (authorId: string) => { authorName: string; profilePictureKey: ProfilePictureKey }
  ): MessageView {
    const authorId = channelMessage?.authorId ?? storedThread?.authorId ?? context.root.authorId;
    const text = channelMessage?.text ?? storedThread?.text ?? context.root.text;
    const timestampSource = channelMessage?.createdAt ? channelMessage : null;
    const createdAt = this.resolveTimestamp(timestampSource ?? null);
    const hasServerTimestamp = !!timestampSource?.createdAt;
    const { authorName, profilePictureKey } = mapUser(authorId);

    return {
      id: context.root.id,
      authorId,
      authorName,
      profilePictureKey,
      timestamp: createdAt,
      timeLabel: hasServerTimestamp ? this.formatTime(createdAt) : context.root.timeLabel,
      text,
      isOwn: authorId === authUserId,
      reactions: channelMessage?.reactions ?? {},
    };
  }

  private toThreadMessage(
    reply: ThreadReply,
    authUserId: string,
    mapUser: (authorId: string) => { authorName: string; profilePictureKey: ProfilePictureKey }
  ): MessageView {
    const createdAt = this.resolveTimestamp(reply);
    const { authorName, profilePictureKey } = mapUser(reply.authorId);
    return {
      id: reply.id,
      authorId: reply.authorId,
      authorName,
      profilePictureKey,
      timestamp: createdAt,
      timeLabel: this.formatTime(createdAt),
      text: reply.text,
      isOwn: reply.authorId === authUserId,
      reactions: reply.reactions,
    };
  }

  private resolveTimestamp(message: ThreadReply | ThreadDocument | ChannelMessage | null): Date {
    if (message?.createdAt instanceof Date) {
      return message.createdAt;
    }
    if (message?.createdAt && 'toDate' in message.createdAt) {
      return (message.createdAt as unknown as { toDate: () => Date }).toDate();
    }

    return new Date();
  }

  private formatTime(date: Date): string {
    const formatter = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return formatter.format(date);
  }

  threadSnapshot(): ThreadState | null {
    return this.threadSubject.value;
  }

}
