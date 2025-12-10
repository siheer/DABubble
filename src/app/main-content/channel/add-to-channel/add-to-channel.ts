import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { animate, style, transition, trigger } from '@angular/animations';

type SuggestedMember = {
  name: string;
  role: string;
  avatar: string;
  status?: 'online' | 'offline';
  description?: string;
};

@Component({
  selector: 'app-add-to-channel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './add-to-channel.html',
  styleUrl: './add-to-channel.scss',
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px) scale(0.96)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'translateY(-4px) scale(0.96)' })),
      ]),
    ]),
  ],
})
export class AddToChannel {
  private readonly overlayService = inject(OverlayService);

  @Input() channelTitle = 'Entwicklerteam';

  protected visible = true;
  protected suggestedMembers: SuggestedMember[] = [
    {
      name: 'Noah Braun',
      role: 'Backend Development',
      avatar: 'imgs/users/Property 1=Noah Braun.svg',
      status: 'online',
      description: 'Welche Version ist aktuell im Channel?'
    },
    {
      name: 'Maximilian Wolf',
      role: 'UX Research',
      avatar: 'imgs/users/Property 1=Maximilian Wolf.svg',
    },
    {
      name: 'Lisa Krauss',
      role: 'Marketing',
      avatar: 'imgs/users/Property 1=Lisa Krauss.svg',
      description: 'Neue Assets hochgeladen'
    },
  ];

  protected closeOverlay(): void {
    this.visible = false;
  }

  protected onAnimationDone(): void {
    if (!this.visible) {
      this.overlayService.closeLast();
    }
  }
}