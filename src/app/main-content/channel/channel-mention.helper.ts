import type { ChannelMemberView } from '../../types';
import type { MentionSegment } from './channel.types';

/**
 * Escapes special regex characters in a string.
 * @param value The string to escape
 * @returns Escaped string safe for regex
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a regex pattern to match mentions from cached members.
 * @param cachedMembers Array of channel members
 * @returns RegExp for matching mentions or null if no members
 */
export function buildMentionRegex(cachedMembers: ChannelMemberView[]): RegExp | null {
  if (!cachedMembers.length) return null;

  const names = cachedMembers
    .map((member) => member.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegex(name));

  if (!names.length) return null;
  return new RegExp(`@(${names.join('|')})`, 'gi');
}

/**
 * Parses message text into segments, identifying mentions.
 * @param text The message text
 * @param cachedMembers Array of channel members
 * @returns Array of text segments with potential mention data
 */
export function buildMessageSegments(text: string, cachedMembers: ChannelMemberView[]): MentionSegment[] {
  if (!text) return [{ text: '' }];

  const regex = buildMentionRegex(cachedMembers);
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
    const member = cachedMembers.find((entry) => entry.name.toLowerCase() === mentionName.toLowerCase());
    segments.push({ text: match[0], member });
    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ text }];
}

/**
 * Extracts mentioned members from message text.
 * @param text The message text
 * @param cachedMembers Array of channel members
 * @returns Array of mentioned members
 */
export function getMentionedMembers(text: string, cachedMembers: ChannelMemberView[]): ChannelMemberView[] {
  const regex = buildMentionRegex(cachedMembers);
  if (!regex) return [];

  const found = new Map<string, ChannelMemberView>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const mentionName = match[1] ?? '';
    const member = cachedMembers.find((entry) => entry.name.toLowerCase() === mentionName.toLowerCase());
    if (member) {
      found.set(member.id, member);
    }
  }

  return Array.from(found.values());
}

/**
 * Updates mention suggestions based on text input and caret position.
 * @param messageText Current message text
 * @param caretIndex Current caret position
 * @param cachedMembers Array of channel members
 * @returns Updated mention state
 */
export function updateMentionSuggestions(
  messageText: string,
  caretIndex: number | null,
  cachedMembers: ChannelMemberView[]
): { suggestions: ChannelMemberView[]; isVisible: boolean; triggerIndex: number | null } {
  const caret = caretIndex ?? messageText.length;
  const textUpToCaret = messageText.slice(0, caret);
  const atIndex = textUpToCaret.lastIndexOf('@');

  if (atIndex === -1) {
    return { suggestions: [], isVisible: false, triggerIndex: null };
  }

  if (atIndex > 0) {
    const charBefore = textUpToCaret[atIndex - 1];
    if (!/\s/.test(charBefore)) {
      return { suggestions: [], isVisible: false, triggerIndex: null };
    }
  }

  const query = textUpToCaret.slice(atIndex + 1);

  if (/\s/.test(query)) {
    return { suggestions: [], isVisible: false, triggerIndex: null };
  }

  const normalizedQuery = query.toLowerCase();
  const suggestions = cachedMembers.filter((member) => member.name.toLowerCase().includes(normalizedQuery));

  return {
    suggestions,
    isVisible: suggestions.length > 0,
    triggerIndex: atIndex,
  };
}
