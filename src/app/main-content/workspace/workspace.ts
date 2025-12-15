import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { CreateChannel } from './create-channel/create-channel';

import { Channel, FirestoreService } from '../../services/firestore.service';
import { ChannelSelectionService } from '../../services/channel-selection.service';
import { AppUser, UserService } from '../../services/user.service';
import { DirectMessageSelectionService } from '../../services/direct-message-selection.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, CreateChannel],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  private readonly firestoreService = inject(FirestoreService);
  private readonly userService = inject(UserService);
  private readonly channelSelectionService = inject(ChannelSelectionService);
  private readonly directMessageSelectionService = inject(
    DirectMessageSelectionService
  );
  @Output() readonly newMessage = new EventEmitter<void>();
  protected readonly channels$: Observable<Channel[]> =
    this.firestoreService.getChannels();
  protected readonly users$: Observable<AppUser[]> =
    this.userService.getAllUsers();
  protected readonly selectedChannelId$ =
    this.channelSelectionService.selectedChannelId$;
  protected readonly selectedDirectMessageUser$ =
    this.directMessageSelectionService.selectedUser$;
  protected areChannelsCollapsed = false;
  protected areDirectMessagesCollapsed = false;
  protected isCreateChannelOpen = false;
  protected startNewMessage(): void {
    this.newMessage.emit();
  }
  protected openCreateChannel(): void {
    this.isCreateChannelOpen = true;
  }

  protected closeCreateChannel(): void {
    this.isCreateChannelOpen = false;
  }
  protected toggleChannels(): void {
    this.areChannelsCollapsed = !this.areChannelsCollapsed;
  }

  protected selectChannel(channelId?: string | null): void {
    this.channelSelectionService.selectChannel(channelId);
  }

  protected toggleDirectMessages(): void {
    this.areDirectMessagesCollapsed = !this.areDirectMessagesCollapsed;
  }

  protected openDirectMessage(user: AppUser): void {
    this.directMessageSelectionService.selectUser(user);
    this.startNewMessage();
  }


}

