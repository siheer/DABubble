import { Component, DestroyRef, ElementRef, NgZone, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import {
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { ChannelService } from '../../services/channel.service';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ChannelMembershipService } from '../../services/membership.service';
import type {
  Channel,
  ChannelAttachment,
  ChannelMessage,
  ChannelMember,
  ChannelMemberView,
  ChannelDay,
  ChannelMessageView,
  ProfilePictureKey,
} from '../../types';
import { OverlayService } from '../../services/overlay.service';
import { ChannelDescription } from '../messages/channel-description/channel-description';
import { AppUser, UserService } from '../../services/user.service';
import { ChannelMembers } from './channel-members/channel-members';
import { AddToChannel } from './add-to-channel/add-to-channel';
import { ThreadService } from '../../services/thread.service';
import { ScreenService } from '../../services/screen.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMOJI_CHOICES } from '../../texts';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ReactionTooltipComponent } from '../tooltip/tooltip';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';
import { DirectMessagesService } from '../../services/direct-messages.service';

type MentionSegment = {
  text: string;
  member?: ChannelMemberView;
};
import { ProfilePictureService } from '../../services/profile-picture.service';

@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSidenavModule, RouterOutlet, MessageReactions],

  templateUrl: './channel.html',
  styleUrls: ['./channel.scss'],
})
export class ChannelComponent {
  private static readonly SYSTEM_PROFILE_PICTURE_KEY: ProfilePictureKey = 'default';
  private static readonly SYSTEM_AUTHOR_NAME = 'System';
  private readonly channelService = inject(ChannelService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly overlayService = inject(OverlayService);
  private readonly userService = inject(UserService);
  private readonly threadService = inject(ThreadService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly dialog = inject(MatDialog);
  private readonly screenService = inject(ScreenService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly overlay = inject(Overlay);
  private readonly reactionTooltipService = inject(ReactionTooltipService);
  private readonly currentUser$ = this.userService.currentUser$;
  private readonly allUsers$ = this.userService.getAllUsers();
  private readonly profilePictureService = inject(ProfilePictureService);

  protected readonly isTabletScreen = this.screenService.isTabletScreen;

  @ViewChild('messageTextarea')
  private messageTextarea?: ElementRef<HTMLTextAreaElement>;
  protected readonly channelDefaults = {
    name: 'Entwicklerteam',
    summary: 'Gruppe zum Austausch über technische Fragen und das laufende Redesign des Devspace.',
  };

  protected allUsersSnapshot: AppUser[] = [];

  private readonly channelId$ = this.route.paramMap.pipe(
    map((params) => params.get('channelId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly channels$ = this.currentUser$.pipe(
    switchMap((user) => (user ? this.membershipService.getChannelsForUser(user.uid) : of(null))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  protected messageText = '';
  protected isSending = false;
  private cachedMembers: ChannelMemberView[] = [];
  protected mentionSuggestions: ChannelMemberView[] = [];
  protected isMentionListVisible = false;
  private mentionTriggerIndex: number | null = null;
  private mentionCaretIndex: number | null = null;
  private lastMessageCount = 0;
  private lastMessageId?: string;
  private shouldScrollOnNextMessage = false;
  private overlayRef?: OverlayRef;
  protected readonly hasThreadChild = signal(false);

  protected readonly channel$: Observable<Channel | undefined> = combineLatest([
    this.currentUser$,
    this.channelId$,
    this.channels$,
  ]).pipe(
    tap(([user, channelId, channels]) => {
      if (!user) return;
      if (!channelId) {
        void this.router.navigate(['/main']);
        return;
      }
      if (!channels) return;

      const channelExists = channels.some((channel) => channel.id === channelId);
      if (!channelExists) {
        void this.router.navigate(['/main']);
      }
    }),
    map(([_, channelId, channels]) => (channels ? channels.find((c) => c.id === channelId) : undefined)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  protected readonly channelTitle$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.title ?? this.channelDefaults.name)
  );

  protected readonly channelDescription$: Observable<string> = this.channel$.pipe(
    map((channel) => channel?.description ?? this.channelDefaults.summary)
  );

  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected channelId: string | null = null;
  protected currentUser: AppUser | null = null;
  private channelMessages?: ElementRef<HTMLElement>;
  private threadSidenav?: MatSidenav;

  @ViewChild('channelMessages')
  set channelMessagesRef(ref: ElementRef<HTMLElement> | undefined) {
    this.channelMessages = ref;
  }

  @ViewChild('threadSidenav')
  set threadSidenavRef(ref: MatSidenav | undefined) {
    this.threadSidenav = ref;
  }

  protected readonly members$: Observable<ChannelMemberView[]> = this.channel$.pipe(
    switchMap((channel) => {
      if (!channel?.id) {
        return of<ChannelMemberView[]>([]);
      }

      return combineLatest([this.membershipService.getChannelMembers(channel.id), this.allUsers$]).pipe(
        map(([members, users]) => {
          const currentUserId = this.userService.currentUser()?.uid;
          const userMap = new Map(users.map((user) => [user.uid, user]));

          return members.map((member) => {
            const user = userMap.get(member.id);
            const avatar = this.profilePictureService.getUrl(user?.profilePictureKey ?? member.profilePictureKey);
            const name = user?.name ?? member.name;

            return {
              id: member.id,
              name,
              profilePictureKey: user?.profilePictureKey ?? member.profilePictureKey ?? 'default',
              subtitle: member.subtitle,
              isCurrentUser: member.id === currentUserId,
              user: user ?? {
                uid: member.id,
                name,
                email: null,
                profilePictureKey: member.profilePictureKey ?? 'default',
                onlineStatus: false,
                lastSeen: undefined,
                updatedAt: undefined,
                createdAt: undefined,
              },
            };
          });
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

      return this.channelService
        .getChannelMessagesResolved(channel.id, this.allUsers$)
        .pipe(map((messages) => this.groupMessagesByDay(messages)));
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor() {
    this.screenService.connect();

    this.channel$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((channel) => {
      this.lastMessageCount = 0;
      this.lastMessageId = undefined;
      this.shouldScrollOnNextMessage = false;
      if (channel?.id) {
        requestAnimationFrame(() => this.focusComposer());
      }
    });

    this.publicChannelMemberSync();

    this.allUsers$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((users) => (this.allUsersSnapshot = users));

    this.members$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((members) => {
      this.cachedMembers = members;
      this.updateMentionSuggestions();
    });

    this.messagesByDay$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((days) => {
      const wasNearBottom = this.isNearBottom();
      const hasNewMessages = this.shouldAutoScroll(days);
      if (!hasNewMessages) return;

      const shouldScroll = this.shouldScrollOnNextMessage || wasNearBottom;
      this.shouldScrollOnNextMessage = false;
      if (shouldScroll) {
        this.scrollToBottom();
      }
    });

    this.highlightRequest$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((highlightId) => {
      if (!highlightId) return;

      this.scrollToHighlightedMessage(highlightId);
    });

    this.channelId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => (this.channelId = id));

    this.userService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => (this.currentUser = user));

    this.router.events
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((event) => {
          if (event instanceof NavigationEnd) {
            this.syncChildRouteState();
          }
        })
      )
      .subscribe();

    this.threadService.closeRequests$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.hasThreadChild()) return;
      if (this.threadSidenav) {
        void this.threadSidenav.close();
      } else {
        this.closeThread();
      }
    });

    this.syncChildRouteState();
  }

  private publicChannelMemberSync(): void {
    this.channel$
      .pipe(
        map((channel) => (channel?.isPublic ? channel.id : null)),
        distinctUntilChanged(),
        switchMap((channelId) => {
          if (!channelId) return of(null);

          return combineLatest([this.allUsers$, this.membershipService.getChannelMembers(channelId)]).pipe(
            switchMap(([users, members]) =>
              from(this.membershipService.syncPublicChannelMembers(channelId, users, members)).pipe(
                catchError((error: unknown) => {
                  console.error(error);
                  return of(null);
                })
              )
            )
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  closeThread(): void {
    if (!this.hasThreadChild()) return;

    const channelId = this.route.snapshot.paramMap.get('channelId');
    this.threadService.reset();

    if (channelId) {
      void this.router.navigate(['/main/channels', channelId]);
    } else {
      void this.router.navigate(['/main']);
    }
  }

  protected updateThreadPanelOpenState(isOpen: boolean): void {
    this.threadService.setThreadPanelOpen(isOpen);
  }

  protected onComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' || keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendMessage();
  }

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

  protected onMessageInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    this.messageText = textarea?.value ?? this.messageText;
    this.mentionCaretIndex = textarea?.selectionStart ?? null;
    this.updateMentionSuggestions();
  }

  protected toggleComposerEmojiPicker(): void {
    this.isComposerEmojiPickerOpen = !this.isComposerEmojiPickerOpen;
    this.focusComposer();
  }

  protected addComposerEmoji(emoji: string): void {
    this.insertComposerText(emoji);
    this.isComposerEmojiPickerOpen = false;
  }

  protected insertComposerMention(): void {
    this.insertComposerText('@');
    this.updateMentionSuggestions();
  }

  protected insertMention(member: ChannelMemberView): void {
    if (this.mentionTriggerIndex === null) return;

    const caret = this.mentionCaretIndex ?? this.messageText.length;
    const before = this.messageText.slice(0, this.mentionTriggerIndex);
    const after = this.messageText.slice(caret);
    const mentionText = `@${member.name} `;

    this.messageText = `${before}${mentionText}${after}`;
    const newCaret = before.length + mentionText.length;

    queueMicrotask(() => {
      const textarea = this.messageTextarea?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionSuggestions();
  }

  protected buildMessageSegments(text: string): MentionSegment[] {
    if (!text) return [{ text: '' }];
    const regex = this.buildMentionRegex();
    if (!regex) return [{ text }];

    const segments: MentionSegment[] = [];
    let lastIndex = 0;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = regex.lastIndex;
      if (matchStart > lastIndex) {
        segments.push({ text: text.slice(lastIndex, matchStart) });
      }

      const mentionName = match[1] ?? '';
      const member = this.cachedMembers.find((entry) => entry.name.toLowerCase() === mentionName.toLowerCase());
      segments.push({ text: match[0], member });
      lastIndex = matchEnd;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex) });
    }

    return segments.length ? segments : [{ text }];
  }

  protected openMemberProfile(member?: ChannelMemberView): void {
    if (!member || member.isCurrentUser) return;

    const fallbackUser: AppUser = member.user ?? {
      uid: member.id,
      name: member.name,
      email: null,
      profilePictureKey: 'default',
      onlineStatus: false,
      lastSeen: undefined,
      updatedAt: undefined,
      createdAt: undefined,
    };

    this.dialog.open(MemberDialog, {
      data: { user: fallbackUser },
    });
  }

  private buildMentionRegex(): RegExp | null {
    if (!this.cachedMembers.length) return null;
    const names = this.cachedMembers
      .map((member) => member.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((name) => this.escapeRegex(name));

    if (!names.length) return null;
    return new RegExp(`@(${names.join('|')})`, 'gi');
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getMentionedMembers(text: string): ChannelMemberView[] {
    const regex = this.buildMentionRegex();
    if (!regex) return [];
    const found = new Map<string, ChannelMemberView>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const mentionName = match[1] ?? '';
      const member = this.cachedMembers.find((entry) => entry.name.toLowerCase() === mentionName.toLowerCase());
      if (member) {
        found.set(member.id, member);
      }
    }

    return Array.from(found.values());
  }
  private focusComposer(): void {
    this.messageTextarea?.nativeElement.focus();
  }

  private insertComposerText(text: string): void {
    const textarea = this.messageTextarea?.nativeElement;
    if (!textarea) {
      this.messageText = `${this.messageText}${text}`;
      this.mentionCaretIndex = this.messageText.length;
      return;
    }

    const start = textarea.selectionStart ?? this.messageText.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.messageText.slice(0, start);
    const after = this.messageText.slice(end);
    this.messageText = `${before}${text}${after}`;
    this.mentionCaretIndex = start + text.length;

    requestAnimationFrame(() => {
      textarea.focus();
      const newCaret = start + text.length;
      textarea.setSelectionRange(newCaret, newCaret);
    });
  }

  private updateMentionSuggestions(): void {
    const caret = this.mentionCaretIndex ?? this.messageText.length;
    const textUpToCaret = this.messageText.slice(0, caret);
    const atIndex = textUpToCaret.lastIndexOf('@');

    if (atIndex === -1) {
      this.resetMentionSuggestions();
      return;
    }

    if (atIndex > 0) {
      const charBefore = textUpToCaret[atIndex - 1];
      if (!/\s/.test(charBefore)) {
        this.resetMentionSuggestions();
        return;
      }
    }

    const query = textUpToCaret.slice(atIndex + 1);

    if (/\s/.test(query)) {
      this.resetMentionSuggestions();
      return;
    }

    const normalizedQuery = query.toLowerCase();

    this.mentionTriggerIndex = atIndex;
    this.mentionSuggestions = this.cachedMembers.filter((member) =>
      member.name.toLowerCase().includes(normalizedQuery)
    );
    this.isMentionListVisible = this.mentionSuggestions.length > 0;
  }

  private resetMentionSuggestions(): void {
    this.isMentionListVisible = false;
    this.mentionSuggestions = [];
    this.mentionTriggerIndex = null;
    this.mentionCaretIndex = null;
  }

  private async notifyMentionedMembers(text: string, channelTitle: string): Promise<void> {
    const currentUser = this.userService.currentUser();
    if (!currentUser) return;

    const mentionedMembers = this.getMentionedMembers(text).filter((member) => member.id !== currentUser.uid);
    if (!mentionedMembers.length) return;

    const formattedTime = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const messageText = `Du wurdest von ${currentUser.name} am ${formattedTime} in #${channelTitle} erwähnt.`;

    await Promise.all(
      mentionedMembers.map((member) =>
        this.directMessagesService.sendDirectMessage(
          {
            authorId: member.id,
            authorName: ChannelComponent.SYSTEM_AUTHOR_NAME,
            authorProfilePictureKey: ChannelComponent.SYSTEM_PROFILE_PICTURE_KEY,
            text: messageText,
          },
          member.id
        )
      )
    );
  }
  protected sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.isSending) return;

    const currentUser = this.userService.currentUser();
    if (!currentUser?.uid) return;

    this.isSending = true;
    this.shouldScrollOnNextMessage = true;
    this.ngZone.runOutsideAngular(() => requestAnimationFrame(() => this.focusComposer()));

    this.channel$
      .pipe(
        take(1),
        switchMap((channel) => {
          if (!channel?.id) {
            return of(null);
          }
          const channelTitle = channel.title ?? this.channelDefaults.name;
          return from(
            this.channelService.addChannelMessage(channel.id, {
              text,
              authorId: currentUser.uid,
            })
          ).pipe(
            switchMap(() =>
              from(this.notifyMentionedMembers(text, channelTitle)).pipe(
                catchError((error) => {
                  console.error('Fehler beim Versenden der Mention-Benachrichtigung', error);
                  return of(null);
                })
              )
            )
          );
        })
      )
      .subscribe({
        next: () => {
          this.messageText = '';
          this.resetMentionSuggestions();
          this.isComposerEmojiPickerOpen = false;
          this.ngZone.runOutsideAngular(() => requestAnimationFrame(() => this.focusComposer()));
        },
        error: (error: unknown) => {
          this.shouldScrollOnNextMessage = false;
          console.error('Fehler beim Senden der Nachricht', error);
        },
        complete: () => {
          this.isSending = false;
        },
      });
  }

  private toViewMessage(message: ChannelMessage & { author?: AppUser }): ChannelMessageView {
    const createdAt = this.timestampToDate(message.createdAt) ?? new Date();
    const lastReplyAt = this.timestampToDate(message.lastReplyAt);
    const currentUserId = this.userService.currentUser()?.uid;

    return {
      id: message.id,
      authorId: message.authorId,
      author: message.author?.name ?? 'Unbekannter Nutzer',
      profilePictureKey: message.author?.profilePictureKey ?? 'default',

      createdAt,
      time: this.formatTime(createdAt),

      text: message.text ?? '',
      replies: message.replies ?? 0,

      lastReplyAt,
      lastReplyTime: lastReplyAt ? this.formatTime(lastReplyAt) : undefined,

      tag: message.tag,
      attachment: message.attachment,

      isOwn: message.authorId === currentUserId,
      reactions: message.reactions ?? {},
    };
  }

  private timestampToDate(value: unknown): Date | undefined {
    if (!value) {
      return undefined;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }

    return undefined;
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
  private shouldAutoScroll(days: ChannelDay[]): boolean {
    const snapshot = this.getMessageSnapshot(days);
    const shouldScroll =
      (this.lastMessageCount === 0 && snapshot.count > 0) ||
      snapshot.count > this.lastMessageCount ||
      (snapshot.lastId !== undefined && snapshot.lastId !== this.lastMessageId);

    this.lastMessageCount = snapshot.count;
    this.lastMessageId = snapshot.lastId;

    return shouldScroll;
  }

  private getMessageSnapshot(days: ChannelDay[]): { count: number; lastId?: string } {
    const count = days.reduce((total, day) => total + day.messages.length, 0);
    const lastDay = days.at(-1);
    const lastMessage = lastDay?.messages.at(-1);

    return { count, lastId: lastMessage?.id };
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
        offsetX: 0,
        offsetY: -8,
        data: {
          channelId: resolvedChannel.id,
          title: resolvedChannel.title ?? this.channelDefaults.name,
          description: resolvedChannel.description ?? this.channelDefaults.summary,
        },
      });
    });
  }
  protected openThread(message: ChannelMessageView): void {
    this.channel$.pipe(take(1)).subscribe((channel) => {
      if (!channel?.id || !message.id) return;

      void this.router.navigate(['/main/channels', channel.id, 'threads', message.id]);
      this.threadService.openThread({
        id: message.id,
        channelId: channel.id,
        channelTitle: channel.title ?? this.channelDefaults.name,
        authorId: message.authorId,
        time: message.time,
        text: message.text,
        isOwn: message.isOwn,
      });
    });
  }

  protected startEditingMessage(message: ChannelMessageView): void {
    if (!message.id || !message.isOwn) return;
    this.editingMessageId = message.id;
    this.editMessageText = message.text;
  }

  protected cancelEditingMessage(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  protected saveEditingMessage(messageId: string): void {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || this.isSavingEdit) return;

    this.isSavingEdit = true;
    this.channel$
      .pipe(
        take(1),
        switchMap((channel) => {
          if (!channel?.id) {
            return of(null);
          }

          return from(
            this.channelService.updateChannelMessage(channel.id, messageId, {
              text: trimmed,
            })
          );
        })
      )
      .subscribe({
        complete: () => {
          this.isSavingEdit = false;
          this.cancelEditingMessage();
        },
        error: () => {
          this.isSavingEdit = false;
        },
      });
  }

  protected openChannelMembers(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;

    combineLatest([this.channel$, this.channelTitle$, this.members$])
      .pipe(take(1))
      .subscribe(([channel, title, members]) => {
        this.overlayService.open(ChannelMembers, {
          target: target ?? undefined,
          offsetX: -200,
          offsetY: 8,
          data: { channelId: channel?.id, title, members },
        });
      });
  }

  protected openAddToChannel(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;

    combineLatest([this.channel$, this.channelTitle$, this.members$])
      .pipe(take(1))
      .subscribe(([channel, title, members]) => {
        this.overlayService.open(AddToChannel, {
          target: target ?? undefined,
          offsetX: -370,
          offsetY: 8,
          data: { channelId: channel?.id, channelTitle: title, members },
        });
      });
  }

  react(message: ChannelMessageView, emoji: string): void {
    if (!this.currentUser || !this.channelId || !message.id) return;

    const reactions = message.reactions ?? {};
    const hasReacted = reactions[emoji]?.includes(this.currentUser.uid) ?? false;

    this.messageReactionsService.toggleReaction({
      docPath: `channels/${this.channelId}/messages/${message.id}`,
      userId: this.currentUser.uid,
      emoji,
    });

    this.openEmojiPickerFor = null;
  }

  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;

    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  private scrollToBottom(): void {
    const element = this.channelMessages?.nativeElement;
    if (!element) return;

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    });
  }

  private syncChildRouteState(): void {
    const threadId = this.route.firstChild?.snapshot?.paramMap?.get('threadId');
    const hadThread = this.hasThreadChild();
    const hasThread = !!threadId;

    this.hasThreadChild.set(hasThread);

    if (!hasThread && hadThread) {
      this.threadService.reset();
    }
  }

  private scrollToHighlightedMessage(messageId: string): void {
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(`message-${messageId}`);
      const container = this.channelMessages?.nativeElement;

      if (!el || !container) {
        if (attempt < 10) {
          this.ngZone.runOutsideAngular(() => requestAnimationFrame(() => tryScroll(attempt + 1)));
        }
        return;
      }

      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const containerRect = container.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();

            const offset =
              elRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2 + el.clientHeight / 2;

            container.scrollTo({
              top: offset,
              behavior: 'smooth',
            });

            el.classList.add('highlight');

            setTimeout(() => {
              el.classList.remove('highlight');
            }, 800);

            this.ngZone.run(() => {
              void this.router.navigate([], {
                relativeTo: this.route,
                queryParams: {},
                replaceUrl: true,
              });
            });
          });
        });
      });
    };

    tryScroll();
  }

  protected trackByMessageId(_: number, msg: ChannelMessageView): string | undefined {
    return msg.id;
  }

  private isNearBottom(threshold = 40): boolean {
    const el = this.channelMessages?.nativeElement;
    if (!el) return true;

    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  private readonly highlightRequest$ = combineLatest([this.route.queryParamMap, this.messagesByDay$]).pipe(
    map(([params]) => params.get('highlight')),
    shareReplay(1)
  );

  showReactionTooltip(event: MouseEvent, emoji: string, userIds: string[]): void {
    this.reactionTooltipService.show(event, emoji, userIds);
  }

  hideReactionTooltip(): void {
    this.reactionTooltipService.hide();
  }
}
