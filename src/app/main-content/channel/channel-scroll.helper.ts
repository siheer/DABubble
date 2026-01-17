import { ElementRef, NgZone } from '@angular/core';
import type { ChannelDay } from '../../types';
import { getMessageSnapshot } from './channel-message.helper';

/**
 * Checks if the scroll container is near the bottom.
 * @param element The scrollable element
 * @param threshold Distance from bottom in pixels
 * @returns True if near bottom
 */
export function isNearBottom(element: HTMLElement | undefined, threshold = 40): boolean {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

/**
 * Scrolls the container to the bottom.
 * @param elementRef The element reference to scroll
 * @param ngZone Angular zone for optimization
 */
export function scrollToBottom(elementRef: ElementRef<HTMLElement> | undefined, ngZone: NgZone): void {
  const element = elementRef?.nativeElement;
  if (!element) return;

  ngZone.runOutsideAngular(() => {
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  });
}

/**
 * Determines if auto-scroll should occur based on message changes.
 * @param days Current message days
 * @param lastMessageCount Previous message count
 * @param lastMessageId Previous last message ID
 * @returns Object with shouldScroll flag and updated tracking values
 */
export function shouldAutoScroll(
  days: ChannelDay[],
  lastMessageCount: number,
  lastMessageId?: string
): { shouldScroll: boolean; newCount: number; newLastId?: string } {
  const snapshot = getMessageSnapshot(days);

  const shouldScroll =
    (lastMessageCount === 0 && snapshot.count > 0) ||
    snapshot.count > lastMessageCount ||
    (snapshot.lastId !== undefined && snapshot.lastId !== lastMessageId);

  return {
    shouldScroll,
    newCount: snapshot.count,
    newLastId: snapshot.lastId,
  };
}

/**
 * Scrolls to and highlights a specific message.
 * @param messageId The message ID to highlight
 * @param containerRef The scroll container reference
 * @param ngZone Angular zone
 * @param onComplete Callback when scroll and highlight complete
 */
export function scrollToHighlightedMessage(
  messageId: string,
  containerRef: ElementRef<HTMLElement> | undefined,
  ngZone: NgZone,
  onComplete: () => void
): void {
  const tryScroll = (attempt = 0) => {
    const el = document.getElementById(`message-${messageId}`);
    const container = containerRef?.nativeElement;

    if (!el || !container) {
      if (attempt < 10) {
        ngZone.runOutsideAngular(() => requestAnimationFrame(() => tryScroll(attempt + 1)));
      }
      return;
    }

    ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();

          const offset =
            elRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2 + el.clientHeight / 2;

          container.scrollTo({
            top: offset,
            behavior: 'smooth',
          });

          el.classList.add('highlight');

          setTimeout(() => {
            el.classList.remove('highlight');
          }, 800);

          ngZone.run(() => onComplete());
        });
      });
    });
  };

  tryScroll();
}
