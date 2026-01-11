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
import type { DirectMessageEntry, MessageBubble } from '../../types';
import { Timestamp } from '@angular/fire/firestore';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MemberDialog } from '../member-dialog/member-dialog';
import { EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactions],

  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  private static readonly SYSTEM_MENTION_AVATAR = 'imgs/default-profile-picture.png';
  private static readonly SYSTEM_AUTHOR_NAME = 'System';
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly reactionTooltipService = inject(ReactionTooltipService);

  private readonly currentUser$ = this.userService.currentUser$;

  private readonly dmUserId$ = this.route.paramMap.pipe(
    map((params) => params.get('dmId')),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly recipientSignal = signal<AppUser | null>(null);
  private readonly recipientCache = new Map<string, AppUser | null>();

  protected readonly selectedRecipient$: Observable<AppUser | null> = toObservable(this.recipientSignal);

  private readonly rawMessages$: Observable<MessageBubble[]> = combineLatest([
    this.currentUser$,
    this.selectedRecipient$,
  ]).pipe(
    switchMap(([currentUser, recipient]) => {
      if (!currentUser || !recipient) {
        return of([]);
      }

      return this.directMessagesService
        .getDirectConversationMessages(currentUser.uid, recipient.uid)
        .pipe(map((messages) => messages.map((message) => this.mapMessage(message, currentUser))));
    }),
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
  private messageStream?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea') private composerTextarea?: ElementRef<HTMLTextAreaElement>;

  @ViewChild('messageStream')
  set messageStreamRef(ref: ElementRef<HTMLElement> | undefined) {
    this.messageStream = ref;
    this.scrollToBottom();
  }

  constructor() {
    this.currentUser$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => (this.currentUser = user));

    this.dmUserId$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((dmId) => {
          if (!dmId) {
            return of({ dmId: null as string | null, recipient: null as AppUser | null });
          }

          if (this.recipientCache.has(dmId)) {
            return of({ dmId, recipient: this.recipientCache.get(dmId) ?? null });
          }

          return from(this.userService.getUserOnce(dmId)).pipe(
            map((recipient) => ({ dmId, recipient })),
            catchError((error) => {
              console.error(error);
              return of({ dmId, recipient: null });
            })
          );
        })
      )
      .subscribe(({ dmId, recipient }) => {
        if (dmId) {
          this.recipientCache.set(dmId, recipient);
        }
        this.recipientSignal.set(recipient);
      });

    this.selectedRecipient$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((recipient) => (this.selectedRecipient = recipient));
  }

  protected async sendMessage(): Promise<void> {
    const trimmed = this.draftMessage.trim();
    if (!trimmed || !this.currentUser || !this.selectedRecipient) return;

    this.isSending = true;

    try {
      await this.directMessagesService.sendDirectMessage(
        {
          authorId: this.currentUser.uid,
          authorName: this.currentUser.name,
          authorAvatar: this.currentUser.photoUrl,
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

  protected onComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' || keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendMessage();
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
  }

  protected openRecipientProfile(recipient: AppUser): void {
    if (this.currentUser?.uid === recipient.uid) {
      return;
    }
    this.dialog.open(MemberDialog, {
      data: { user: recipient },
    });
  }

  protected formatTimestamp(timestamp?: Timestamp): string {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  protected formatDateLabel(timestamp?: Timestamp): string {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    const today = new Date();
    if (this.isSameDay(date, today)) {
      return 'Heute';
    }

    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(date);
  }

  protected shouldShowDateDivider(messages: MessageBubble[], index: number): boolean {
    const current = messages[index];
    if (!current?.timestamp) return false;
    if (index === 0) return true;

    const previous = messages[index - 1];
    if (!previous?.timestamp) return true;

    return this.getDateKey(current.timestamp) !== this.getDateKey(previous.timestamp);
  }

  private mapMessage(message: DirectMessageEntry, currentUser: AppUser): MessageBubble {
    const isSystemMessage = message.authorName === Messages.SYSTEM_AUTHOR_NAME;
    const isOwn = !isSystemMessage && message.authorId === currentUser.uid; return {
      id: message.id,
      author: isOwn ? 'Du' : (message.authorName ?? 'Unbekannter Nutzer'),
      avatar: message.authorAvatar ?? 'imgs/default-profile-picture.png',
      content: message.text ?? '',
      timestamp: message.createdAt,
      isOwn,
      reactions: message.reactions ?? {},
    };
  }

  private async notifyMentionedRecipient(text: string): Promise<void> {
    if (!this.currentUser || !this.selectedRecipient) return;
    if (!this.hasRecipientMention(text)) return;
    if (this.currentUser.uid === this.selectedRecipient.uid) return;

    const formattedTime = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const messageText = `Du wurdest von ${this.currentUser.name} am ${formattedTime} im privaten Chat mit ${this.currentUser.name} erwähnt.`;

    await this.directMessagesService.sendDirectMessage(
      {
        authorId: this.currentUser.uid,
        authorName: Messages.SYSTEM_AUTHOR_NAME,
        authorAvatar: Messages.SYSTEM_MENTION_AVATAR,
        text: messageText,
      },
      this.selectedRecipient.uid
    );
  }

  private hasRecipientMention(text: string): boolean {
    if (!this.selectedRecipient?.name) return false;
    const escapedName = this.selectedRecipient.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`@${escapedName}\\b`, 'i');
    return mentionRegex.test(text);
  }

  protected startEditing(message: MessageBubble): void {
    if (!message.id || !message.isOwn) return;
    this.editingMessageId = message.id;
    this.editMessageText = message.content;
  }

  protected cancelEditing(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  protected saveEditing(messageId: string): void {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || !this.currentUser || !this.selectedRecipient) return;
    if (this.isSavingEdit) return;

    this.isSavingEdit = true;
    this.directMessagesService
      .updateDirectMessage(this.currentUser.uid, this.selectedRecipient.uid, messageId, { text: trimmed })
      .finally(() => {
        this.isSavingEdit = false;
        this.cancelEditing();
      });
  }

  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;

    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  private focusComposer(): void {
    this.composerTextarea?.nativeElement.focus();
  }

  private insertComposerText(text: string): void {
    const textarea = this.composerTextarea?.nativeElement;
    if (!textarea) {
      this.draftMessage = `${this.draftMessage}${text}`;
      return;
    }

    const start = textarea.selectionStart ?? this.draftMessage.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.draftMessage.slice(0, start);
    const after = this.draftMessage.slice(end);
    this.draftMessage = `${before}${text}${after}`;

    requestAnimationFrame(() => {
      textarea.focus();
      const newCaret = start + text.length;
      textarea.setSelectionRange(newCaret, newCaret);
    });
  }

  private scrollToBottom(): void {
    const element = this.messageStream?.nativeElement;
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }

  private getDateKey(timestamp?: Timestamp): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private isSameDay(left: Date, right: Date): boolean {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  protected reactToDmMessage(messageId: string | undefined, emoji: string): void {
    if (!messageId || !this.currentUser || !this.selectedRecipient) return;

    const conversationId = this.directMessagesService.buildConversationId(
      this.currentUser.uid,
      this.selectedRecipient.uid
    );

    this.messageReactionsService.toggleReaction({
      docPath: `directMessages/${conversationId}/messages/${messageId}`,
      userId: this.currentUser.uid,
      emoji,
    });

    this.openEmojiPickerFor = null;
  }

  showReactionTooltip(event: MouseEvent, emoji: string, userIds: string[]): void {
    this.reactionTooltipService.show(event, emoji, userIds);
  }

  hideReactionTooltip(): void {
    this.reactionTooltipService.hide();
  }
}
