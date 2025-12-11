import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ThreadMessage {
    id: string;
    author: string;
    avatar: string;
    timestamp: string;
    text: string;
    isOwn?: boolean;
}

export interface ThreadContext {
    root: ThreadMessage;
    replies: ThreadMessage[];
}

export interface ThreadSource {
    id?: string;
    author: string;
    avatar: string;
    time: string;
    text: string;
}

@Injectable({ providedIn: 'root' })
export class ThreadService {
    private readonly threadSubject = new BehaviorSubject<ThreadContext | null>(null);
    readonly thread$ = this.threadSubject.asObservable();

    private readonly demoReplies: ThreadMessage[] = [
        {
            id: 'reply-1',
            author: 'Noah Braun',
            avatar: 'imgs/users/Property 1=Noah Braun.svg',
            timestamp: '10:15',
            text: 'Wir haben gerade die Angular-Version auf 13.2.2 aktualisiert.',
        },
        {
            id: 'reply-2',
            author: 'Sofia Müller',
            avatar: 'imgs/users/Property 1=Sofia Müller.svg',
            timestamp: '10:22',
            text: 'Und ich habe auch das allgemeine Angular-Update durchgeführt.',
        },
    ];

    openThread(source: ThreadSource): void {
        const id = this.generateId();
        const thread: ThreadContext = {
            root: {
                id: source.id ?? id,
                author: source.author,
                avatar: source.avatar,
                timestamp: source.time,
                text: source.text,
            },
            replies: [...this.demoReplies],
        };

        this.threadSubject.next(thread);
    }

    addReply(reply: Omit<ThreadMessage, 'id' | 'timestamp'>): void {
        const current = this.threadSubject.value;
        if (!current) return;

        const timestamp = new Date();
        const formatter = new Intl.DateTimeFormat('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
        });

        const nextReply: ThreadMessage = {
            ...reply,
            id: this.generateId(),
            timestamp: formatter.format(timestamp),
        };

        this.threadSubject.next({ ...current, replies: [...current.replies, nextReply] });
    }

    reset(): void {
        this.threadSubject.next(null);
    }

    private generateId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }

        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}