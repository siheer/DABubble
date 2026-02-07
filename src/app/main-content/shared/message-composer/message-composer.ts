import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, ViewEncapsulation, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ChannelMentionSuggestion, MentionType, ProfilePictureKey, UserMentionSuggestion } from '../../../types';
import { EMOJI_CHOICES } from '../../../texts';
import { MentionSuggestions } from '../mention-suggestions/mention-suggestions';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, MentionSuggestions],
  templateUrl: './message-composer.html',
  styleUrl: './message-composer.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MessageComposer {
  text = input('');
  placeholder = input('');
  placeholderPrefix = input<string | null>(null);
  placeholderHighlight = input<string | null>(null);
  ariaLabel = input('');
  disabled = input(false);
  disableSend = input(false);
  isEmojiPickerOpen = input(false);
  avatarUrlResolver = input<(key?: ProfilePictureKey) => string>(() => '');
  showMentions = input(false);
  mentionType = input<MentionType | undefined>(undefined);
  userSuggestions = input<UserMentionSuggestion[]>([]);
  channelSuggestions = input<ChannelMentionSuggestion[]>([]);
  showMemberMentionTrigger = input(true);
  showChannelMentionTrigger = input(false);

  protected readonly emojiChoices = EMOJI_CHOICES;
  protected readonly hasRichPlaceholder = computed(() => {
    const prefix = this.placeholderPrefix();
    const highlight = this.placeholderHighlight();
    return Boolean((prefix && prefix.length) || (highlight && highlight.length));
  });

  protected readonly placeholderText = computed(() => {
    if (this.hasRichPlaceholder()) {
      return `${this.placeholderPrefix() ?? ''}${this.placeholderHighlight() ?? ''}`;
    }
    return this.placeholder();
  });

  protected readonly placeholderAttribute = computed(() => (this.hasRichPlaceholder() ? ' ' : this.placeholderText()));

  textChange = output<string>();
  submitMessage = output<void>();
  toggleEmojiPicker = output<void>();
  emojiSelected = output<string>();
  mentionTrigger = output<void>();
  channelMentionTrigger = output<void>();
  composerInput = output<Event>();
  composerKeydown = output<Event>();
  userMentionSelected = output<UserMentionSuggestion>();
  channelMentionSelected = output<ChannelMentionSuggestion>();

  @ViewChild('composerTextarea') private composerTextarea?: ElementRef<HTMLTextAreaElement>;

  focus(): void {
    this.composerTextarea?.nativeElement.focus();
  }

  get textareaElement(): HTMLTextAreaElement | null {
    return this.composerTextarea?.nativeElement ?? null;
  }
}
