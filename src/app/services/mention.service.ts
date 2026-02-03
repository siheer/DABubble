import { Injectable } from '@angular/core';
import { ChannelMentionSuggestion, MentionState, MentionType, UserMentionSuggestion } from '../types';
import { updateTagSuggestions } from '../main-content/channel/channel-mention.helper';

@Injectable({ providedIn: 'root' })
export class MentionsService {
  update(
    text: string,
    caretIndex: number | null,
    members: UserMentionSuggestion[],
    channels: ChannelMentionSuggestion[]
  ): MentionState {
    const caret = caretIndex ?? text.length;

    const userResult = updateTagSuggestions(text, caret, '@', members);
    if (userResult.isVisible) {
      return {
        ...userResult,
        caretIndex: caret,
        type: 'user',
      };
    }

    const channelResult = updateTagSuggestions(text, caret, '#', channels);
    if (channelResult.isVisible) {
      return {
        ...channelResult,
        caretIndex: caret,
        type: 'channel',
      };
    }

    return this.reset();
  }

  reset(): MentionState {
    return {
      suggestions: [],
      isVisible: false,
      triggerIndex: null,
      caretIndex: null,
    };
  }
}
