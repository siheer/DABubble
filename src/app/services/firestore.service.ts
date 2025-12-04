import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface Channel {
  id?: string;
  title?: string;
  description?: string;
}

export interface DirectMessage {
  name: string;
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private readonly firestore = inject(Firestore);

  getChannels(): Observable<Channel[]> {
    const channelsCollection = collection(this.firestore, 'channels');

    return collectionData(channelsCollection, { idField: 'id' }).pipe(
      map((channels) => channels as Channel[])
    );
  }

  getFirstChannelTitle(): Observable<string> {
    return this.getChannels().pipe(
      map((channels) => {
        const [firstChannel] = channels;
        return firstChannel?.title ?? 'Unbenannter Channel';
      })
    );
  }

  getDirectMessages(): Observable<DirectMessage[]> {
    const usersCollection = collection(this.firestore, 'users');

    return collectionData(usersCollection, { idField: 'id' }).pipe(
      map((users) =>
        (users as Array<{ name?: string }>).map((user) => ({
          name: user.name ?? 'Unbenannter Nutzer',
        }))
      )
    );
  }

  async createChannel(title: string, description?: string): Promise<void> {
    const trimmedTitle = title.trim();
    const trimmedDescription = description?.trim();

    const channelPayload: Record<string, unknown> = {
      title: trimmedTitle,
      createdAt: serverTimestamp(),
    };

    if (trimmedDescription) {
      channelPayload['description'] = trimmedDescription;
    }

    const channelsCollection = collection(this.firestore, 'channels');
    await addDoc(channelsCollection, channelPayload);
  }
}