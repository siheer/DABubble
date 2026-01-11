import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import { ThreadService } from '../../services/thread.service';
import type { ChannelMemberView, ThreadContext } from '../../types';
import { AppUser, UserService } from '../../services/user.service';
import { EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { ChannelMembershipService } from '../../services/membership.service';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';

type MentionSegment = {
  text: string;
  member?: ChannelMemberView;
};

@Component({
  selector: 'app-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactions],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread {
  private static readonly SYSTEM_MENTION_AVATAR = 'imgs/default-profile-picture.png';
  private static readonly SYSTEM_AUTHOR_NAME = 'System'
  private readonly threadService = inject(ThreadService);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly reactionTooltipService = inject(ReactionTooltipService);

  protected readonly thread$: Observable<ThreadContext | null> = this.threadService.thread$;

  private readonly channelId$: Observable<string | null> = this.route.parent!.paramMap.pipe(
    map((params) => params.get('channelId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly threadId$: Observable<string | null> = this.route.paramMap.pipe(
    map((params) => params.get('threadId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  protected readonly members$: Observable<ChannelMemberView[]> = this.channelId$.pipe(
    switchMap((channelId) => {
      if (!channelId) {
        return of<ChannelMemberView[]>([]);
      }

      return combineLatest([this.membershipService.getChannelMembers(channelId), this.userService.getAllUsers()]).pipe(
        map(([members, users]) => {
          const currentUserId = this.userService.currentUser()?.uid;
          const userMap = new Map(users.map((user) => [user.uid, user]));

          return members.map((member) => {
            const user = userMap.get(member.id);
            const avatar = user?.photoUrl ?? member.avatar ?? 'imgs/users/placeholder.svg';
            const name = user?.name ?? member.name;

            return {
              id: member.id,
              name,
              avatar,
              subtitle: member.subtitle,
              isCurrentUser: member.id === currentUserId,
              user: user ?? {
                uid: member.id,
                name,
                email: null,
                photoUrl: avatar,
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


  @ViewChild('replyTextarea') replyTextarea?: ElementRef<HTMLTextAreaElement>;

  private threadScrollArea?: ElementRef<HTMLElement>;

  @ViewChild('threadScrollArea')
  set threadScrollAreaRef(ref: ElementRef<HTMLElement> | undefined) {
    this.threadScrollArea = ref;
    this.scrollToBottom();
  }

  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected mentionSuggestions: ChannelMemberView[] = [];
  protected isMentionListVisible = false;
  private mentionTriggerIndex: number | null = null;
  private mentionCaretIndex: number | null = null;
  private cachedMembers: ChannelMemberView[] = [];
  private threadSnapshot: ThreadContext | null = null;

  protected get currentUser() {
    const user = this.userService.currentUser();

    return {
      uid: user?.uid,
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

    this.members$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((members) => {
      this.cachedMembers = members;
      this.updateMentionSuggestions();
    });

    this.thread$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((thread) => {
      this.threadSnapshot = thread;
      this.scrollToBottom();
    });
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
      try {
        await this.notifyMentionedMembers(trimmed);
      } catch (error) {
        console.error('Fehler beim Versenden der Mention-Benachrichtigung', error);
      }
      this.draftReply = '';
      this.isComposerEmojiPickerOpen = false;
      this.resetMentionSuggestions();
    } catch (error) {
      console.error('Reply konnte nicht gespeichert werden', error);
    }
  }

  protected onReplyInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    this.draftReply = textarea?.value ?? this.draftReply;
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

    const caret = this.mentionCaretIndex ?? this.draftReply.length;
    const before = this.draftReply.slice(0, this.mentionTriggerIndex);
    const after = this.draftReply.slice(caret);
    const mentionText = `@${member.name} `;

    this.draftReply = `${before}${mentionText}${after}`;
    const newCaret = before.length + mentionText.length;

    queueMicrotask(() => {
      const textarea = this.replyTextarea?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionSuggestions();
  }

  protected onReplyKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter' || keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendReply();
  }

  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;

    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  protected focusComposer(): void {
    this.replyTextarea?.nativeElement.focus();
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
      photoUrl: member.avatar || 'imgs/default-profile-picture.png',
      onlineStatus: false,
      lastSeen: undefined,
      updatedAt: undefined,
      createdAt: undefined,
    };

    this.dialog.open(MemberDialog, {
      data: { user: fallbackUser },
    });
  }
  
  private insertComposerText(text: string): void {
    const textarea = this.replyTextarea?.nativeElement;
    if (!textarea) {
      this.draftReply = `${this.draftReply}${text}`;
      this.mentionCaretIndex = this.draftReply.length;
      return;
    }

    const start = textarea.selectionStart ?? this.draftReply.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.draftReply.slice(0, start);
    const after = this.draftReply.slice(end);
    this.draftReply = `${before}${text}${after}`;
    this.mentionCaretIndex = start + text.length;

    requestAnimationFrame(() => {
      textarea.focus();
      const newCaret = start + text.length;
      textarea.setSelectionRange(newCaret, newCaret);
    });
  }

  private updateMentionSuggestions(): void {
    const caret = this.mentionCaretIndex ?? this.draftReply.length;
    const textUpToCaret = this.draftReply.slice(0, caret);
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

  private async notifyMentionedMembers(text: string): Promise<void> {
    const currentUser = this.userService.currentUser();
    if (!currentUser) return;

    const mentionedMembers = this.getMentionedMembers(text).filter((member) => member.id !== currentUser.uid);
    if (!mentionedMembers.length) return;

    const formattedTime = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const channelTitle = this.threadSnapshot?.channelTitle ?? 'Unbekannter Channel';
    const threadLabel = this.threadSnapshot?.root?.text
      ? ` im Thread „${this.threadSnapshot.root.text.slice(0, 80)}${this.threadSnapshot.root.text.length > 80 ? '…' : ''}“`
      : '';

    const messageText = `Du wurdest von ${currentUser.name} am ${formattedTime} in #${channelTitle}${threadLabel} erwähnt.`;

    await Promise.all(
      mentionedMembers.map((member) =>
        this.directMessagesService.sendDirectMessage(
          {
            authorId: currentUser.uid,
            authorName: Thread.SYSTEM_AUTHOR_NAME,
            authorAvatar: Thread.SYSTEM_MENTION_AVATAR,
            text: messageText,
          },
          member.id
        )
      )
    );
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

  protected reactToRootMessage(emoji: string): void {
    const thread = this.threadService.threadSnapshot();
    const user = this.userService.currentUser();

    if (!thread || !user) return;

    this.messageReactionsService.toggleReaction({
      docPath: `channels/${thread.channelId}/messages/${thread.root.id}`,
      userId: user.uid,
      emoji,
    });

    this.openEmojiPickerFor = null;
  }

  protected reactToReply(replyId: string | undefined, emoji: string): void {
    if (!replyId) return;

    const thread = this.threadService.threadSnapshot();
    const user = this.userService.currentUser();

    if (!thread || !user) return;

    this.messageReactionsService.toggleReaction({
      docPath: `channels/${thread.channelId}/messages/${thread.root.id}/threads/${replyId}`,
      userId: user.uid,
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
