import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
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
export interface ChannelAttachment {
  title?: string;
  description?: string;
  linkLabel?: string;
  linkHref?: string;
  badgeLabel?: string;
}

export interface ChannelMessage {
  id?: string;
  author?: string;
  avatar?: string;
  createdAt?: Timestamp;
  text?: string;
  replies?: number;
  tag?: string;
  attachment?: ChannelAttachment;
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

  getChannelMessages(channelId: string): Observable<ChannelMessage[]> {
    const messagesCollection = collection(
      this.firestore,
      `channels/${channelId}/messages`
    );

    return collectionData(messagesCollection, { idField: 'id' }).pipe(
      map((messages) =>
        (messages as Array<Record<string, unknown>>).map((message) => ({
          id: message['id'] as string,
          author: (message['author'] as string) ?? 'Unbekannter Nutzer',
          avatar:
            (message['avatar'] as string) ??
            'imgs/users/Property 1=Frederik Beck.svg',
          createdAt: message['createdAt'] as Timestamp,
          text: (message['text'] as string) ?? '',
          replies: message['replies'] as number,
          tag: message['tag'] as string,
          attachment: message['attachment'] as ChannelAttachment,
        }))
      )
    );
  }
  async addChannelMessage(
    channelId: string,
    message: Partial<ChannelMessage> &
      Pick<ChannelMessage, 'text' | 'author' | 'avatar'>
  ): Promise<void> {
    const messagesCollection = collection(
      this.firestore,
      `channels/${channelId}/messages`
    );

    await addDoc(messagesCollection, {
      ...message,
      createdAt: serverTimestamp(),
      replies: message.replies ?? 0,
    });
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