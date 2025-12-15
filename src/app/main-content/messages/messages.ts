import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppUser, UserService } from '../../services/user.service';
import { DirectMessageSelectionService } from '../../services/direct-message-selection.service';
import { DirectMessageEntry } from '../../services/firestore.service';
import { Timestamp } from '@angular/fire/firestore';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

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
  private readonly directMessageSelectionService = inject(
    DirectMessageSelectionService
  );
  private readonly destroyRef = inject(DestroyRef);

  protected readonly selectedRecipient$ =
    this.directMessageSelectionService.selectedUser$;
  private readonly currentUser$ = toObservable(this.userService.currentUser);

  protected readonly messages$: Observable<MessageBubble[]> = combineLatest([
    this.currentUser$,
    this.selectedRecipient$,
  ]).pipe(
    switchMap(([currentUser, recipient]) => {
      if (!currentUser || !recipient) {
        return of([]);
      }

      return this.firestoreService
        .getDirectConversationMessages(currentUser.uid, recipient.uid)
        .pipe(
          map((messages) =>
            messages.map((message) => this.mapMessage(message, currentUser))
          )
        );
    })
  );

  protected selectedRecipient: AppUser | null = null;
  protected currentUser: AppUser | null = null;

  protected readonly helperText =
    'Beginne damit, jemanden zu einem oder mehreren deiner Channels hinzuzufügen. ' +
    'Du kannst hier, in einer Nachricht, @erwähnungen nutzen, um Personen zu benachrichtigen.';
  protected draftMessage = '';
  protected isSending = false;
  protected messageReactions: Record<string, string> = {};
  protected openEmojiPickerFor: string | null = null;
  protected readonly emojiChoices = ['😀', '😄', '😍', '🎉', '🤔', '👏'];

  constructor() {
    this.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => (this.currentUser = user));

    this.selectedRecipient$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((recipient) => (this.selectedRecipient = recipient));
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

  private mapMessage(
    message: DirectMessageEntry,
    currentUser: AppUser
  ): MessageBubble {
    return {
      id: message.id,
      author: message.authorName ?? 'Unbekannter Nutzer',
      avatar: message.authorAvatar ?? 'imgs/default-profile-picture.png',
      content: message.text ?? '',
      timestamp: message.createdAt,
      isOwn: message.authorId === currentUser.uid,
    };
  }

  react(messageId: string | undefined, reaction: string): void {
    if (!messageId) return;

    this.messageReactions = {
      ...this.messageReactions,
      [messageId]: reaction,
    };
    this.openEmojiPickerFor = null;
  }

  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;

    this.openEmojiPickerFor =
      this.openEmojiPickerFor === messageId ? null : messageId;
  }


}