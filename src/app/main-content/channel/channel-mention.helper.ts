import type { ChannelMemberView } from '../../types';
import type { ChannelMentionSuggestion, MentionSegment } from '../../classes/mentions.types';

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function buildChannelRegex(channels: ChannelMentionSuggestion[]): RegExp | null {
  if (!channels.length) return null;

  const names = channels
    .map((channel) => channel.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegex(name));

  if (!names.length) return null;
  return new RegExp(`#(${names.join('|')})`, 'gi');
}

export function buildMessageSegments(
  text: string,
  members: ChannelMemberView[],
  channels: ChannelMentionSuggestion[] = []
): MentionSegment[] {
  if (!text) return [{ kind: 'text', text: '' }];

  const userRegex = buildMentionRegex(members);
  const channelRegex = buildChannelRegex(channels);
  const sources: string[] = [];

  if (userRegex) sources.push(userRegex.source);
  if (channelRegex) sources.push(channelRegex.source);

  if (!sources.length) {
    return [{ kind: 'text', text }];
  }

  const combined = new RegExp(sources.join('|'), 'gi');
  const parts: MentionSegment[] = [];
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > index) {
      parts.push({ kind: 'text', text: text.slice(index, match.index) });
    }

    const value = match[0];

    if (value.startsWith('@')) {
      const name = value.slice(1);
      const member = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
      parts.push(member ? { kind: 'member', text: value, member } : { kind: 'text', text: value });
    } else if (value.startsWith('#')) {
      const name = value.slice(1);
      const channel = channels.find((c) => c.name.toLowerCase() === name.toLowerCase());
      parts.push(channel ? { kind: 'channel', text: value, channel } : { kind: 'text', text: value });
    } else {
      parts.push({ kind: 'text', text: value });
    }

    index = combined.lastIndex;
  }

  if (index < text.length) {
    parts.push({ kind: 'text', text: text.slice(index) });
  }

  return parts.length ? parts : [{ kind: 'text', text }];
}

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

export function updateTagSuggestions<T extends { name: string }>(
  messageText: string,
  caretIndex: number | null,
  trigger: '@' | '#',
  items: T[]
): { suggestions: T[]; isVisible: boolean; triggerIndex: number | null } {
  const caret = caretIndex ?? messageText.length;
  const textUpToCaret = messageText.slice(0, caret);
  const triggerIndex = textUpToCaret.lastIndexOf(trigger);

  if (triggerIndex === -1) {
    return { suggestions: [], isVisible: false, triggerIndex: null };
  }

  if (triggerIndex > 0 && !/\s/.test(textUpToCaret[triggerIndex - 1])) {
    return { suggestions: [], isVisible: false, triggerIndex: null };
  }

  const query = textUpToCaret.slice(triggerIndex + 1);
  if (/\s/.test(query)) {
    return { suggestions: [], isVisible: false, triggerIndex: null };
  }

  const normalizedQuery = query.toLowerCase();
  const suggestions = items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));

  return {
    suggestions,
    isVisible: suggestions.length > 0,
    triggerIndex,
  };
}
