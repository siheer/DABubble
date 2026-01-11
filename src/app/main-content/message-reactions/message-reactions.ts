import { CommonModule, KeyValue } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-message-reactions',
  imports: [CommonModule],
  templateUrl: './message-reactions.html',
  styleUrl: './message-reactions.scss',
})
export class MessageReactions {
  @Input({ required: true }) reactions!: Record<string, string[]>;
  @Input() currentUserId?: string;

  @Output() react = new EventEmitter<string>();
  @Output() showTooltip = new EventEmitter<{
    event: MouseEvent;
    emoji: string;
    userIds: string[];
  }>();
  @Output() hideTooltip = new EventEmitter<void>();

  trackByEmoji(_: number, item: KeyValue<string, string[]>): string {
    return item.key;
  }

  hasOwnReaction(userIds: string[] | undefined): boolean {
    return !!this.currentUserId && !!userIds?.includes(this.currentUserId);
  }
}
