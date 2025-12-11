import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { ThreadContext, ThreadService } from '../../services/thread.service';

@Component({
  selector: 'app-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread {
  private readonly threadService = inject(ThreadService);
  protected readonly thread$: Observable<ThreadContext | null> =
    this.threadService.thread$;

  protected readonly currentUser = {
    name: 'Frederik Beck',
    avatar: 'imgs/users/Property 1=Frederik Beck.svg',
  };
  protected readonly activeChannelTitle = '# Entwicklerteam';
  protected draftReply = '';

  protected sendReply(): void {
    const trimmed = this.draftReply.trim();
    if (!trimmed) return;

    this.threadService.addReply({
      author: this.currentUser.name,
      avatar: this.currentUser.avatar,
      text: trimmed,
      isOwn: true,
    });

    this.draftReply = '';
  }
}