import { Component, inject } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Workspace } from './workspace/workspace';
import { Navbar } from './navbar/navbar';
import { Thread } from './thread/thread';
import { ChannelComponent } from './channel/channel';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { NewMessage } from './messages/new-message/new-message';
import { Messages } from './messages/messages';
import { ThreadService } from '../services/thread.service';
@Component({
  selector: 'app-main-content',
  standalone: true,
  imports: [MatSidenavModule, Workspace, Navbar, ChannelComponent, Thread, MatIconModule, CommonModule, NewMessage,
    Messages,],
  templateUrl: './main-content.html',
  styleUrl: './main-content.scss',
})
export class MainContent {
  private readonly threadService = inject(ThreadService);
  protected readonly thread$ = this.threadService.thread$; 
  protected showNewMessage = false;

  protected openNewMessagePanel(): void {
    this.showNewMessage = true;
  }

  protected closeNewMessagePanel(): void {
    this.showNewMessage = false;
  }
}
