import { Component, DestroyRef, ElementRef, NgZone, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  ChannelMessage,
  ChannelMember,
  ChannelMemberView,
  ChannelDay,
  MessageActionId,
  MessageView,
  ProfilePictureKey,
} from '../../types';
import { OverlayService } from '../../services/overlay.service';
import { ChannelDescription } from './channel-description/channel-description';
import { AppUser, UserService } from '../../services/user.service';
import { ChannelMembers } from './channel-members/channel-members';
import { AddToChannel } from './add-to-channel/add-to-channel';
import { ThreadService } from '../../services/thread.service';
import { ScreenService } from '../../services/screen.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { formatDateLabel, formatTimeLabel } from '../../shared/message-date-time.helper';
import { ComponentPortal } from '@angular/cdk/portal';
import { ReactionTooltipComponent } from '../tooltip/tooltip';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MessageActions, executeMessageAction } from '../shared/message-actions/message-actions';
import { MessageBody } from '../shared/message-body/message-body';
import { MessageComposer } from '../shared/message-composer/message-composer';
import { MessageItem } from '../shared/message-item/message-item';
import { MessageList } from '../shared/message-list/message-list';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { buildMessageSegments, getMentionedMembers, updateTagSuggestions } from '../../shared/chat-tag.helper';
import type {
  ChannelMentionSuggestion,
  MentionSegment,
  MentionState,
  MentionType,
  UserMentionSuggestion,
} from '../../types';
import { ProfilePictureService } from '../../services/profile-picture.service';

@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSidenavModule,
    RouterOutlet,
    MessageReactions,
    MessageList,
    MessageItem,
    MessageActions,
    MessageBody,
    MessageComposer,
  ],

  templateUrl: './channel.html',
  styleUrls: ['./channel.scss'],
})
export class ChannelComponent {
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

  @ViewChild(MessageComposer)
  private messageComposer?: MessageComposer;
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
  private mentionState: MentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  protected get isMentionListVisible() {
    return this.mentionState.isVisible;
  }
  protected get mentionType(): MentionType | undefined {
    return this.mentionState.type;
  }
  private cachedMembers: ChannelMemberView[] = [];
  private cachedMentionUsers: ChannelMemberView[] = [];
  private cachedChannels: ChannelMentionSuggestion[] = [];
  private messageSegmentsCache = new Map<string, { text: string; segments: MentionSegment[] }>();
  private lastMessageCount = 0;
  private lastMessageId?: string;
  private shouldScrollOnNextMessage = false;
  private didInitialScroll = false;
  private overlayRef?: OverlayRef;
  protected readonly hasThreadChild = signal(false);

