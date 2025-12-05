import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map, of, shareReplay, switchMap } from 'rxjs';
import {
  Channel,
  ChannelAttachment,
  ChannelMessage,
  FirestoreService,
} from '../../services/firestore.service';
type ChannelDay = {
  label: string;
  sortKey: number;
  messages: ChannelMessageView[];
};

type ChannelMessageView = {
  author: string;
  avatar: string;
  createdAt: Date;
  time: string;
  text: string;
  replies?: number;
  tag?: string;
  attachment?: ChannelAttachment;
};



@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './channel.html',
  styleUrl: './channel.scss',
})
export class ChannelComponent {
  private readonly firestoreService = inject(FirestoreService);

  protected readonly channelDefaults = {
    name: 'Entwicklerteam',
    summary:
      'Gruppe zum Austausch über technische Fragen und das laufende Redesign des Devspace.',
  };


  protected readonly memberAvatars = [
    'imgs/users/Property 1=Frederik Beck.svg',
    'imgs/users/Property 1=Noah Braun.svg',
    'imgs/users/Property 1=Sofia Müller.svg',
    'imgs/users/Property 1=Elias Neumann.svg',
  ];
  protected readonly channel$: Observable<Channel | undefined> = this.firestoreService
    .getChannels()
    .pipe(
      map((channels) => channels[0]),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  protected readonly channelTitle$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.title ?? this.channelDefaults.name)
  );

  protected readonly channelDescription$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.description ?? this.channelDefaults.summary)
  );

  protected readonly messagesByDay$: Observable<ChannelDay[]> = this.channel$.pipe(
    switchMap((channel) => {
      if (!channel?.id) {
        return of<ChannelDay[]>([]);
      }

      return this.firestoreService.getChannelMessages(channel.id).pipe(
        map((messages) => this.groupMessagesByDay(messages))
      );
    })
  );

  private groupMessagesByDay(messages: ChannelMessage[]): ChannelDay[] {
    const grouped = new Map<string, ChannelDay>();

    messages
      .map((message) => this.toViewMessage(message))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .forEach((message) => {
        const label = this.buildDayLabel(message.createdAt);
        const existingGroup = grouped.get(label);

        if (existingGroup) {
          existingGroup.messages.push(message);
        } else {
          grouped.set(label, {
            label,
            sortKey: message.createdAt.getTime(),
            messages: [message],
          });
        }
      });

    return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey);
  }

  private toViewMessage(message: ChannelMessage): ChannelMessageView {
    const createdAt = this.resolveTimestamp(message);

    return {
      author: message.author ?? 'Unbekannter Nutzer',
      avatar:
        message.avatar ?? this.memberAvatars[0] ?? 'imgs/users/placeholder.svg',
      createdAt,
      time: this.formatTime(createdAt),
      text: message.text ?? '',
      replies: message.replies,
      tag: message.tag,
      attachment: message.attachment,
    };
  }

  private resolveTimestamp(message: ChannelMessage): Date {
    if (message.createdAt && 'toDate' in message.createdAt) {
      return message.createdAt.toDate();
    }

    return new Date();
  }

  private buildDayLabel(date: Date): string {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    if (isToday) {
      return 'Heute';
    }

    const formatter = new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    return formatter.format(date);
  }

  private formatTime(date: Date): string {
    const formatter = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${formatter.format(date)} Uhr`;
  }
}