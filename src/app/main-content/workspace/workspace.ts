import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

type Channel = { id: string; title?: string };


@Component({
  selector: 'app-workspace',
  imports: [CommonModule],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  private readonly firestore = inject(Firestore);
  protected readonly channels$: Observable<Channel[]> = this.loadChannels();

  private loadChannels(): Observable<Channel[]> {
    const channelsLocation = collection(this.firestore, 'channels');
    return collectionData(channelsLocation, { idField: 'id' }).pipe(map((channels) => channels as Channel[])
    );

  }
}
