import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreService, ThreadDocument, ThreadReply as FirestoreThreadReply } from './firestore.service';
import { UserService } from './user.service';

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorName?: string;
  avatarUrl?: string;
  timestamp: string;
  text: string;
  isOwn?: boolean;
}

export interface ThreadContext {
  channelId: string;
  channelTitle: string;
  root: ThreadMessage;
  replies: ThreadMessage[];
}

export interface ThreadSource {
  id?: string;
  channelId: string;
  channelTitle: string;
  authorId: string;
  time: string;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ThreadService {
  private readonly userService = inject(UserService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly threadSubject = new BehaviorSubject<ThreadContext | null>(null);
  readonly thread$ = this.threadSubject.pipe(
    switchMap((context) => {
      if (!context?.channelId || !context.root.id) return of(null);

      return combineLatest([
        this.firestoreService.getThread(context.channelId, context.root.id),
        this.firestoreService.getThreadReplies(context.channelId, context.root.id),
        this.userService.getAllUsers(),
      ]).pipe(
        map(([storedThread, replies, users]) => {
          const userMap = new Map(users.map((u) => [u.uid, u]));

          const mapUser = (authorId: string) => {
            const user = userMap.get(authorId);
            return {
              authorName: user?.name ?? 'Gelöschter Nutzer',
              avatarUrl: user?.photoUrl,
            };
          };

          return {
            channelId: context.channelId,
            channelTitle: storedThread?.channelTitle ?? context.channelTitle,
            root: {
              ...this.toRootMessage(context, storedThread),
              ...mapUser(storedThread?.authorId ?? context.root.authorId),
            },
            replies: replies.map((r) => ({
              ...this.toThreadMessage(r),
              ...mapUser(r.authorId),
            })),
          };
        })
      );
    })
  );

  openThread(source: ThreadSource): void {
    const id = this.generateId();
    const context: ThreadContext = {
      channelId: source.channelId,
      channelTitle: source.channelTitle,
      root: {
        id,
        authorId: source.authorId,
        timestamp: source.time,
        text: source.text,
        isOwn: true,
      },
      replies: [],
    };

    this.threadSubject.next(context);

    void this.firestoreService.saveThread(source.channelId, id, {
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

    const context: ThreadContext = {
      channelId,
      channelTitle: current?.channelId === channelId ? current.channelTitle : '',
      root: {
        id: messageId,
        authorId: current?.root.authorId ?? '',
        timestamp: current?.root.timestamp ?? '',
        text: current?.root.text ?? '',
        isOwn: current?.root.isOwn ?? false,
      },
      replies: [],
    };

    this.threadSubject.next(context);
  }

  async addReply(text: string): Promise<void> {
    const current = this.threadSubject.value;
    const user = this.userService.currentUser();
    if (!current || !user) return;

    await this.firestoreService.addThreadReply(current.channelId, current.root.id, {
      authorId: user.uid,
      text,
      isOwn: true,
    });
  }

  reset(): void {
    this.threadSubject.next(null);
  }
  async updateRootMessage(text: string): Promise<void> {
    const current = this.threadSubject.value;
    if (!current?.channelId || !current.root.id) return;

    await Promise.all([
      this.firestoreService.updateChannelMessage(current.channelId, current.root.id, { text }),
      this.firestoreService.updateThreadMeta(current.channelId, current.root.id, { text }),
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

    await this.firestoreService.updateThreadReply(current.channelId, current.root.id, replyId, {
      text,
    });
  }

  private toRootMessage(context: ThreadContext, storedThread: ThreadDocument | null): ThreadMessage {
    const createdAt = this.resolveTimestamp(storedThread);
    return {
      id: context.root.id,
      authorId: storedThread?.authorId ?? context.root.authorId,
      timestamp: storedThread?.createdAt ? this.formatTime(createdAt) : context.root.timestamp,
      text: storedThread?.text ?? context.root.text,
      isOwn: context.root.isOwn,
    };
  }

  private toThreadMessage(reply: FirestoreThreadReply): ThreadMessage {
    const createdAt = this.resolveTimestamp(reply);
    return {
      id: reply.id ?? this.generateId(),
      authorId: reply.authorId,
      timestamp: this.formatTime(createdAt),
      text: reply.text ?? '',
      isOwn: reply.isOwn,
    };
  }

  private resolveTimestamp(message: FirestoreThreadReply | ThreadDocument | null): Date {
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
}
