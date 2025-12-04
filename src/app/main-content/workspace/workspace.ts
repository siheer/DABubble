import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { CreateChannel } from './create-channel/create-channel';

import { Channel, DirectMessage, FirestoreService } from '../../services/firestore.service';
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, CreateChannel],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  private readonly firestoreService = inject(FirestoreService);
  protected readonly channels$: Observable<Channel[]> = this.firestoreService.getChannels();
  protected readonly directMessages$: Observable<DirectMessage[]> =
    this.firestoreService.getDirectMessages();
  protected areChannelsCollapsed = false;
  protected areDirectMessagesCollapsed = false;
  protected isCreateChannelOpen = false;
  protected openCreateChannel(): void {
    this.isCreateChannelOpen = true;
  }
  protected closeCreateChannel(): void {
    this.isCreateChannelOpen = false;
  }
  protected toggleChannels(): void {
    this.areChannelsCollapsed = !this.areChannelsCollapsed;
  }

  protected toggleDirectMessages(): void {
    this.areDirectMessagesCollapsed = !this.areDirectMessagesCollapsed;
  }

}

