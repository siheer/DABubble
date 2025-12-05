import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ChannelDescription } from './channel-description/channel-description';
import { FirestoreService } from '../../services/firestore.service';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type Message = {
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  isOwn?: boolean;
};
@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule], templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  // Static recipient information to mirror the "Neue Nachricht" mockup.
  protected readonly recipient = {
    name: 'Sofia Müller',
    role: 'Software Developer',
    avatar: 'imgs/users/Property 1=Sofia Müller.svg',
  };

  // Initial conversation starter shown above the chat box.
  protected readonly helperText =
    'Beginne damit, jemanden zu einem oder mehreren deiner Channels hinzuzufügen. ' +
    'Du kannst hier, in einer Nachricht, @erwähnungen nutzen, um Personen zu benachrichtigen.';
  // Pre-populated messages to give the view some life.
  protected messages: Message[] = [
    {
      author: 'Zoe Day',
      avatar: 'imgs/f2.png',
      content:
        'Willkommen im neuen Devspace! Hier kannst du direkt mit Sofia chatten oder sie zu Channels einladen.',
      timestamp: '08:22 Uhr',
    },
  ];
  // Model bound to the composer textarea.
  protected draftMessage = '';

  // Adds a new message bubble to the conversation.
  protected sendMessage(): void {
    const trimmed = this.draftMessage.trim();
    if (!trimmed) {
      return;
    }

    this.messages.push({
      author: 'Frederik Beck',
      avatar: 'imgs/users/Property 1=Frederik Beck.svg',
      content: trimmed,
      timestamp: 'Jetzt',
      isOwn: true,
    });

    this.draftMessage = '';
  }

}
