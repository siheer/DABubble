import { Injectable, inject } from '@angular/core';
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NOTIFICATIONS } from '../notifications';
import { UserService, type AppUser } from './user.service';
import { PROFILE_PICTURE_URLS } from '../auth/set-profile-picture/set-profile-picture';
import { User } from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class GuestService {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private userService = inject(UserService);

  async createUserDocument(firebaseUser: User) {
    await this.userService.createUserDocument(firebaseUser, {
      name: 'Gast',
      photoUrl: PROFILE_PICTURE_URLS.default,
      isGuest: true,
    });
  }

  async signOutGuest(user: AppUser | null): Promise<void> {
    const firebaseUser = this.authService.auth.currentUser;

    if (!user || !firebaseUser) return;
    if (!user.isGuest || !firebaseUser.isAnonymous) return;

    const uid = user.uid;

    let deleted = false;
    try {
      await this.authService.deleteCurrentUser();
      deleted = true;
    } catch (error) {
      console.error(error);
      console.error(NOTIFICATIONS.ACCOUNT_DELETION_FAILURE);
    }

    if (!deleted) return;

    queueMicrotask(async () => {
      try {
        await this.deleteAllMessagesByAuthor(uid);
        await this.removeReactionsByUser(uid);
        await deleteDoc(doc(this.firestore, `users/${uid}`));
      } catch (err) {
        console.error('Guest background cleanup failed', err);
      }
    });
  }

  private async deleteAllMessagesByAuthor(userId: string): Promise<void> {
    const db = this.firestore;

    try {
      const channelsSnap = await getDocs(collection(db, 'channels'));

      for (const channel of channelsSnap.docs) {
        const messagesSnap = await getDocs(
          query(collection(db, `channels/${channel.id}/messages`), where('authorId', '==', userId))
        );

        for (const message of messagesSnap.docs) {
          const threadsSnap = await getDocs(collection(message.ref, 'threads'));
          for (const reply of threadsSnap.docs) {
            await deleteDoc(reply.ref);
          }

          await deleteDoc(message.ref);
        }
      }

      const dmMessagesSnap = await getDocs(query(collectionGroup(db, 'messages'), where('authorId', '==', userId)));

      for (const dm of dmMessagesSnap.docs) {
        await deleteDoc(dm.ref);
      }
    } catch (error) {
      console.error('deleteAllMessagesByAuthor failed', error);
    }
  }

  private async removeReactionsByUser(userId: string): Promise<void> {
    const db = this.firestore;

    try {
      const channelsSnap = await getDocs(collection(db, 'channels'));

      for (const channel of channelsSnap.docs) {
        const messagesSnap = await getDocs(collection(db, `channels/${channel.id}/messages`));

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
    } catch (err) {
      console.error('removeReactionsByUser failed', err);
    }
  }
}
