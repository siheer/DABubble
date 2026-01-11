import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
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
import {
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  filter,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';
import { ChannelService } from './channel.service';
import { UserService } from './user.service';
import { AuthService } from './auth.service';
import type { ChannelMessage, ThreadDocument, ThreadReply, ThreadContext, ThreadSource, ThreadMessage } from '../types';
import type { User } from '@angular/fire/auth';
import { createAuthenticatedFirestoreStream } from './authenticated-firestore-stream';

@Injectable({ providedIn: 'root' })
export class ThreadService {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly channelService = inject(ChannelService);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private readonly closeRequests = new Subject<void>();
  readonly closeRequests$ = this.closeRequests.asObservable();

  private readonly authUser$ = this.authService.authState$.pipe(
    startWith(this.authService.auth.currentUser),
    filter((user): user is User => !!user)
  );
  private readonly threadSubject = new BehaviorSubject<ThreadContext | null>(null);
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
          const userMap = new Map(users.map((u) => [u.uid, u]));

          const mapUser = (authorId: string) => {
            const user = userMap.get(authorId);
            return {
              authorName: user?.name ?? 'Gelöschter Nutzer',
              avatarUrl: user?.photoUrl,
            };
          };

          const root = this.toRootMessage(context, storedThread, rootMessage, authUser.uid);

          const isOwn = root.authorId === authUser.uid;

          return {
            channelId: context.channelId,
            channelTitle: channel?.title ?? context.channelTitle,
            root: {
              ...root,
              isOwn,
              ...mapUser(root.authorId),
            },
            replies: replies.map((r) => {
              const message = this.toThreadMessage(r);
              return {
                ...message,
                isOwn: r.authorId === authUser.uid,
                ...mapUser(r.authorId),
              };
            }),
          };
        })
      );
    })
  );

  openThread(source: ThreadSource): void {
    const id = source.id ?? this.generateId();
    this.setThreadContext(source.channelId, source.channelTitle, {
      id,
      authorId: source.authorId,
      timestamp: source.time,
      text: source.text,
      isOwn: source.isOwn ?? false,
    });

    void this.saveThread(source.channelId, id, {
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

    this.setThreadContext(channelId, current?.channelId === channelId ? current.channelTitle : '', { id: messageId });
  }

  private setThreadContext(
    channelId: string,
    channelTitle: string,
    root: Partial<ThreadMessage> & { id: string }
  ): void {
    this.threadSubject.next({
      channelId,
      channelTitle,
      root: {
        id: root.id,
        authorId: root.authorId ?? '',
        timestamp: root.timestamp ?? '',
        text: root.text ?? '',
        isOwn: root.isOwn ?? false,
      },
      replies: [],
    });
  }

  requestClose(): void {
    this.closeRequests.next();
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
      const stream$ = runInInjectionContext(this.injector, () => {
        const repliesCollection = collection(this.firestore, `channels/${channelId}/messages/${messageId}/threads`);

        const repliesQuery = query(repliesCollection, orderBy('createdAt', 'asc'));

        return createAuthenticatedFirestoreStream<ThreadReply[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            collectionData(repliesQuery, { idField: 'id' }).pipe(
              map((replies) =>
                (replies as any[]).map((reply) => ({
                  id: reply.id,
                  authorId: reply.authorId,
                  text: reply.text ?? '',
                  createdAt: reply.createdAt,
                  reactions: reply.reactions ?? {},
                }))
              )
            ),
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });

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
      const stream$ = runInInjectionContext(this.injector, () => {
        const threadDocRef = doc(
          this.firestore,
          `channels/${channelId}/messages/${messageId}/thread/${ThreadService.THREAD_DOC_ID}`
        );

        return createAuthenticatedFirestoreStream<ThreadDocument | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () =>
            docData(threadDocRef, { idField: 'id' }).pipe(map((data) => (data as ThreadDocument) ?? null)),
        }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      });

      this.threadCache.set(key, stream$);
    }

    return this.threadCache.get(key)!;
  }

  private toRootMessage(
    context: ThreadContext,
    storedThread: ThreadDocument | null,
    channelMessage: ChannelMessage | null,
    authUserId: string
  ): ThreadMessage {
    const authorId = channelMessage?.authorId ?? storedThread?.authorId ?? context.root.authorId;
    const text = channelMessage?.text ?? storedThread?.text ?? context.root.text;
    const timestampSource = channelMessage?.createdAt ? channelMessage : null;
    const createdAt = this.resolveTimestamp(timestampSource ?? null);
    const hasServerTimestamp = !!timestampSource?.createdAt;

    return {
      id: context.root.id,
      authorId,
      timestamp: hasServerTimestamp ? this.formatTime(createdAt) : context.root.timestamp,
      text,
      isOwn: authorId === authUserId,
      reactions: { ...(channelMessage?.reactions ?? {}) },
    };
  }

  private toThreadMessage(reply: ThreadReply): ThreadMessage {
    const createdAt = this.resolveTimestamp(reply);
    return {
      id: reply.id ?? this.generateId(),
      authorId: reply.authorId,
      timestamp: this.formatTime(createdAt),
      text: reply.text ?? '',
      reactions: reply.reactions ?? {},
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

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  threadSnapshot(): ThreadContext | null {
    return this.threadSubject.value;
  }
}
