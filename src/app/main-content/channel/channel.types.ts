import type { ChannelMemberView } from '../../types';

/**
 * Represents a text segment that may contain a user mention.
 */
export type MentionSegment = {
  text: string;
  member?: ChannelMemberView;
};

/**
 * State for tracking user mention suggestions.
 */
export interface MentionState {
  suggestions: ChannelMemberView[];
  isVisible: boolean;
  triggerIndex: number | null;
  caretIndex: number | null;
}
