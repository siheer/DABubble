import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, combineLatest, map, of, switchMap, tap, filter, distinctUntilChanged } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { FirestoreService } from '../../services/firestore.service';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AppUser, UserService } from '../../services/user.service';
import { DirectMessageEntry } from '../../services/firestore.service';
import { Timestamp } from '@angular/fire/firestore';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MemberDialog } from '../member-dialog/member-dialog';

type MessageBubble = {
  id?: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: Timestamp | undefined;
  isOwn?: boolean;
};
@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  private readonly firestoreService = inject(FirestoreService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser$ = toObservable(this.userService.currentUser);
  private readonly dmUserId$ = this.route.paramMap.pipe(map((params) => params.get('dmId')));

  protected readonly selectedRecipient$: Observable<AppUser | null> = combineLatest([
    this.dmUserId$,
    this.userService.getAllUsers(),
  ]).pipe(
    map(([dmId, users]) => users.find((u) => u.uid === dmId) ?? null),
    tap((recipient) => {
      const currentUser = this.userService.currentUser();
      if (recipient && currentUser) {
        void this.firestoreService.updateDirectMessageReadStatus(currentUser.uid, recipient.uid);
      }
    })
  );

  protected readonly messages$ = combineLatest([this.currentUser$, this.selectedRecipient$]).pipe(
    switchMap(([currentUser, recipient]) => {
      if (!currentUser || !recipient) {
        return of([]);
      }

      return this.firestoreService
        .getDirectConversationMessages(currentUser.uid, recipient.uid)
        .pipe(map((messages) => messages.map((message) => this.mapMessage(message, currentUser))));
    }),
    tap(() => this.scrollToBottom())
  );

  protected selectedRecipient: AppUser | null = null;
  protected currentUser: AppUser | null = null;

  protected draftMessage = '';
  protected isSending = false;
  protected messageReactions: Record<string, string> = {};
  protected openEmojiPickerFor: string | null = null;
  protected readonly emojiChoices = ['😀', '😁', '😂', '🤣', '😊', '😍'];
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  private messageStream?: ElementRef<HTMLElement>;

  @ViewChild('messageStream')
  set messageStreamRef(ref: ElementRef<HTMLElement> | undefined) {
    this.messageStream = ref;
    this.scrollToBottom();
  }

  constructor() {
    this.currentUser$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => (this.currentUser = user));

    this.selectedRecipient$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((recipient) => (this.selectedRecipient = recipient));
    combineLatest([this.currentUser$, this.selectedRecipient$])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(([currentUser, recipient]) => !!currentUser && !!recipient),
        distinctUntilChanged(([u1, r1], [u2, r2]) => u1?.uid === u2?.uid && r1?.uid === r2?.uid)
      )
      .subscribe(([currentUser, recipient]) => {
        this.firestoreService.updateDirectMessageReadStatus(currentUser!.uid, recipient!.uid);
      });
  }

  protected sendMessage(): void {
    const trimmed = this.draftMessage.trim();
    if (!trimmed || !this.currentUser || !this.selectedRecipient) return;

    this.isSending = true;
    this.firestoreService
      .sendDirectMessage(
        {
          authorId: this.currentUser.uid,
          authorName: this.currentUser.name,
          authorAvatar: this.currentUser.photoUrl,
          text: trimmed,
        },
        this.selectedRecipient.uid
      )
      .finally(() => {
        this.isSending = false;
        this.draftMessage = '';
        this.scrollToBottom();
      });
  }

  protected onComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' || keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendMessage();
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
    const isOwn = message.authorId === currentUser.uid;
    return {
      id: message.id,
      author: isOwn ? 'Du' : (message.authorName ?? 'Unbekannter Nutzer'),
      avatar: message.authorAvatar ?? 'imgs/default-profile-picture.png',
      content: message.text ?? '',
      timestamp: message.createdAt,
      isOwn,
    };
  }

  react(messageId: string | undefined, reaction: string): void {
    if (!messageId) return;
    if (this.messageReactions[messageId] === reaction) {
      const { [messageId]: _removed, ...rest } = this.messageReactions;
      this.messageReactions = rest;
    } else {
      this.messageReactions = {
        ...this.messageReactions,
        [messageId]: reaction,
      };
    }
    this.openEmojiPickerFor = null;
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
    this.firestoreService
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
}
