import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, distinctUntilChanged, filter, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { ThreadService } from '../../services/thread.service';
import type { ChannelMemberView, ProfilePictureKey, ThreadContext } from '../../types';
import { AppUser, UserService } from '../../services/user.service';
import { EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { ChannelMembershipService } from '../../services/membership.service';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { buildMessageSegments, getMentionedMembers, updateTagSuggestions } from '../channel/channel-mention.helper';
import type {
  ChannelMentionSuggestion,
  MentionSegment,
  MentionState,
  MentionType,
  UserMentionSuggestion,
} from '../../types';

@Component({
  selector: 'app-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactions],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread {
  private readonly threadService = inject(ThreadService);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly reactionTooltipService = inject(ReactionTooltipService);
  private readonly profilePictureService = inject(ProfilePictureService);

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

  @ViewChild('replyTextarea') replyTextarea?: ElementRef<HTMLTextAreaElement>;

  @ViewChild('threadScrollArea') private threadScrollArea?: ElementRef<HTMLElement>;

  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  private mentionState: MentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  protected get isMentionListVisible() {
    return this.mentionState.isVisible;
  }
  protected get mentionType(): MentionType | undefined {
    return this.mentionState.type;
  }
  private cachedMembers: ChannelMemberView[] = [];
  private cachedChannels: ChannelMentionSuggestion[] = [];
  private threadSnapshot: ThreadContext | null = null;
  private isThreadPanelOpen = false;
  private pendingScrollToBottom = false;
  private allUsersSnapshot: AppUser[] = [];

  protected get currentUser() {
    const user = this.userService.currentUser()!;

    return {
      uid: user.uid,
      name: user.name,
      profilePictureKey: user.profilePictureKey,
    };
  }

  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
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
      this.updateMentionState();
    });

    this.userService
      .getAllUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => (this.allUsersSnapshot = users));

    this.userService.currentUser$
      .pipe(
        switchMap((user) => (user ? this.membershipService.getChannelsForUser(user.uid) : of([]))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((channels) => {
        this.cachedChannels = channels
          .map((channel) => ({
            id: channel.id,
            name: channel.title,
          }));
        this.updateMentionState();
      });

    this.thread$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((thread) => {
      this.threadSnapshot = thread;
    });

    this.threadService.threadPanelOpen$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((isOpen) => {
      this.isThreadPanelOpen = isOpen;
      if (isOpen && this.pendingScrollToBottom) {
        this.pendingScrollToBottom = false;
        this.scrollToBottom();
      }
    });

    this.thread$
      .pipe(
        map((thread) => ({
          rootId: thread?.root?.id ?? null,
          repliesCount: thread?.replies.length ?? 0,
        })),
        distinctUntilChanged(
          (previous, current) => previous.rootId === current.rootId && previous.repliesCount === current.repliesCount
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (!this.isThreadPanelOpen) {
          this.pendingScrollToBottom = true;
          return;
        }
        this.scrollToBottom();
      });

    const threadId$ = this.thread$.pipe(
      map((thread) => thread?.root?.id ?? null),
      distinctUntilChanged()
    );

    combineLatest([threadId$, this.threadService.threadPanelOpen$])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(([threadId, isOpen]) => Boolean(threadId) && isOpen),
        tap(() => requestAnimationFrame(() => this.focusComposer()))
      )
      .subscribe();
  }

  protected closeThread(): void {
    this.threadService.requestClose();
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
      this.resetMentionState();
    } catch (error) {
      console.error('Reply konnte nicht gespeichert werden', error);
    }
  }

  protected onReplyInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    this.draftReply = textarea?.value ?? this.draftReply;
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

  protected insertMention(member: ChannelMemberView): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.draftReply.length;
    const before = this.draftReply.slice(0, this.mentionState.triggerIndex);
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

    this.resetMentionState();
  }

  protected insertChannel(channel: ChannelMentionSuggestion): void {
    if (this.mentionState.triggerIndex === null) return;

    const caret = this.mentionState.caretIndex ?? this.draftReply.length;
    const before = this.draftReply.slice(0, this.mentionState.triggerIndex);
    const after = this.draftReply.slice(caret);

    const text = `#${channel.name} `;
    this.draftReply = `${before}${text}${after}`;

    const newCaret = before.length + text.length;
    queueMicrotask(() => {
      const textarea = this.replyTextarea?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      }
    });

    this.resetMentionState();
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
    return buildMessageSegments(text, this.cachedMembers, this.cachedChannels);
  }

  protected openMemberProfile(member?: ChannelMemberView): void {
    if (!member) return;

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

  private insertComposerText(text: string): void {
    const textarea = this.replyTextarea?.nativeElement;
    if (!textarea) {
      this.draftReply = `${this.draftReply}${text}`;
      this.mentionState.caretIndex = this.draftReply.length;
      return;
    }

    const start = textarea.selectionStart ?? this.draftReply.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.draftReply.slice(0, start);
    const after = this.draftReply.slice(end);
    this.draftReply = `${before}${text}${after}`;
    this.mentionState.caretIndex = start + text.length;

    requestAnimationFrame(() => {
      textarea.focus();
      const newCaret = start + text.length;
      textarea.setSelectionRange(newCaret, newCaret);
    });
  }

  private updateMentionState(): void {
    const caret = this.mentionState.caretIndex ?? this.draftReply.length;

    const userResult = updateTagSuggestions(this.draftReply, caret, '@', this.cachedMembers);

    if (userResult.isVisible) {
      this.mentionState = {
        ...userResult,
        caretIndex: this.mentionState.caretIndex,
        type: 'user',
      };
      return;
    }

    const channelResult = updateTagSuggestions(this.draftReply, caret, '#', this.cachedChannels);

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

  private async notifyMentionedMembers(text: string): Promise<void> {
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

    const channelTitle = this.threadSnapshot?.channelTitle ?? 'Unbekannter Channel';
    const threadLabel = this.threadSnapshot?.root?.text
      ? ` im Thread „${this.threadSnapshot.root.text.slice(0, 80)}${this.threadSnapshot.root.text.length > 80 ? '…' : ''}“`
      : '';

    const messageText = `Du wurdest von ${currentUser.name} am ${formattedTime} in #${channelTitle}${threadLabel} erwähnt.`;

    await Promise.all(
      mentionedMembers.map((member) => this.directMessagesService.sendSystemMessage(member.id, messageText))
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
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
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

  protected get userMentionSuggestions(): UserMentionSuggestion[] {
    return this.mentionState.type === 'user' ? (this.mentionState.suggestions as UserMentionSuggestion[]) : [];
  }

  protected get channelMentionSuggestions(): ChannelMentionSuggestion[] {
    return this.mentionState.type === 'channel' ? (this.mentionState.suggestions as ChannelMentionSuggestion[]) : [];
  }
}
