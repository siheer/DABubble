import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { CreateChannel } from './create-channel/create-channel';

type Channel = { id: string; title?: string };
type MenuEntry = { label: string };
type DirectMessage = { name: string; status: 'online' | 'offline' };

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, CreateChannel],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  private readonly firestore = inject(Firestore);
  protected readonly channels$: Observable<Channel[]> = this.loadChannels();

  protected isCreateChannelOpen = false;
  protected openCreateChannel(): void {
    this.isCreateChannelOpen = true;
  }
  protected closeCreateChannel(): void {
    this.isCreateChannelOpen = false;
  }

  private loadChannels(): Observable<Channel[]> {
    const channelsLocation = collection(this.firestore, 'channels');
    return collectionData(channelsLocation, { idField: 'id' }).pipe(map((channels) => channels as Channel[])
    );
  }
}
