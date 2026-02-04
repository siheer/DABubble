import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ChannelMemberView, MentionSegment, MessageView } from '../../../types';

@Component({
  selector: 'app-message-body',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-body.html',
  styleUrl: './message-body.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MessageBody {
  message = input.required<MessageView>();
  segments = input<MentionSegment[] | null>(null);
  isEditing = input(false);
  editText = input('');
  isSaving = input(false);

  editTextChange = output<string>();
  cancelEdit = output<void>();
  saveEdit = output<void>();
  memberSelected = output<ChannelMemberView>();
}