  protected readonly channel$: Observable<Channel | undefined> = combineLatest([
    this.currentUser$,
    this.channelId$,
    this.channels$,
  ]).pipe(
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

  protected readonly avatarUrlResolver = (key?: ProfilePictureKey) => this.getAvatarUrl(key);

  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected channelId: string | null = null;
  protected currentUser: AppUser | null = null;
  private channelMessages?: ElementRef<HTMLElement>;
  private threadSidenav?: MatSidenav;

  @ViewChild('channelMessages', { read: ElementRef })
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
          const userMap = new Map(users.map((user) => [user.uid, user]));

          return members
            .map((member): ChannelMemberView | undefined => {
              const user = userMap.get(member.id);
              if (!user) return undefined;
              const name = user.name;

              return {
                id: member.id,
                name,
                profilePictureKey: user.profilePictureKey,
                subtitle: member.subtitle,
              };
            })
            .filter((member): member is ChannelMemberView => member !== undefined);
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

    this.channel$
      .pipe(
        map((channel) => channel?.id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((channelId) => {
        this.lastMessageCount = 0;
        this.lastMessageId = undefined;
        this.shouldScrollOnNextMessage = false;
        this.didInitialScroll = false;
        if (channelId) {
          this.focusComposer();
        }
      });

    this.publicChannelMemberSync();

    this.allUsers$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((users) => {
      this.allUsersSnapshot = users;
      this.cachedMentionUsers = users.map((user) => ({
        id: user.uid,
        name: user.name,
        profilePictureKey: user.profilePictureKey,
      }));
      this.messageSegmentsCache.clear();
      this.updateMentionState();
    });

    this.members$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((members) => {
      this.cachedMembers = members;
      this.messageSegmentsCache.clear();
      this.updateMentionState();
    });

    this.channels$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((channels) => {
      this.cachedChannels =
        channels?.map((channel) => ({
          id: channel.id,
          name: channel.title,
        })) ?? [];
      this.messageSegmentsCache.clear();
      this.updateMentionState();
    });

    this.messagesByDay$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((days) => {
      if (!this.channelMessages) return;

      if (!this.didInitialScroll && days.length) {
        this.didInitialScroll = true;
        this.scrollToBottom();
        const snapshot = this.getMessageSnapshot(days);
        this.lastMessageCount = snapshot.count;
        this.lastMessageId = snapshot.lastId;
        return;
      }

      const wasNearBottom = this.isNearBottom();
      const result = this.shouldAutoScroll(days);
      if (!result.shouldScroll) return;

      this.lastMessageCount = result.newCount;
      this.lastMessageId = result.newLastId;

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
        void this.closeThread();
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

  async closeThread(): Promise<void> {
    if (!this.hasThreadChild()) return;

    const channelId = this.route.snapshot.paramMap.get('channelId');
    this.threadService.reset();

    if (this.userService.currentUser()) {
      if (channelId) {
        await this.router.navigate(['/main/channels', channelId]);
      } else {
        await this.router.navigate(['/main']);
      }
    }

    this.focusComposer();
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
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .forEach((message) => {
        const label = this.buildDayLabel(message.timestamp);
        const existingGroup = grouped.get(label);

        if (existingGroup) {
          existingGroup.messages.push(message);
        } else {
          grouped.set(label, {
            label,
            sortKey: message.timestamp.getTime(),
            messages: [message],
          });
        }
      });

    return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey);
  }

  protected onMessageInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    this.messageText = textarea?.value ?? this.messageText;
    this.mentionState.caretIndex = textarea?.selectionStart ?? null;
    this.updateMentionState();
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
    this.updateMentionState();
  }

  protected insertComposerChannel(): void {
    this.insertComposerText('#');
    this.updateMentionState();
  }

  protected insertMention(member: ChannelMemberView): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.messageText.length;
    const before = this.messageText.slice(0, this.mentionState.triggerIndex);
    const after = this.messageText.slice(caret);
    const mentionText = `@${member.name} `;

    this.messageText = `${before}${mentionText}${after}`;
    const newCaret = before.length + mentionText.length;

    queueMicrotask(() => {
      const textarea = this.messageComposer?.textareaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionState();
  }

  protected insertChannel(channel: ChannelMentionSuggestion): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.messageText.length;
    const before = this.messageText.slice(0, this.mentionState.triggerIndex);
    const after = this.messageText.slice(caret);

    const text = `#${channel.name} `;
    this.messageText = `${before}${text}${after}`;

    const newCaret = before.length + text.length;
    queueMicrotask(() => {
      const textarea = this.messageComposer?.textareaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionState();
  }

  protected buildMessageSegments(message: MessageView): MentionSegment[] {
    const cached = this.messageSegmentsCache.get(message.id);
    if (cached && cached.text === message.text) {
      return cached.segments;
    }

    const segments = buildMessageSegments(message.text, this.cachedMentionUsers, this.cachedChannels);
    this.messageSegmentsCache.set(message.id, { text: message.text, segments });
    return segments;
  }

  protected openMemberProfile(member?: ChannelMemberView): void {
    if (!member) return;
    this.openEmojiPickerFor = null;
    (document.activeElement as HTMLElement | null)?.blur();

    const resolvedUser = this.allUsersSnapshot.find((user) => user.uid === member.id);
    const fallbackUser: AppUser = resolvedUser ?? {
      uid: member.id,
      name: member.name,
      email: null,
      profilePictureKey: member.profilePictureKey,
      onlineStatus: false,
      lastSeen: undefined,
      updatedAt: undefined,
      createdAt: undefined,
    };

    this.dialog.open(MemberDialog, {
      data: { user: fallbackUser },
    });
  }

  private focusComposer(): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => this.messageComposer?.focus());
    });
  }

  private insertComposerText(text: string): void {
    const textarea = this.messageComposer?.textareaElement;
    if (!textarea) {
      this.messageText = `${this.messageText}${text}`;
      this.mentionState.caretIndex = this.messageText.length;
      return;
    }

    const start = textarea.selectionStart ?? this.messageText.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.messageText.slice(0, start);
    const after = this.messageText.slice(end);
    this.messageText = `${before}${text}${after}`;
    this.mentionState.caretIndex = start + text.length;

    requestAnimationFrame(() => {
      textarea.focus();
      const newCaret = start + text.length;
      textarea.setSelectionRange(newCaret, newCaret);
    });
  }

  private updateMentionState(): void {
    const caret = this.mentionState.caretIndex ?? this.messageText.length;

    const userResult = updateTagSuggestions(this.messageText, caret, '@', this.cachedMentionUsers);

    if (userResult.isVisible) {
      this.mentionState = {
        ...userResult,
        caretIndex: this.mentionState.caretIndex,
        type: 'user',
      };
      return;
    }

    const channelResult = updateTagSuggestions(this.messageText, caret, '#', this.cachedChannels);

    if (channelResult.isVisible) {
      this.mentionState = {
        ...channelResult,
        caretIndex: this.mentionState.caretIndex,
        type: 'channel',
      };
      return;
    }

    this.resetMentionState();
  }

  private resetMentionState(): void {
    this.mentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  }

  private async notifyMentionedMembers(text: string, channelTitle: string): Promise<void> {
    const currentUser = this.userService.currentUser();
    if (!currentUser) return;

    const mentionedMembers = getMentionedMembers(text, this.cachedMembers).filter(
      (member) => member.id !== currentUser.uid
    );
    if (!mentionedMembers.length) return;

    const formattedTime = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const messageText = `Du wurdest von @${currentUser.name} am ${formattedTime} in #${channelTitle} erwähnt.`;

    await Promise.all(
      mentionedMembers.map((member) => this.directMessagesService.sendSystemMessage(member.id, messageText))
    );
  }
  protected sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.isSending) return;

