import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  tap,
} from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AppUser, UserService } from '../../services/user.service';
import type { ChannelMemberView, DirectMessageEntry, MessageBubble, ProfilePictureKey } from '../../types';
import { Timestamp } from '@angular/fire/firestore';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MemberDialog } from '../member-dialog/member-dialog';
import { EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { formatTimestamp, formatDateLabel, getDateKey, hasMention } from './messages.helper';
import { DisplayNamePipe } from '../../pipes/display-name.pipe';
import {
  MentionState,
  MentionType,
  UserMentionSuggestion,
  ChannelMentionSuggestion,
} from '../../classes/mentions.types';
import { updateTagSuggestions, buildMessageSegments } from '../channel/channel-mention.helper';
import { ChannelMembershipService } from '../../services/membership.service';

/** Direct messages component for 1-on-1 conversations. */
@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactions, DisplayNamePipe],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  private static readonly SYSTEM_PROFILE_PICTURE_KEY: ProfilePictureKey = 'default';
  private static readonly SYSTEM_AUTHOR_NAME = 'System';

  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly reactionTooltipService = inject(ReactionTooltipService);
  private readonly profilePictureService = inject(ProfilePictureService);
  private readonly membershipService = inject(ChannelMembershipService);

  private readonly currentUser$ = this.userService.currentUser$;
  private readonly dmUserId$ = this.route.paramMap.pipe(
    map((p) => p.get('dmId')),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  private readonly recipientSignal = signal<AppUser | null>(null);
  private readonly recipientCache = new Map<string, AppUser | null>();
  private mentionState: MentionState = {
    suggestions: [],
    isVisible: false,
    triggerIndex: null,
    caretIndex: null,
  };

  protected readonly selectedRecipient$: Observable<AppUser | null> = toObservable(this.recipientSignal);
  private readonly rawMessages$: Observable<MessageBubble[]> = combineLatest([
    this.currentUser$,
    this.selectedRecipient$,
  ]).pipe(
    switchMap(([user, recipient]) =>
      !user || !recipient
        ? of([])
        : this.directMessagesService
            .getDirectConversationMessages(user.uid, recipient.uid)
            .pipe(map((msgs) => msgs.map((m) => this.mapMessage(m, user))))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  protected readonly messages$ = this.rawMessages$.pipe(tap(() => this.scrollToBottom()));
  protected selectedRecipient: AppUser | null = null;
  protected currentUser: AppUser | null = null;
  protected draftMessage = '';
  protected isSending = false;
  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected get isMentionListVisible() {
    return this.mentionState.isVisible;
  }

  protected get mentionType(): MentionType | undefined {
    return this.mentionState.type;
  }

  protected onComposerInput(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    this.draftMessage = ta.value;
    this.mentionState.caretIndex = ta.selectionStart;
    this.updateMentionState();
  }

  private cachedMentionUsers: ChannelMemberView[] = [];
  private cachedChannels: { id: string; name: string }[] = [];

  private messageStream?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea') private composerTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('messageStream') set messageStreamRef(ref: ElementRef<HTMLElement> | undefined) {
    this.messageStream = ref;
    this.scrollToBottom();
  }

  constructor() {
    this.currentUser$
      .pipe(
        switchMap((u) => (u ? this.membershipService.getChannelsForUser(u.uid) : of([]))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((channels) => {
        this.cachedChannels = channels.map((c) => ({
          id: c.id!,
          name: c.title ?? '',
        }));
      });
    this.dmUserId$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((dmId) => {
          if (!dmId) return of({ dmId: null as string | null, recipient: null as AppUser | null });
          if (this.recipientCache.has(dmId)) return of({ dmId, recipient: this.recipientCache.get(dmId) ?? null });
          return from(this.userService.getUserOnce(dmId)).pipe(
            map((r) => ({ dmId, recipient: r })),
            catchError((e) => {
              console.error(e);
              return of({ dmId, recipient: null });
            })
          );
        })
      )
      .subscribe(({ dmId, recipient }) => {
        if (dmId) this.recipientCache.set(dmId, recipient);
        this.recipientSignal.set(recipient);
      });
    this.currentUser$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((u) => {
      this.currentUser = u;
      this.updateDmMentionUsers();
      this.updateMentionState();
    });

    this.selectedRecipient$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => {
      this.selectedRecipient = r;
      this.updateDmMentionUsers();
      this.updateMentionState();
      if (r) requestAnimationFrame(() => this.focusComposer());
    });
  }

  /** Sends a direct message. */
  protected async sendMessage(): Promise<void> {
    const trimmed = this.draftMessage.trim();
    if (!trimmed || !this.currentUser || !this.selectedRecipient) return;
    this.isSending = true;
    try {
      await this.directMessagesService.sendDirectMessage(
        {
          authorId: this.currentUser.uid,
          authorName: this.currentUser.name,
          authorProfilePictureKey: this.currentUser.profilePictureKey ?? 'default',
          text: trimmed,
        },
        this.selectedRecipient.uid
      );
      await this.notifyMentionedRecipient(trimmed);
    } finally {
      this.isSending = false;
      this.draftMessage = '';
      this.isComposerEmojiPickerOpen = false;
      this.scrollToBottom();
    }
  }

  /** Handles Enter key in composer. */
  protected onComposerKeydown(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.key !== 'Enter' || ke.shiftKey) return;
    ke.preventDefault();
    this.sendMessage();
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

  /** Inserts @ for mention. */
  protected insertComposerMention(): void {
    this.insertText('@');
  }

  /** Opens recipient profile dialog. */
  protected openRecipientProfile(recipient: AppUser): void {
    if (this.currentUser?.uid === recipient.uid) return;
    this.dialog.open(MemberDialog, { data: { user: recipient } });
  }

  /** Formats timestamp to time string. */
  protected formatTimestamp(timestamp?: Timestamp): string {
    return formatTimestamp(timestamp);
  }

  /** Formats timestamp to date label. */
  protected formatDateLabel(timestamp?: Timestamp): string {
    return formatDateLabel(timestamp);
  }

  /** Checks if date divider should be shown. */
  protected shouldShowDateDivider(messages: MessageBubble[], index: number): boolean {
    const current = messages[index];
    if (!current?.timestamp || index === 0) return index === 0 && !!current?.timestamp;
    const previous = messages[index - 1];
    if (!previous?.timestamp) return true;
    return getDateKey(current.timestamp) !== getDateKey(previous.timestamp);
  }

  /** Maps DirectMessageEntry to MessageBubble. */
  private mapMessage(message: DirectMessageEntry, currentUser: AppUser): MessageBubble {
    const isSys = message.authorName === Messages.SYSTEM_AUTHOR_NAME;
    const isOwn = !isSys && message.authorId === currentUser.uid;
    return {
      id: message.id,
      author: isOwn ? 'Du' : (message.authorName ?? 'Unbekannter Nutzer'),
      profilePictureKey: message.authorProfilePictureKey ?? 'default',
      content: message.text ?? '',
      timestamp: message.createdAt,
      isOwn,
      reactions: message.reactions ?? {},
    };
  }

  /** Sends mention notification if recipient mentioned. */
  private async notifyMentionedRecipient(text: string): Promise<void> {
    if (!this.currentUser || !this.selectedRecipient) return;
    if (!hasMention(text, this.selectedRecipient.name)) return;
    if (this.currentUser.uid === this.selectedRecipient.uid) return;
    const formattedTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date()
    );
    const messageText = `Du wurdest von ${this.currentUser.name} am ${formattedTime} im privaten Chat mit ${this.currentUser.name} erwähnt.`;
    await this.directMessagesService.sendDirectMessage(
      {
        authorId: this.selectedRecipient.uid,
        authorName: Messages.SYSTEM_AUTHOR_NAME,
        authorProfilePictureKey: Messages.SYSTEM_PROFILE_PICTURE_KEY,
        text: messageText,
      },
      this.selectedRecipient.uid
    );
  }

  /** Starts editing message. */
  protected startEditing(message: MessageBubble): void {
    if (!message.id || !message.isOwn) return;
    this.editingMessageId = message.id;
    this.editMessageText = message.content;
  }

  /** Cancels editing. */
  protected cancelEditing(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  /** Saves edited message. */
  protected saveEditing(messageId: string): void {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || !this.currentUser || !this.selectedRecipient || this.isSavingEdit) return;
    this.isSavingEdit = true;
    this.directMessagesService
      .updateDirectMessage(this.currentUser.uid, this.selectedRecipient.uid, messageId, { text: trimmed })
      .finally(() => {
        this.isSavingEdit = false;
        this.cancelEditing();
      });
  }

  /** Toggles emoji picker for message. */
  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;
    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  /** Focuses composer. */
  private focusComposer(): void {
    this.composerTextarea?.nativeElement.focus();
  }

  /** Inserts text at cursor. */
  private insertText(text: string): void {
    const ta = this.composerTextarea?.nativeElement;
    if (!ta) {
      this.draftMessage = `${this.draftMessage}${text}`;
      return;
    }
    const start = ta.selectionStart ?? this.draftMessage.length;
    const end = ta.selectionEnd ?? start;
    this.draftMessage = `${this.draftMessage.slice(0, start)}${text}${this.draftMessage.slice(end)}`;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  /** Scrolls message stream to bottom. */
  private scrollToBottom(): void {
    const el = this.messageStream?.nativeElement;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  /** Reacts to direct message. */
  protected reactToDmMessage(messageId: string | undefined, emoji: string): void {
    if (!messageId || !this.currentUser || !this.selectedRecipient) return;
    const convId = this.directMessagesService.buildConversationId(this.currentUser.uid, this.selectedRecipient.uid);
    this.messageReactionsService.toggleReaction({
      docPath: `directMessages/${convId}/messages/${messageId}`,
      userId: this.currentUser.uid,
      emoji,
    });
    this.openEmojiPickerFor = null;
  }

  /** Shows reaction tooltip. */
  showReactionTooltip(event: MouseEvent, emoji: string, userIds: string[]): void {
    this.reactionTooltipService.show(event, emoji, userIds);
  }

  /** Hides reaction tooltip. */
  hideReactionTooltip(): void {
    this.reactionTooltipService.hide();
  }

  /** Gets avatar URL. */
  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  private updateDmMentionUsers(): void {
    if (!this.currentUser || !this.selectedRecipient) {
      this.cachedMentionUsers = [];
      return;
    }

    const map = new Map<string, ChannelMemberView>();

    map.set(this.currentUser.uid, {
      id: this.currentUser.uid,
      name: this.currentUser.name,
      profilePictureKey: this.currentUser.profilePictureKey,
      isCurrentUser: true,
      user: this.currentUser,
    });

    if (this.selectedRecipient.uid !== this.currentUser.uid) {
      map.set(this.selectedRecipient.uid, {
        id: this.selectedRecipient.uid,
        name: this.selectedRecipient.name,
        profilePictureKey: this.selectedRecipient.profilePictureKey,
        isCurrentUser: false,
        user: this.selectedRecipient,
      });
    }

    this.cachedMentionUsers = [...map.values()];
  }

  private updateMentionState(): void {
    const caret = this.mentionState.caretIndex ?? this.draftMessage.length;

    const userResult = updateTagSuggestions(this.draftMessage, caret, '@', this.cachedMentionUsers);

    if (userResult.isVisible) {
      this.mentionState = {
        ...userResult,
        caretIndex: this.mentionState.caretIndex,
        type: 'user',
      };
      return;
    }

    const channelResult = updateTagSuggestions(this.draftMessage, caret, '#', this.cachedChannels);

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
    this.mentionState = {
      suggestions: [],
      isVisible: false,
      triggerIndex: null,
      caretIndex: null,
    };
  }

  protected get userMentionSuggestions(): UserMentionSuggestion[] {
    return this.mentionState.type === 'user' ? (this.mentionState.suggestions as UserMentionSuggestion[]) : [];
  }

  protected get channelMentionSuggestions(): ChannelMentionSuggestion[] {
    return this.mentionState.type === 'channel' ? (this.mentionState.suggestions as ChannelMentionSuggestion[]) : [];
  }

  protected buildSegments(text: string) {
    return buildMessageSegments(text, this.cachedMentionUsers, this.cachedChannels);
  }

  protected insertMention(user: ChannelMemberView): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.draftMessage.length;
    const before = this.draftMessage.slice(0, this.mentionState.triggerIndex);
    const after = this.draftMessage.slice(caret);

    const text = `@${user.name} `;
    this.draftMessage = `${before}${text}${after}`;

    const newCaret = before.length + text.length;
    queueMicrotask(() => {
      const ta = this.composerTextarea?.nativeElement;
      ta?.focus();
      ta?.setSelectionRange(newCaret, newCaret);
    });

    this.resetMentionState();
  }

  protected insertChannel(channel: { name: string }): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.draftMessage.length;
    const before = this.draftMessage.slice(0, this.mentionState.triggerIndex);
    const after = this.draftMessage.slice(caret);

    const text = `#${channel.name} `;
    this.draftMessage = `${before}${text}${after}`;

    const newCaret = before.length + text.length;
    queueMicrotask(() => {
      const ta = this.composerTextarea?.nativeElement;
      ta?.focus();
      ta?.setSelectionRange(newCaret, newCaret);
    });

    this.resetMentionState();
  }

  protected get recipientOnline(): boolean {
    return !!this.selectedRecipient?.onlineStatus;
  }
}
