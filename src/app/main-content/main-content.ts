import { Component, DestroyRef, inject } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Workspace } from './workspace/workspace';
import { Navbar } from './navbar/navbar';
import { Thread } from './thread/thread';
import { ChannelComponent } from './channel/channel';
import { CommonModule } from '@angular/common';
import { NewMessagePanel } from './messages/new-massage-panel/new-massage-panel';
import { ThreadService } from '../services/thread.service';
import { Messages } from './messages/messages';
import { DirectMessageSelectionService } from '../services/direct-message-selection.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-main-content',
  standalone: true,
  imports: [
    MatSidenavModule,
    Workspace,
    Navbar,
    ChannelComponent,
    Thread,
    CommonModule,
    NewMessagePanel,
    Messages,
  ],
  templateUrl: './main-content.html',
  styleUrl: './main-content.scss',
})
export class MainContent {
  private readonly threadService = inject(ThreadService);
  private readonly directMessageSelectionService = inject(
    DirectMessageSelectionService
  );
  private readonly destroyRef = inject(DestroyRef);
  protected readonly selectedDirectMessageUser$ =
    this.directMessageSelectionService.selectedUser$;
  protected readonly thread$ = this.threadService.thread$;
  protected showNewMessage = false;
  protected isCloseWorkspaceButtonHovered = false;
  protected isOpenWorkspaceButtonHovered = false;

  constructor() {
    this.selectedDirectMessageUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user) {
          this.showNewMessage = false;
        }
      });
  }

  protected openNewMessagePanel(): void {
    this.showNewMessage = true;
  }

  protected closeNewMessagePanel(): void {
    this.showNewMessage = false;
  }
}
