import { Component, DestroyRef, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, distinctUntilChanged, filter, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { ThreadService } from '../../services/thread.service';
import { AppUser, UserService } from '../../services/user.service';
import { ChannelMembershipService } from '../../services/membership.service';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { MessageReactionsService } from '../../services/message-reactions.service';
import { ReactionTooltipService } from '../../services/reaction-tooltip.service';
import { ProfilePictureService } from '../../services/profile-picture.service';
import type { ChannelMemberView, ProfilePictureKey, ThreadContext } from '../../types';
import { EMOJI_CHOICES } from '../../texts';
import { MessageReactions } from '../message-reactions/message-reactions';
import { MemberDialog } from '../member-dialog/member-dialog';
import { buildMessageSegments, getMentionedMembers, updateMentionSuggestions } from '../channel/channel-mention.helper';
import type { MentionSegment, MentionState } from './thread.types';

/** Thread component for displaying and managing threaded replies. */
@Component({
  selector: 'app-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactions],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread {
  private static readonly SYSTEM_PROFILE_PICTURE_KEY: ProfilePictureKey = 'default';
  private static readonly SYSTEM_AUTHOR_NAME = 'System';

  // Services
  private readonly threadService = inject(ThreadService);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageReactionsService = inject(MessageReactionsService);
  private readonly reactionTooltipService = inject(ReactionTooltipService);
  private readonly profilePictureService = inject(ProfilePictureService);

  // Observables
  protected readonly thread$: Observable<ThreadContext | null> = this.threadService.thread$;
  private readonly channelId$: Observable<string | null> = this.route.parent!.paramMap.pipe(
    map((p) => p.get('channelId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  private readonly threadId$: Observable<string | null> = this.route.paramMap.pipe(
    map((p) => p.get('threadId')),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  protected readonly members$ = this.createMembersObservable();

  // ViewChild
  @ViewChild('replyTextarea') replyTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('threadScrollArea')
  threadScrollArea?: ElementRef<HTMLElement>;

  // State
  protected openEmojiPickerFor: string | null = null;
  protected isComposerEmojiPickerOpen = false;
  protected readonly emojiChoices = EMOJI_CHOICES;
  protected editingMessageId: string | null = null;
  protected editMessageText = '';
  protected isSavingEdit = false;
  protected draftReply = '';

  // Mention state
  private mentionState: MentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  protected get mentionSuggestions() {
    return this.mentionState.suggestions;
  }
  protected get isMentionListVisible() {
    return this.mentionState.isVisible;
  }

  // Cached data
  private cachedMembers: ChannelMemberView[] = [];
  private threadSnapshot: ThreadContext | null = null;

  /** Gets current user. */
  protected get currentUser() {
    const u = this.userService.currentUser();
    return { uid: u?.uid, name: u?.name ?? 'Gast', profilePictureKey: u?.profilePictureKey ?? 'default' };
  }

  constructor() {
    combineLatest([this.channelId$, this.threadId$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([cId, tId]) => {
        if (cId && tId) this.threadService.loadThread(cId, tId);
        else this.threadService.reset();
      });
    this.members$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      this.cachedMembers = m;
      this.updateMentionState();
    });
    this.thread$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((t) => (this.threadSnapshot = t));
    this.thread$
      .pipe(
        map((t) => t?.replies.length ?? 0),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.scrollToBottom());
    combineLatest([this.thread$.pipe(map((t) => t?.root?.id ?? null)), this.threadService.threadPanelOpen$])
      .pipe(
        filter(([rootId, isOpen]) => !!rootId && isOpen),
        distinctUntilChanged(([prevId, prevOpen], [currId, currOpen]) => prevId === currId && prevOpen === currOpen),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        requestAnimationFrame(() => this.scrollToBottom());
      });
  }

  /** Creates members observable. */
  private createMembersObservable(): Observable<ChannelMemberView[]> {
    return this.channelId$.pipe(
      switchMap((cId) =>
        !cId
          ? of<ChannelMemberView[]>([])
          : combineLatest([this.membershipService.getChannelMembers(cId), this.userService.getAllUsers()]).pipe(
              map(([members, users]) => this.enrichMembers(members, users))
            )
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Enriches members with user data. */
  private enrichMembers(members: ChannelMemberView[], users: AppUser[]): ChannelMemberView[] {
    const currentUserId = this.userService.currentUser()?.uid;
    const userMap = new Map(users.map((u) => [u.uid, u]));
    return members.map((m) => {
      const user = userMap.get(m.id);
      const ppk = user?.profilePictureKey ?? m.profilePictureKey ?? 'default';
      return {
        id: m.id,
        name: user?.name ?? m.name,
        avatar: this.profilePictureService.getUrl(ppk),
        subtitle: m.subtitle,
        isCurrentUser: m.id === currentUserId,
        user: user ?? {
          uid: m.id,
          name: m.name,
          email: null,
          profilePictureKey: ppk,
          onlineStatus: false,
          lastSeen: undefined,
          updatedAt: undefined,
          createdAt: undefined,
        },
      };
    });
  }

  /** Closes thread. */
  protected async closeThread(): Promise<void> {
    const cId = this.route.parent?.snapshot.paramMap.get('channelId') ?? this.route.snapshot.paramMap.get('channelId');
    this.threadService.reset();
    await this.router.navigate(cId ? ['/main/channels', cId] : ['/main']);
  }

  /** Sends reply to thread. */
  protected async sendReply(): Promise<void> {
    const trimmed = this.draftReply.trim();
    if (!trimmed) return;
    try {
      await this.threadService.addReply(trimmed);
      try {
        await this.notifyMentionedMembers(trimmed);
      } catch (e) {
        console.error('Fehler beim Versenden der Mention-Benachrichtigung', e);
      }
      this.draftReply = '';
      this.isComposerEmojiPickerOpen = false;
      this.resetMentionState();
    } catch (e) {
      console.error('Reply konnte nicht gespeichert werden', e);
    }
  }

  /** Handles reply input. */
  protected onReplyInput(event: Event): void {
    const ta = event.target as HTMLTextAreaElement | null;
    this.draftReply = ta?.value ?? this.draftReply;
    this.mentionState.caretIndex = ta?.selectionStart ?? null;
    this.updateMentionState();
  }

  /** Toggles emoji picker. */
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
    this.updateMentionState();
  }

  /** Inserts member mention. */
  protected insertMention(member: ChannelMemberView): void {
    if (this.mentionState.triggerIndex === null) return;
    const caret = this.mentionState.caretIndex ?? this.draftReply.length;
    const before = this.draftReply.slice(0, this.mentionState.triggerIndex);
    const after = this.draftReply.slice(caret);
    const mention = `@${member.name} `;
    this.draftReply = `${before}${mention}${after}`;
    const newCaret = before.length + mention.length;
    queueMicrotask(() => {
      const ta = this.replyTextarea?.nativeElement;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });
    this.resetMentionState();
  }

  /** Handles Enter key. */
  protected onReplyKeydown(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.key !== 'Enter' || ke.shiftKey) return;
    ke.preventDefault();
    this.sendReply();
  }

  /** Toggles emoji picker for message. */
  toggleEmojiPicker(messageId: string | undefined): void {
    if (!messageId) return;
    this.openEmojiPickerFor = this.openEmojiPickerFor === messageId ? null : messageId;
  }

  /** Focuses composer. */
  protected focusComposer(): void {
    this.replyTextarea?.nativeElement.focus();
  }

  /** Builds message segments. */
  protected buildMessageSegments(text: string): MentionSegment[] {
    return buildMessageSegments(text, this.cachedMembers);
  }

  /** Opens member profile. */
  protected openMemberProfile(member?: ChannelMemberView): void {
    if (!member || member.isCurrentUser) return;
    this.dialog.open(MemberDialog, {
      data: {
        user: member.user ?? {
          uid: member.id,
          name: member.name,
          email: null,
          profilePictureKey: 'default',
          onlineStatus: false,
          lastSeen: undefined,
          updatedAt: undefined,
          createdAt: undefined,
        },
      },
    });
  }

  /** Inserts text at cursor. */
  private insertText(text: string): void {
    const ta = this.replyTextarea?.nativeElement;
    if (!ta) {
      this.draftReply = `${this.draftReply}${text}`;
      this.mentionState.caretIndex = this.draftReply.length;
      return;
    }
    const start = ta.selectionStart ?? this.draftReply.length;
    const end = ta.selectionEnd ?? start;
    this.draftReply = `${this.draftReply.slice(0, start)}${text}${this.draftReply.slice(end)}`;
    this.mentionState.caretIndex = start + text.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  /** Updates mention state. */
  private updateMentionState(): void {
    const result = updateMentionSuggestions(this.draftReply, this.mentionState.caretIndex, this.cachedMembers);
    this.mentionState = { ...this.mentionState, ...result };
  }

  /** Resets mention state. */
  private resetMentionState(): void {
    this.mentionState = { suggestions: [], isVisible: false, triggerIndex: null, caretIndex: null };
  }

  /** Notifies mentioned members. */
  private async notifyMentionedMembers(text: string): Promise<void> {
    const user = this.userService.currentUser();
    if (!user) return;
    const mentioned = getMentionedMembers(text, this.cachedMembers).filter((m) => m.id !== user.uid);
    if (!mentioned.length) return;
    const formattedTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date()
    );
    const channelTitle = this.threadSnapshot?.channelTitle ?? 'Unbekannter Channel';
    const threadLabel = this.threadSnapshot?.root?.text
      ? ` im Thread „${this.threadSnapshot.root.text.slice(0, 80)}${this.threadSnapshot.root.text.length > 80 ? '…' : ''}"`
      : '';
    const messageText = `Du wurdest von ${user.name} am ${formattedTime} in #${channelTitle}${threadLabel} erwähnt.`;
    await Promise.all(
      mentioned.map((m) =>
        this.directMessagesService.sendDirectMessage(
          {
            authorId: m.id,
            authorName: Thread.SYSTEM_AUTHOR_NAME,
            authorProfilePictureKey: Thread.SYSTEM_PROFILE_PICTURE_KEY,
            text: messageText,
          },
          m.id
        )
      )
    );
  }

  /** Starts editing message. */
  protected startEditing(message: { id?: string; text: string; isOwn?: boolean }): void {
    if (!message.id || !message.isOwn) return;
    this.editingMessageId = message.id;
    this.editMessageText = message.text;
  }

  /** Starts editing root message. */
  protected startEditingRoot(message: { text: string; isOwn?: boolean; id?: string }): void {
    if (!message.isOwn) return;
    this.editingMessageId = message.id ?? 'root';
    this.editMessageText = message.text;
  }

  /** Cancels editing. */
  protected cancelEditing(): void {
    this.editingMessageId = null;
    this.editMessageText = '';
  }

  /** Saves edited message. */
  protected async saveEditing(message: { id?: string; isOwn?: boolean }, isRoot = false): Promise<void> {
    const trimmed = this.editMessageText.trim();
    if (!trimmed || this.isSavingEdit) return;
    this.isSavingEdit = true;
    try {
      if (isRoot) await this.threadService.updateRootMessage(trimmed);
      else if (message.id) await this.threadService.updateReply(message.id, trimmed);
      this.cancelEditing();
    } finally {
      this.isSavingEdit = false;
    }
  }

  /** Scrolls to bottom. */
  private scrollToBottom(): void {
    const el = this.threadScrollArea?.nativeElement;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  /** Reacts to root message. */
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

  /** Reacts to reply. */
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
}
