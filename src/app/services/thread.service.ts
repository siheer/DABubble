import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreService, ThreadDocument, ThreadReply as FirestoreThreadReply } from './firestore.service';

export interface ThreadMessage {
  id: string;
  author: string;
  avatar: string;
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
  author: string;
  avatar: string;
  time: string;
  text: string;
  isOwn?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ThreadService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly threadSubject = new BehaviorSubject<ThreadContext | null>(null);
  readonly thread$: Observable<ThreadContext | null> = this.threadSubject.pipe(
    switchMap((context) => {
      if (!context?.channelId || !context.root.id) return of(null);

      return combineLatest([
        this.firestoreService.getThread(context.channelId, context.root.id),
        this.firestoreService.getThreadReplies(context.channelId, context.root.id),
      ]).pipe(
        map(([storedThread, replies]) => ({
          channelId: context.channelId,
          channelTitle: storedThread?.channelTitle ?? context.channelTitle,
          root: this.toRootMessage(context, storedThread),
          replies: replies.map((reply) => this.toThreadMessage(reply)),
        }))
      );
    })
  );

  openThread(source: ThreadSource): void {
    const id = this.generateId();
    const context: ThreadContext = {
      channelId: source.channelId,
      channelTitle: source.channelTitle,
      root: {
        id: source.id ?? id,
        author: source.author,
        avatar: source.avatar,
        timestamp: source.time,
        text: source.text,
        isOwn: source.isOwn,
      },
      replies: [],
    };

    this.threadSubject.next(context);

    void this.firestoreService.saveThread(context.channelId, context.root.id, {
      channelTitle: context.channelTitle,
      author: context.root.author,
      avatar: context.root.avatar,
      text: context.root.text,
    });
  }

  loadThread(channelId: string, messageId: string): void {
    if (!channelId || !messageId) {
      this.reset();
      return;
    }

    const context: ThreadContext = {
      channelId,
      channelTitle: '',
      root: {
        id: messageId,
        author: '',
        avatar: 'imgs/users/placeholder.svg',
        timestamp: '',
        text: '',
        isOwn: false,
      },
      replies: [],
    };

    this.threadSubject.next(context);
  }

  async addReply(reply: Omit<ThreadMessage, 'id' | 'timestamp'>): Promise<void> {
    const current = this.threadSubject.value;
    if (!current?.root.id) return;

    await this.firestoreService.addThreadReply(current.channelId, current.root.id, {
      ...reply,
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
      author: storedThread?.author ?? context.root.author,
      avatar: storedThread?.avatar ?? context.root.avatar,
      timestamp: storedThread?.createdAt ? this.formatTime(createdAt) : context.root.timestamp,
      text: storedThread?.text ?? context.root.text,
      isOwn: context.root.isOwn,
    };
  }
  private toThreadMessage(reply: FirestoreThreadReply): ThreadMessage {
    const createdAt = this.resolveTimestamp(reply);
    return {
      id: reply.id ?? this.generateId(),
      author: reply.author ?? 'Unbekannter Nutzer',
      avatar: reply.avatar ?? 'imgs/users/placeholder.svg',
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
