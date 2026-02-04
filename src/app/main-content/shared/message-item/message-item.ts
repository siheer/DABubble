import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, input } from '@angular/core';
import type { MessageView } from '../../../types';

@Component({
  selector: 'app-message-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-item.html',
  styleUrl: './message-item.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MessageItem {
  message = input.required<MessageView>();
  avatarUrl = input<string>('');
  avatarAlt = input<string>('');
  idPrefix = input<string>('');
  extraClass = input<string>('');
}
