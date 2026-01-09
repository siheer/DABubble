import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import { ThreadService } from '../../services/thread.service';
import type { ThreadContext } from '../../types';
import { UserService } from '../../services/user.service';
import { EMOJI_CHOICES } from '../../texts';

@Component({
  selector: 'app-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread {
  private readonly threadService = inject(ThreadService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly thread$: Observable<ThreadContext | null> = this.threadService.thread$;

  private readonly channelId$: Observable<string | null> = this.route.parent!.paramMap.pipe(
    map((params) => params.get('channelId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly threadId$: Observable<string | null> = this.route.paramMap.pipe(
    map((params) => params.get('threadId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  @ViewChild('replyTextarea') replyTextarea?: ElementRef<HTMLTextAreaElement>;

  private threadScrollArea?: ElementRef<HTMLElement>;

  @ViewChild('threadScrollArea')
  set threadScrollAreaRef(ref: ElementRef<HTMLElement> | undefined) {
    this.threadScrollArea = ref;
    this.scrollToBottom();
  }

  protected messageReactions: Record<string, string> = {};
  protected openEmojiPickerFor: string | null = null;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;

  protected get currentUser() {
    const user = this.userService.currentUser();

    return {
      name: user?.name ?? 'Gast',
      avatar: user?.photoUrl ?? 'imgs/default-profile-picture.png',
    };
  }

  protected draftReply = '';

  constructor() {
    combineLatest([this.channelId$, this.threadId$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([channelId, threadId]) => {
        if (channelId && threadId) {
          this.threadService.loadThread(channelId, threadId);
        } else {
          this.threadService.reset();
        }
      });

    this.thread$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.scrollToBottom());
  }

  protected async closeThread(): Promise<void> {
    const channelId =
      this.route.parent?.snapshot.paramMap.get('channelId') ?? this.route.snapshot.paramMap.get('channelId');
    this.threadService.reset();

    if (channelId) {
      await this.router.navigate(['/main/channels', channelId]);
    } else {
      await this.router.navigate(['/main']);
    }
  }

  protected async sendReply(): Promise<void> {
    const trimmed = this.draftReply.trim();
    if (!trimmed) return;

    try {
      await this.threadService.addReply(trimmed);
      this.draftReply = '';
    } catch (error) {
      console.error('Reply konnte nicht gespeichert werden', error);
    }
  }

  protected onReplyKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' || keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendReply();
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

  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;

    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  protected focusComposer(): void {
    this.replyTextarea?.nativeElement.focus();
  }

  protected startEditing(message: { id?: string; text: string; isOwn?: boolean }): void {
    if (!message.id || !message.isOwn) return;
    this.editingMessageId = message.id;
    this.editMessageText = message.text;
  }

  protected startEditingRoot(message: { text: string; isOwn?: boolean; id?: string }): void {
    if (!message.isOwn) return;
    this.editingMessageId = message.id ?? 'root';
    this.editMessageText = message.text;
  }

  protected cancelEditing(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  protected async saveEditing(message: { id?: string; isOwn?: boolean }, isRoot = false): Promise<void> {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || this.isSavingEdit) return;
    this.isSavingEdit = true;

    try {
      if (isRoot) {
        await this.threadService.updateRootMessage(trimmed);
      } else if (message.id) {
        await this.threadService.updateReply(message.id, trimmed);
      }
      this.cancelEditing();
    } finally {
      this.isSavingEdit = false;
    }
  }

  private scrollToBottom(): void {
    const element = this.threadScrollArea?.nativeElement;
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }
}