    const currentUser = this.userService.currentUser();
    if (!currentUser?.uid) return;

    this.isSending = true;
    this.shouldScrollOnNextMessage = true;
    this.focusComposer();

    this.channel$
      .pipe(
        take(1),
        switchMap((channel) => {
          if (!channel?.id) {
            return of(null);
          }
          const channelTitle = channel.title;
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
          this.resetMentionState();
          this.isComposerEmojiPickerOpen = false;
          this.focusComposer();
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

  private toViewMessage(message: ChannelMessage & { author?: AppUser }): MessageView {
    const createdAt = this.timestampToDate(message.createdAt) as Date;
    const lastReplyAt = this.timestampToDate(message.lastReplyAt);
    const currentUserId = this.userService.currentUser()?.uid;

    return {
      id: message.id,
      authorId: message.authorId,
      authorName: message.author!.name,
      profilePictureKey: message.author!.profilePictureKey,

      timestamp: createdAt,
      timeLabel: formatTimeLabel(createdAt),

      text: message.text,
      replies: message.replies,

      lastReplyAt,
      lastReplyTimeLabel: lastReplyAt ? formatTimeLabel(lastReplyAt) : undefined,

      tag: message.tag,

      isOwn: message.authorId === currentUserId,
      reactions: message.reactions,
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
    return formatDateLabel(date);
  }

  private shouldAutoScroll(days: ChannelDay[]): { shouldScroll: boolean; newCount: number; newLastId?: string } {
    const snapshot = this.getMessageSnapshot(days);
    const shouldScroll =
      (this.lastMessageCount === 0 && snapshot.count > 0) ||
      snapshot.count > this.lastMessageCount ||
      (snapshot.lastId !== undefined && snapshot.lastId !== this.lastMessageId);

    return {
      shouldScroll,
      newCount: snapshot.count,
      newLastId: snapshot.lastId,
    };
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
      if (!channel) return;

      this.overlayService.open(ChannelDescription, {
        target: target ?? undefined,
        offsetX: 0,
        offsetY: -8,
        data: {
          channelId: channel.id,
          title: channel.title,
          description: channel.description,
        },
      });
    });
  }
  protected openThread(message: MessageView): void {
    this.channel$.pipe(take(1)).subscribe((channel) => {
      if (!channel?.id || !message.id) return;

      void this.router.navigate(['/main/channels', channel.id, 'threads', message.id]);
      this.threadService.openThread({
        id: message.id,
        channelId: channel.id,
        authorId: message.authorId,
        timeLabel: message.timeLabel,
        text: message.text,
      });
    });
  }

  protected handleMessageAction(message: MessageView, actionId: MessageActionId | string): void {
    executeMessageAction(actionId, {
      check: () => this.react(message, '✅'),
      thumb: () => this.react(message, '👍'),
      picker: () => this.toggleEmojiPicker(message.id),
      thread: () => this.openThread(message),
      edit: () => this.startEditingMessage(message),
    });
  }

  protected startEditingMessage(message: MessageView): void {
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
    const isMobile = this.screenService.isTabletScreen();

    combineLatest([this.channel$, this.members$])
      .pipe(take(1))
      .subscribe(([channel, members]) => {
        this.overlayService.open(ChannelMembers, {
          target: target ?? undefined,
          offsetX: isMobile ? -185 : -185,
          offsetY: 8,
          data: {
            channelId: channel?.id,
            members,
            overlayTitle: 'Mitglieder',
            channelTitle: channel?.title,
            mode: isMobile ? 'mobile' : 'desktop',
            originTarget: target ?? undefined,
          },
        });
      });
  }

  protected openChannelFromTag(channel: ChannelMentionSuggestion): void {
    void this.router.navigate(['/main/channels', channel.id]);
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

  react(message: MessageView, emoji: string): void {
    if (!this.currentUser || !this.channelId || !message.id) return;

    const reactions = message.reactions;
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

  protected trackByMessageId(_: number, msg: MessageView): string | undefined {
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

  protected get userMentionSuggestions(): UserMentionSuggestion[] {
    return this.mentionState.type === 'user' ? (this.mentionState.suggestions as UserMentionSuggestion[]) : [];
  }

  protected get channelMentionSuggestions(): ChannelMentionSuggestion[] {
    return this.mentionState.type === 'channel' ? (this.mentionState.suggestions as ChannelMentionSuggestion[]) : [];
  }
}
