/**
 * Formats a date to time string in German format.
 * @param timestamp The date
 * @returns Formatted time string (e.g., "14:30")
 */
export function formatTimestamp(timestamp?: Date): string {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/**
 * Formats a date to date label.
 * Returns "Heute" for today, otherwise a formatted date string.
 * @param timestamp The date
 * @returns Date label string
 */
export function formatDateLabel(timestamp?: Date): string {
  if (!timestamp) return '';
  const today = new Date();
  if (isSameDay(timestamp, today)) return 'Heute';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(timestamp);
}

/**
 * Gets a date key for grouping messages.
 * @param timestamp The date
 * @returns Date key string
 */
export function getDateKey(timestamp?: Date): string {
  if (!timestamp) return '';
  return `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
}

/**
 * Checks if two dates are the same day.
 * @param left First date
 * @param right Second date
 * @returns True if same day
 */
export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Checks if a name mention exists in text.
 * @param text The text to search
 * @param name The name to find
 * @returns True if mention found
 */
export function hasMention(text: string, name: string): boolean {
  if (!name) return false;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRegex = new RegExp(`@${escapedName}\\b`, 'i');
  return mentionRegex.test(text);
}
