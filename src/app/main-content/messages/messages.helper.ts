import { Timestamp } from '@angular/fire/firestore';

/**
 * Formats a Firestore timestamp to time string in German format.
 * @param timestamp The Firestore timestamp
 * @returns Formatted time string (e.g., "14:30")
 */
export function formatTimestamp(timestamp?: Timestamp): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/**
 * Formats a Firestore timestamp to date label.
 * Returns "Heute" for today, otherwise a formatted date string.
 * @param timestamp The Firestore timestamp
 * @returns Date label string
 */
export function formatDateLabel(timestamp?: Timestamp): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  const today = new Date();
  if (isSameDay(date, today)) return 'Heute';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(date);
}

/**
 * Gets a date key for grouping messages.
 * @param timestamp The Firestore timestamp
 * @returns Date key string
 */
export function getDateKey(timestamp?: Timestamp): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Checks if two dates are the same day.
 * @param left First date
 * @param right Second date
 * @returns True if same day
 */
export function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
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
