import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, input, output } from '@angular/core';
import type { ChannelMentionSuggestion, MentionType, ProfilePictureKey, UserMentionSuggestion } from '../../../types';

@Component({
  selector: 'app-mention-suggestions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mention-suggestions.html',
  styleUrl: './mention-suggestions.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MentionSuggestions {
  visible = input(false);
  mentionType = input<MentionType | undefined>(undefined);
  userSuggestions = input<UserMentionSuggestion[]>([]);
  channelSuggestions = input<ChannelMentionSuggestion[]>([]);
  avatarUrlResolver = input<(key?: ProfilePictureKey) => string>(() => '');

  userSelected = output<UserMentionSuggestion>();
  channelSelected = output<ChannelMentionSuggestion>();
}
