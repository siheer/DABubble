import type { ChannelMessage, ChannelDay, ChannelMessageView, ProfilePictureKey } from '../../types';
import type { AppUser } from '../../services/user.service';

/**
 * Converts a timestamp value to a Date object.
 * Handles Date objects, Firestore Timestamps, and undefined values.
 * @param value The timestamp value to convert
 * @returns A Date object or undefined
 */
export function timestampToDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }

  return undefined;
}

/**
 * Formats a Date object to a time string in German format.
 * @param date The date to format
 * @returns Formatted time string (e.g., "14:30 Uhr")
 */
export function formatTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(date)} Uhr`;
}

/**
 * Builds a day label for message grouping.
 * Returns "Heute" for today, otherwise a formatted date string.
 * @param date The date to format
 * @returns Day label string
 */
export function buildDayLabel(date: Date): string {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) return 'Heute';

  const formatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return formatter.format(date);
}

/**
 * Converts a channel message to a view-friendly message object.
 * @param message The raw channel message
 * @param currentUserId The current user's ID for ownership check
 * @returns A message view object
 */
export function toViewMessage(
  message: ChannelMessage & { author?: AppUser },
  currentUserId?: string
): ChannelMessageView {
  const createdAt = timestampToDate(message.createdAt) ?? new Date();
  const lastReplyAt = timestampToDate(message.lastReplyAt);

  return {
    id: message.id,
    authorId: message.authorId,
    author: message.author?.name ?? 'Unbekannter Nutzer',
    profilePictureKey: message.author?.profilePictureKey ?? 'default',
    createdAt,
    time: formatTime(createdAt),
    text: message.text ?? '',
    replies: message.replies ?? 0,
    lastReplyAt,
    lastReplyTime: lastReplyAt ? formatTime(lastReplyAt) : undefined,
    tag: message.tag,
    attachment: message.attachment,
    isOwn: message.authorId === currentUserId,
    reactions: message.reactions ?? {},
  };
}

/**
 * Groups messages by day for display.
 * @param messages Array of channel messages
 * @param currentUserId Current user's ID
 * @returns Array of grouped messages by day
 */
export function groupMessagesByDay(messages: ChannelMessage[], currentUserId?: string): ChannelDay[] {
  const grouped = new Map<string, ChannelDay>();

  messages
    .map((message) => toViewMessage(message, currentUserId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .forEach((message) => {
      const label = buildDayLabel(message.createdAt);
      const existingGroup = grouped.get(label);

      if (existingGroup) {
        existingGroup.messages.push(message);
      } else {
        grouped.set(label, {
          label,
          sortKey: message.createdAt.getTime(),
          messages: [message],
        });
      }
    });

  return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * Gets a snapshot of message count and last message ID from grouped days.
 * @param days Array of message days
 * @returns Object with count and lastId
 */
export function getMessageSnapshot(days: ChannelDay[]): { count: number; lastId?: string } {
  const count = days.reduce((total, day) => total + day.messages.length, 0);
  const lastDay = days.at(-1);
  const lastMessage = lastDay?.messages.at(-1);

  return { count, lastId: lastMessage?.id };
}
