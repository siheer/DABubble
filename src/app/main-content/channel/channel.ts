import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  Observable,
  combineLatest,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import {
  Channel,
  ChannelAttachment,
  ChannelMessage,
  ChannelMember,
  FirestoreService,
} from '../../services/firestore.service';
import { OverlayService } from '../../services/overlay.service';
import { ChannelDescription } from '../messages/channel-description/channel-description';
import { ChannelSelectionService } from '../../services/channel-selection.service';
import { UserService } from '../../services/user.service';
import { ChannelMembers } from './channel-members/channel-members';
import { AddToChannel } from './add-to-channel/add-to-channel';
import { ThreadService } from '../../services/thread.service';

type ChannelDay = {
  label: string;
  sortKey: number;
  messages: ChannelMessageView[];
};

export type ChannelMessageView = {
  id?: string;
  author: string;
  avatar: string;
  createdAt: Date;
  time: string;
  text: string;
  replies?: number;
  tag?: string;
  attachment?: ChannelAttachment;
};
type ChannelMemberView = ChannelMember & { isCurrentUser?: boolean };

@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './channel.html',
  // Angular prefers the plural key
  styleUrls: ['./channel.scss'],
})
export class ChannelComponent {
  private readonly firestoreService = inject(FirestoreService);
  private readonly overlayService = inject(OverlayService);
  private readonly channelSelectionService = inject(ChannelSelectionService);
  private readonly userService = inject(UserService);
  private readonly threadService = inject(ThreadService);
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

  protected readonly currentUser = {
    name: 'Du',
    avatar: this.memberAvatars[0] ?? 'imgs/users/placeholder.svg',
  };
  private readonly channels$ = this.firestoreService
    .getChannels()
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  protected messageText = '';
  protected isSending = false;


  protected readonly channel$: Observable<Channel | undefined> = combineLatest([
    this.channelSelectionService.selectedChannelId$,
    this.channels$,
  ]).pipe(
    tap(([selectedChannelId, channels]) => {
      if (!selectedChannelId && channels.length > 0) {
        const firstChannelId = channels[0]?.id;
        this.channelSelectionService.selectChannel(firstChannelId);
      }
    }),
    map(([selectedChannelId, channels]) => {
      if (!channels.length) return undefined;
      if (selectedChannelId) {
        const activeChannel = channels.find(
          (channel) => channel.id === selectedChannelId
        );

        if (activeChannel) return activeChannel;
      }

      return channels[0];
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );


  protected readonly channelTitle$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.title ?? this.channelDefaults.name)
  );

  protected readonly channelDescription$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.description ?? this.channelDefaults.summary)
  );

  protected readonly members$: Observable<ChannelMemberView[]> = this.channel$.pipe(
    switchMap((channel) => {
      if (!channel?.id) {
        return of<ChannelMemberView[]>([]);
      }

      return this.firestoreService.getChannelMembers(channel.id).pipe(
        map((members) => {
          const currentUserId = this.userService.currentUser()?.uid;

          return members.map((member) => ({
            id: member.id,
            name: member.name,
            avatar: member.avatar || 'imgs/users/placeholder.svg',
            subtitle: member.subtitle,
            isCurrentUser: member.id === currentUserId,
          }));
        })
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
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

  protected sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.isSending) return;

    this.isSending = true;

    this.channel$
      .pipe(
        take(1),
        switchMap((channel) => {
          if (!channel?.id) {
            return of(null);
          }
          return from(
            this.firestoreService.addChannelMessage(channel.id, {
              text,
              author: this.currentUser.name,
              avatar: this.currentUser.avatar,
            })
          );
        })
      )
      .subscribe({
        next: () => {
          this.messageText = '';
        },
        error: (error: unknown) => {
          console.error('Fehler beim Senden der Nachricht', error);
        },
        complete: () => {
          this.isSending = false;
        },
      });
  }

  private toViewMessage(message: ChannelMessage): ChannelMessageView {
    const createdAt = this.resolveTimestamp(message);

    return {
      id: message.id,
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
    if (message.createdAt && 'toDate' in (message.createdAt as any)) {
      return (message.createdAt as any).toDate();
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

  protected openChannelDescription(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;

    this.channel$.pipe(take(1)).subscribe((channel) => {
      const resolvedChannel = channel ?? {
        title: this.channelDefaults.name,
        description: this.channelDefaults.summary,
      };

      this.overlayService.open(ChannelDescription, {
        target: target ?? undefined,
        offsetY: 8,
        data: {
          channelId: resolvedChannel.id,
          title: resolvedChannel.title ?? this.channelDefaults.name,
          description: resolvedChannel.description ?? this.channelDefaults.summary,
        },
      });
    });
  }
  protected openThread(message: ChannelMessageView): void {
    this.threadService.openThread({
      id: message.id,
      author: message.author,
      avatar: message.avatar,
      time: message.time,
      text: message.text,
    });
  }

  protected openChannelMembers(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;

    combineLatest([this.channel$, this.channelTitle$, this.members$])
      .pipe(take(1))
      .subscribe(([channel, title, members]) => {
        this.overlayService.open(ChannelMembers, {
          target: target ?? undefined,
          offsetY: 8,
          data: { channelId: channel?.id, title, members },
        });
      });
  }

  protected openAddToChannel(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;

    combineLatest([this.channel$, this.channelTitle$, this.members$]).pipe(take(1))
      .subscribe(([channel, title, members]) => {
        this.overlayService.open(AddToChannel, {
          target: target ?? undefined,
          offsetY: 8,
          data: { channelId: channel?.id, channelTitle: title, members },
        });
      });
  }
}