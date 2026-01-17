import type { ChannelMemberView } from '../../types';

/** Represents a text segment with optional member mention. */
export type MentionSegment = {
  text: string;
  member?: ChannelMemberView;
};

/** State for mention suggestions tracking. */
export interface MentionState {
  suggestions: ChannelMemberView[];
  isVisible: boolean;
  triggerIndex: number | null;
  caretIndex: number | null;
}
