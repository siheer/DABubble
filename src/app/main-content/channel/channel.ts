import { Component, DestroyRef, ElementRef, Input, NgZone, ViewChild, inject, signal } from '@angular/core';
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
  filter,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';

import { ChannelService } from '../../services/channel.service';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ChannelMembershipService } from '../../services/membership.service';
import { OverlayService } from '../../services/overlay.service';
import { AppUser, UserService } from '../../services/user.service';
import { ThreadService } from '../../services/thread.service';
import { ScreenService } from '../../services/screen.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { DirectMessagesService } from '../../services/direct-messages.service';
import type { Channel, ChannelDay, ChannelMemberView, ChannelMessageView, ProfilePictureKey } from '../../types';
import { EMOJI_CHOICES, CHANNEL_EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { ChannelDescription } from '../messages/channel-description/channel-description';
import { ChannelMembers } from './channel-members/channel-members';
import { AddToChannel } from './add-to-channel/add-to-channel';
import { MemberDialog } from '../member-dialog/member-dialog';
import { groupMessagesByDay } from './channel-message.helper';
import { buildMessageSegments, getMentionedMembers, updateTagSuggestions } from './channel-mention.helper';
import { isNearBottom, scrollToBottom, shouldAutoScroll, scrollToHighlightedMessage } from './channel-scroll.helper';
import type {
  MentionSegment,
  MentionState,
  MentionType,
  ChannelMentionSuggestion,
  UserMentionSuggestion,
} from '../../classes/mentions.types';
import { ChannelFacadeService } from './channel-facade.service';

/** Channel component for message display and management. */
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
  @Input() originTarget!: HTMLElement;

  // Services
  private readonly channelService = inject(ChannelService);
  private readonly channelFacade = inject(ChannelFacadeService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly overlayService = inject(OverlayService);
  private readonly userService = inject(UserService);
  private readonly threadService = inject(ThreadService);
  private readonly dialog = inject(MatDialog);
  private readonly screenService = inject(ScreenService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reactionTooltipService = inject(ReactionTooltipService);
  private readonly profilePictureService = inject(ProfilePictureService);

  // ViewChild
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('channelMessages') private channelMessages?: ElementRef<HTMLElement>;
  @ViewChild('threadSidenav') private threadSidenav?: MatSidenav;

  // Constants
  protected readonly channelDefaults = {
    name: 'Entwicklerteam',
    summary: 'Gruppe zum Austausch über technische Fragen und das laufende Redesign des Devspace.',
  };
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected readonly channelEmojiChoices = CHANNEL_EMOJI_CHOICES;
  protected readonly isTabletScreen = this.screenService.isTabletScreen;

  // State
  protected messageText = '';
  protected isSending = false;
  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected channelId: string | null = null;
  protected currentUser: AppUser | null = null;
  protected readonly hasThreadChild = signal(false);
  private didInitialScroll = false;

  // Mention state
  private mentionState: MentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  protected get isMentionListVisible() {
    return this.mentionState.isVisible;
  }
  protected get mentionType(): MentionType | undefined {
    return this.mentionState.type;
  }

  // Cached data
  private cachedMembers: ChannelMemberView[] = [];
  protected allUsersSnapshot: AppUser[] = [];
  private lastMessageCount = 0;
  private lastMessageId?: string;
  private shouldScrollOnNextMessage = false;
  private cachedChannels: { id: string; name: string }[] = [];

  // Observables
  private readonly currentUser$ = this.userService.currentUser$;
  private readonly allUsers$ = this.userService.getAllUsers();
  protected readonly channelId$ = this.route.paramMap.pipe(
    map((p) => p.get('channelId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  private readonly channels$ = this.currentUser$.pipe(
    switchMap((u) => (u ? this.membershipService.getChannelsForUser(u.uid) : of([]))),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  protected readonly channel$ = this.createChannelObservable();
  protected readonly channelTitle$ = this.channel$.pipe(map((ch) => ch?.title ?? this.channelDefaults.name));
  protected readonly channelDescription$ = this.channel$.pipe(
    map((ch) => ch?.description ?? this.channelDefaults.summary)
  );
  protected readonly members$ = this.createMembersObservable();
  protected readonly messagesByDay$ = this.createMessagesByDayObservable();
  private readonly highlightRequest$ = combineLatest([this.route.queryParamMap, this.messagesByDay$]).pipe(
    map(([p]) => p.get('highlight')),
    filter((anchor) => anchor != null)
  );

  constructor() {
    this.screenService.connect();
    this.initSubscriptions();
  }

  /** Creates channel observable with validation. */
  private createChannelObservable(): Observable<Channel | undefined> {
    return combineLatest([this.currentUser$, this.channelId$, this.channels$]).pipe(
      map(([_, cId, chs]) => chs?.find((c) => c.id === cId)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Creates members observable with user enrichment. */
  private createMembersObservable(): Observable<ChannelMemberView[]> {
    return this.channel$.pipe(
      switchMap((ch) => {
        if (!ch?.id) return of<ChannelMemberView[]>([]);
        return combineLatest([this.membershipService.getChannelMembers(ch.id), this.allUsers$]).pipe(
          map(([members, users]) => this.enrichMembers(members, users))
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Enriches member data with user information. */
  private enrichMembers(members: ChannelMemberView[], users: AppUser[]): ChannelMemberView[] {
    const currentUserId = this.userService.currentUser()?.uid;
    const userMap = new Map(users.map((u) => [u.uid, u]));

    return members
      .map((m): ChannelMemberView | undefined => {
        const user = userMap.get(m.id);
        if (!user) return undefined;

        return {
          id: m.id,
          name: user.name ?? m.name,
          profilePictureKey: user.profilePictureKey ?? m.profilePictureKey,
          subtitle: m.subtitle,
          isCurrentUser: m.id === currentUserId,
          user,
        };
      })
      .filter((m): m is ChannelMemberView => m !== undefined);
  }

  /** Creates messages by day observable. */
  private createMessagesByDayObservable(): Observable<ChannelDay[]> {
    return this.channel$.pipe(
      switchMap((ch) =>
        !ch?.id
          ? of<ChannelDay[]>([])
          : this.channelService
              .getChannelMessagesResolved(ch.id, this.allUsers$)
              .pipe(map((msgs) => groupMessagesByDay(msgs, this.userService.currentUser()?.uid)))
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Initializes component subscriptions. */
  private initSubscriptions(): void {
    this.channel$
      .pipe(
        map((ch) => ch?.id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.didInitialScroll = false;
        this.lastMessageCount = 0;
        this.lastMessageId = undefined;
        this.focusComposer();
      });
    this.allUsers$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((u) => (this.allUsersSnapshot = u));
    this.members$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      this.cachedMembers = m;
      this.updateMentionState();
    });
    this.channels$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((chs) => {
      this.cachedChannels =
        chs
          ?.filter((c): c is { id: string; title?: string } => !!c.id)
          .map((c) => ({
            id: c.id,
            name: c.title ?? '',
          })) ?? [];
    });
    this.messagesByDay$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((d) => this.onMessagesChange(d));
    this.highlightRequest$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => id && this.highlightMessage(id));
    this.channelId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => (this.channelId = id));
    this.currentUser$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((u) => (this.currentUser = u));
    this.router.events
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((e) => e instanceof NavigationEnd && this.syncChildRoute())
      )
      .subscribe();
    this.threadService.closeRequests$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.handleThreadClose());
    this.publicChannelSync();
    this.syncChildRoute();
  }

  /** Handles messages change for auto-scroll. */
  private onMessagesChange(days: ChannelDay[]): void {
    if (!this.channelMessages) return;
    if (!this.didInitialScroll && days.length) {
      this.didInitialScroll = true;

      requestAnimationFrame(() => {
        scrollToBottom(this.channelMessages, this.ngZone);
      });
      this.lastMessageCount = days.reduce((sum, d) => sum + d.messages.length, 0);
      this.lastMessageId = days.at(-1)?.messages.at(-1)?.id;
      return;
    }
    const wasNear = isNearBottom(this.channelMessages?.nativeElement);
    const result = shouldAutoScroll(days, this.lastMessageCount, this.lastMessageId);
    if (!result.shouldScroll) return;
    this.lastMessageCount = result.newCount;
    this.lastMessageId = result.newLastId;
    if (this.shouldScrollOnNextMessage || wasNear) {
      this.shouldScrollOnNextMessage = false;
      scrollToBottom(this.channelMessages, this.ngZone);
    }
  }

  /** Highlights a message. */
  private highlightMessage(id: string): void {
    scrollToHighlightedMessage(id, this.channelMessages, this.ngZone, () => {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
  }

  /** Handles thread close requests. */
  private handleThreadClose(): void {
    if (!this.hasThreadChild()) return;
    this.threadSidenav ? this.threadSidenav.close() : this.closeThread();
  }

  /** Syncs public channel members. */
  private publicChannelSync(): void {
    this.channel$
      .pipe(
        map((ch) => (ch?.isPublic ? ch.id : null)),
        distinctUntilChanged(),
        switchMap((cId) =>
          !cId
            ? of(null)
            : combineLatest([this.allUsers$, this.membershipService.getChannelMembers(cId)]).pipe(
                switchMap(([u, m]) =>
                  from(this.membershipService.syncPublicChannelMembers(cId, u, m)).pipe(
                    catchError((e) => {
                      console.error(e);
                      return of(null);
                    })
                  )
                )
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /** Gets avatar URL. */
  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  /** Handles Enter key in composer. */
  protected onComposerKeydown(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.key !== 'Enter' || ke.shiftKey) return;
    ke.preventDefault();
    this.sendMessage();
  }

  /** Handles message input. */
  protected onMessageInput(event: Event): void {
    const ta = event.target as HTMLTextAreaElement | null;
    this.messageText = ta?.value ?? this.messageText;
    this.mentionState.caretIndex = ta?.selectionStart ?? null;
    this.updateMentionState();
  }

  /** Toggles composer emoji picker. */
  protected toggleComposerEmojiPicker(): void {
    this.isComposerEmojiPickerOpen = !this.isComposerEmojiPickerOpen;
    this.focusComposer();
  }

  /** Adds emoji to composer. */
  protected addComposerEmoji(emoji: string): void {
    this.insertText(emoji);
    this.isComposerEmojiPickerOpen = false;
  }

  /** Inserts @ for mentions. */
  protected insertComposerMention(): void {
    this.insertText('@');
    this.updateMentionState();
  }

  /** Inserts member mention. */
  protected insertMention(member: ChannelMemberView): void {
    if (this.mentionState.triggerIndex === null) return;
    const caret = this.mentionState.caretIndex ?? this.messageText.length;
    const before = this.messageText.slice(0, this.mentionState.triggerIndex);
    const after = this.messageText.slice(caret);
    const mention = `@${member.name} `;
    this.messageText = `${before}${mention}${after}`;
    const newCaret = before.length + mention.length;
    queueMicrotask(() => {
      const ta = this.messageTextarea?.nativeElement;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });
    this.resetMentionState();
  }

  /** Builds message segments. */
  buildMessageSegments(text: string): MentionSegment[] {
    return buildMessageSegments(text, this.cachedMembers, this.cachedChannels);
  }

  /** Opens member profile. */
  protected openMemberProfile(member?: ChannelMemberView): void {
    if (!member || member.isCurrentUser) return;
    this.dialog.open(MemberDialog, { data: { user: member.user ?? this.enrichMembers([member], [])[0].user } });
  }

  /** Sends message to channel. */
  protected sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || this.isSending) return;
    const user = this.userService.currentUser();
    if (!user?.uid) return;
    this.isSending = true;
    this.shouldScrollOnNextMessage = true;
    this.focusComposer();
    this.channel$
      .pipe(
        take(1),
        switchMap((ch) =>
          !ch?.id
            ? of(null)
            : this.channelFacade
                .sendMessage(ch.id, text, user.uid)
                .pipe(
                  switchMap(() =>
                    this.channelFacade.sendMentionNotifications(
                      text,
                      ch.title ?? this.channelDefaults.name,
                      this.cachedMembers
                    )
                  )
                )
        )
      )
      .subscribe({
        next: () => {
          this.messageText = '';
          this.resetMentionState();
          this.isComposerEmojiPickerOpen = false;
          this.focusComposer();
        },
        error: (e) => {
          this.shouldScrollOnNextMessage = false;
          console.error('Fehler beim Senden', e);
        },
        complete: () => (this.isSending = false),
      });
  }

  /** Opens channel description overlay. */
  protected openChannelDescription(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    this.channel$.pipe(take(1)).subscribe((ch) => {
      const data = ch ?? { title: this.channelDefaults.name, description: this.channelDefaults.summary };
      this.overlayService.open(ChannelDescription, {
        target: target ?? undefined,
        offsetX: 0,
        offsetY: -8,
        data: {
          channelId: data.id,
          title: data.title ?? this.channelDefaults.name,
          description: data.description ?? this.channelDefaults.summary,
        },
      });
    });
  }

  /** Opens thread for message. */
  protected openThread(msg: ChannelMessageView): void {
    this.channel$.pipe(take(1)).subscribe((ch) => {
      if (!ch?.id || !msg.id) return;
      void this.router.navigate(['/main/channels', ch.id, 'threads', msg.id]);
      this.threadService.openThread({
        id: msg.id,
        channelId: ch.id,
        channelTitle: ch.title ?? this.channelDefaults.name,
        authorId: msg.authorId,
        time: msg.time,
        text: msg.text,
        isOwn: msg.isOwn,
      });
    });
  }

  /** Starts editing message. */
  protected startEditingMessage(msg: ChannelMessageView): void {
    if (!msg.id || !msg.isOwn) return;
    this.editingMessageId = msg.id;
    this.editMessageText = msg.text;
  }

  /** Cancels editing. */
  protected cancelEditingMessage(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  /** Saves edited message. */
  protected saveEditingMessage(msgId: string): void {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || this.isSavingEdit) return;
    this.isSavingEdit = true;
    this.channel$
      .pipe(
        take(1),
        switchMap((ch) => (ch?.id ? this.channelFacade.updateMessage(ch.id, msgId, trimmed) : of(null)))
      )
      .subscribe({
        complete: () => {
          this.isSavingEdit = false;
          this.cancelEditingMessage();
        },
        error: () => (this.isSavingEdit = false),
      });
  }

  /** Opens channel members overlay. */
  protected openChannelMembers(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    const isMobile = this.screenService.isTabletScreen();

    combineLatest([this.channel$, this.members$])
      .pipe(take(1))
      .subscribe(([ch, members]) => {
        this.overlayService.open(ChannelMembers, {
          target: target ?? undefined,
          offsetX: isMobile ? -185 : -185,
          offsetY: 8,
          data: {
            channelId: ch?.id,
            members,
            overlayTitle: 'Mitglieder',
            channelTitle: ch?.title,
            mode: isMobile ? 'mobile' : 'desktop',
            originTarget: target ?? undefined,
          },
        });
      });
  }

  /** Opens add to channel overlay. */
  protected openAddToChannel(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    combineLatest([this.channel$, this.channelTitle$, this.members$])
      .pipe(take(1))
      .subscribe(([ch, title, members]) => {
        this.overlayService.open(AddToChannel, {
          target: target ?? undefined,
          offsetX: -370,
          offsetY: 8,
          data: { channelId: ch?.id, channelTitle: title, members },
        });
      });
  }

  /** Toggles reaction on message. */
  react(msg: ChannelMessageView, emoji: string): void {
    if (!this.currentUser || !this.channelId || !msg.id) return;
    this.messageReactionsService.toggleReaction({
      docPath: `channels/${this.channelId}/messages/${msg.id}`,
      userId: this.currentUser.uid,
      emoji,
    });
    this.openEmojiPickerFor = null;
  }

  /** Toggles emoji picker. */
  toggleEmojiPicker(msgId: string | undefined): void {
    if (!msgId) return;
    this.openEmojiPickerFor = this.openEmojiPickerFor === msgId ? null : msgId;
  }

  /** Closes thread. */
  async closeThread(): Promise<void> {
    const cId = this.route.snapshot.paramMap.get('channelId');
    if (this.hasThreadChild()) {
      console.log('ich war heir');
      this.threadService.reset();
      if (this.userService.currentUser()) {
        this.router.navigate(cId ? ['/main/channels', cId] : ['/main']);
      }
    }
    this.focusComposer();
  }

  /** Updates thread panel state. */
  protected updateThreadPanelOpenState(isOpen: boolean): void {
    this.threadService.setThreadPanelOpen(isOpen);
  }

  /** Shows reaction tooltip. */
  showReactionTooltip(event: MouseEvent, emoji: string, userIds: string[]): void {
    this.reactionTooltipService.show(event, emoji, userIds);
  }

  /** Hides reaction tooltip. */
  hideReactionTooltip(): void {
    this.reactionTooltipService.hide();
  }

  /** Tracks messages by ID. */
  protected trackByMessageId(_: number, msg: ChannelMessageView): string | undefined {
    return msg.id;
  }

  /** Syncs child route state. */
  private syncChildRoute(): void {
    const tId = this.route.firstChild?.snapshot?.paramMap?.get('threadId');
    const had = this.hasThreadChild();
    const has = !!tId;
    this.hasThreadChild.set(has);
    if (!has && had) this.threadService.reset();
  }

  /** Focuses composer. */
  private focusComposer(): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => this.messageTextarea?.nativeElement.focus());
    });
  }

  /** Inserts text at cursor. */
  private insertText(text: string): void {
    const ta = this.messageTextarea?.nativeElement;
    if (!ta) {
      this.messageText = `${this.messageText}${text}`;
      this.mentionState.caretIndex = this.messageText.length;
      return;
    }
    const start = ta.selectionStart ?? this.messageText.length;
    const end = ta.selectionEnd ?? start;
    this.messageText = `${this.messageText.slice(0, start)}${text}${this.messageText.slice(end)}`;
    this.mentionState.caretIndex = start + text.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  /** Updates mention state. */
  private updateMentionState(): void {
    const caret = this.mentionState.caretIndex ?? this.messageText.length;

    const userResult = updateTagSuggestions(this.messageText, caret, '@', this.cachedMembers);

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

  /** Resets mention state. */
  private resetMentionState(): void {
    this.mentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  }

  protected insertChannel(channel: { name: string }): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.messageText.length;
    const before = this.messageText.slice(0, this.mentionState.triggerIndex);
    const after = this.messageText.slice(caret);

    const text = `#${channel.name} `;
    this.messageText = `${before}${text}${after}`;

    const newCaret = before.length + text.length;
    queueMicrotask(() => {
      const ta = this.messageTextarea?.nativeElement;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionState();
  }

  protected get userMentionSuggestions(): UserMentionSuggestion[] {
    return this.mentionState.type === 'user' ? (this.mentionState.suggestions as UserMentionSuggestion[]) : [];
  }

  protected get channelMentionSuggestions(): ChannelMentionSuggestion[] {
    return this.mentionState.type === 'channel' ? (this.mentionState.suggestions as ChannelMentionSuggestion[]) : [];
  }
}
