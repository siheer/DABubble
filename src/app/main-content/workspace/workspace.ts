import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { CreateChannel } from './create-channel/create-channel';

type Channel = { id: string; title?: string };
type DirectMessage = { name: string;};

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
  protected readonly directMessages$: Observable<DirectMessage[]> = this.loadDirectMessages();

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

  private loadDirectMessages(): Observable<DirectMessage[]> {
    let usersLocation = collection(this.firestore, 'users');

    return collectionData(usersLocation, { idField: 'id' }).pipe(
      map((users) =>
        (users as Array<{ name?: string; }>).map(
          (user) => ({
            name: user.name ?? 'Unbenannter Nutzer',
          })
        )
      )
    );
  }
}
