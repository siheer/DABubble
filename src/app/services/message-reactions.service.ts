import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteField,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class MessageReactionsService {
  private readonly firestore = inject(Firestore);

  async toggleChannelMessageReaction(
    channelId: string,
    messageId: string,
    userId: string,
    emoji: string,
    hasReacted: boolean
  ): Promise<void> {
    const messageRef = doc(this.firestore, `channels/${channelId}/messages/${messageId}`);

    await runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(messageRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const reactions = { ...(data['reactions'] ?? {}) };
      const users: string[] = reactions[emoji] ?? [];

      if (hasReacted) {
        reactions[emoji] = users.filter((id) => id !== userId);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      } else {
        reactions[emoji] = [...new Set([...users, userId])];
      }

      tx.update(messageRef, {
        reactions,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async removeReactionsByUser(userId: string): Promise<void> {
    const channelsSnap = await getDocs(collection(this.firestore, 'channels'));

    for (const channel of channelsSnap.docs) {
      const messagesSnap = await getDocs(collection(this.firestore, `channels/${channel.id}/messages`));

      for (const message of messagesSnap.docs) {
        const data = message.data();
        const reactions = data['reactions'] as Record<string, string[]> | undefined;

        if (!reactions) continue;

        let changed = false;
        const updatedReactions: Record<string, string[]> = {};

        for (const [emoji, users] of Object.entries(reactions)) {
          const filtered = (users as string[]).filter((id) => id !== userId);

          if (filtered.length > 0) {
            updatedReactions[emoji] = filtered;
          }

          if (filtered.length !== users.length) {
            changed = true;
          }
        }

        if (changed) {
          await updateDoc(message.ref, {
            reactions: Object.keys(updatedReactions).length ? updatedReactions : deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  }
}
