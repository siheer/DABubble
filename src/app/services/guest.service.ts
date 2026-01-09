import { Injectable, inject } from '@angular/core';
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  runTransaction,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Transaction,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NOTIFICATIONS } from '../notifications';
import { type AppUser } from './user.service';
import { PROFILE_PICTURE_URLS } from '../auth/set-profile-picture/set-profile-picture';
import { GuestRegistryData } from '../types';
import { FirestoreService } from './firestore.service';

const GUEST_FALLBACK_NUMBER = 999;

@Injectable({ providedIn: 'root' })
export class GuestService {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private firestoreService = inject(FirestoreService);

  /** Builds the initial guest user payload. */
  async buildGuestUserDocData() {
    const guestNumber = await this.getRandomGuestNumber();
    const name = `Gast ${guestNumber}`;

    return {
      name,
      photoUrl: PROFILE_PICTURE_URLS.default,
      isGuest: true,
    };
  }

  /** Signs out and schedules cleanup for a guest account. */
  async signOutGuest(user: AppUser | null): Promise<void> {
    const firebaseUser = this.authService.auth.currentUser;

    if (!user || !firebaseUser) return;
    if (!user.isGuest || !firebaseUser.isAnonymous) return;

    let deleted = false;
    try {
      await this.authService.deleteCurrentUser();
      deleted = true;
    } catch (error) {
      console.error(error);
      console.error(NOTIFICATIONS.ACCOUNT_DELETION_FAILURE);
    }

    if (!deleted) return;

    this.scheduleGuestCleanup(user);
  }

  /** Runs cleanup for a guest without blocking the caller. */
  private scheduleGuestCleanup(user: AppUser): void {
    queueMicrotask(async () => {
      try {
        await this.cleanupGuestUserData(user);
      } catch (error) {
        console.error(NOTIFICATIONS.GUEST_CLEANUP_FAILED, error);
      }
    });
  }

  /** Cleans up expired guests if not successful last 24 hours. */
  async cleanupExpiredGuestsIfNeeded(allUsers: AppUser[]): Promise<void> {
    const shouldCleanup = await this.isCleanupRequired();
    if (!shouldCleanup) {
      return;
    }

    const expiredGuests = this.getExpiredGuests(allUsers);

    if (!expiredGuests.length) {
      await this.markCleanupDone();
      return;
    }

    const areCleanUpsSuccessfull = await Promise.all(expiredGuests.map((user) => this.cleanupGuestUserData(user)));
    if (areCleanUpsSuccessfull.every((isCleanUpSuccessfull) => isCleanUpSuccessfull === true)) {
      await this.markCleanupDone();
    }
  }

  /** Deletes all guest data across collections. */
  async cleanupGuestUserData(user: AppUser): Promise<boolean> {
    let isSuccessful = true;

    try {
      await this.deleteAllMessagesByAuthor(user.uid);
    } catch (error) {
      console.error(NOTIFICATIONS.GUEST_MESSAGES_DELETE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.removeReactionsByUser(user.uid);
    } catch (error) {
      console.error(NOTIFICATIONS.GUEST_REACTIONS_REMOVE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.removeGuestFromAllChannels(user.uid);
    } catch (error) {
      console.error(NOTIFICATIONS.GUEST_CHANNEL_MEMBERSHIPS_REMOVE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.releaseGuestNumber(user.name);
    } catch (error) {
      console.error(NOTIFICATIONS.GUEST_NUMBER_RELEASE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await deleteDoc(doc(this.firestore, `users/${user.uid}`));
    } catch (error) {
      console.error(NOTIFICATIONS.GUEST_USER_DOCUMENT_DELETE_FAILED, error);
      isSuccessful = false;
    }

    return isSuccessful;
  }

  /** Returns guest users older than 24 hours. */
  private getExpiredGuests(allUsers: AppUser[]): AppUser[] {
    return allUsers.filter((user) => {
      if (!user.isGuest) {
        return false;
      }

      const cutoffTimestamp = Date.now() - 24 * 60 * 60 * 1000;
      const createdAtMillis = (user.createdAt as Timestamp).toMillis();

      return createdAtMillis < cutoffTimestamp;
    });
  }

  /** Checks whether the cleanup should run now. */
  private async isCleanupRequired(): Promise<boolean> {
    const guestsDocRef = this.getGuestsDocRef();
    const snap = await getDoc(guestsDocRef);
    const data = snap.data() as GuestRegistryData;

    if (!data?.isCleanedUp || !data?.lastCleanupAt) {
      return true;
    }

    return Date.now() - data.lastCleanupAt >= 24 * 60 * 60 * 1000;
  }

  /** Persists the last successful cleanup time. */
  private async markCleanupDone(): Promise<void> {
    const guestsDocRef = this.getGuestsDocRef();
    await setDoc(
      guestsDocRef,
      {
        isCleanedUp: true,
        lastCleanupAt: Date.now(),
      },
      { merge: true }
    );
  }

  /** Removes channel and DM messages written by the user. */
  private async deleteAllMessagesByAuthor(userId: string): Promise<void> {
    const db = this.firestore;

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
  }

  /** Removes the user from all reactions in channels. */
  private async removeReactionsByUser(userId: string): Promise<void> {
    const db = this.firestore;

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
  }

  /** Picks a random unused guest number. */
  private async getRandomGuestNumber(): Promise<number> {
    const guestsDocRef = this.getGuestsDocRef();

    return runTransaction(this.firestore, async (transaction) => {
      const usedNumbers = await this.getUsedGuestNumbers(transaction, guestsDocRef);
      const availableNumbers = this.buildAvailableGuestNumbers(usedNumbers);

      if (!availableNumbers.length) {
        return GUEST_FALLBACK_NUMBER;
      }

      const selectedNumber = this.pickRandomNumber(availableNumbers);
      this.setUsedGuestNumbers(transaction, guestsDocRef, [...usedNumbers, selectedNumber]);
      return selectedNumber;
    });
  }

  /** Returns the guest registry document reference. */
  private getGuestsDocRef(): DocumentReference<GuestRegistryData> {
    return doc(this.firestore, 'guests', 'registry');
  }

  /** Loads the used guest numbers from the registry. */
  private async getUsedGuestNumbers(
    transaction: Transaction,
    guestsDocRef: DocumentReference<GuestRegistryData>
  ): Promise<number[]> {
    const snap = await transaction.get(guestsDocRef);
    const data = snap.data();
    return data?.usedNumbers ?? [];
  }

  /** Builds the list of available guest numbers. */
  private buildAvailableGuestNumbers(usedNumbers: number[]): number[] {
    const usedSet = new Set<number>(usedNumbers);
    const availableNumbers: number[] = [];

    for (let number = 100; number <= 500; number += 1) {
      if (!usedSet.has(number)) {
        availableNumbers.push(number);
      }
    }

    return availableNumbers;
  }

  /** Returns one random number from the list. */
  private pickRandomNumber(numbers: number[]): number {
    const randomIndex = Math.floor(Math.random() * numbers.length);
    return numbers[randomIndex];
  }

  /** Writes the used guest numbers to the registry. */
  private setUsedGuestNumbers(
    transaction: Transaction,
    guestsDocRef: DocumentReference<GuestRegistryData>,
    usedNumbers: number[]
  ): void {
    transaction.set(guestsDocRef, { usedNumbers }, { merge: true });
  }

  /** Releases the guest number for reuse. */
  private async releaseGuestNumber(displayName: AppUser['name']): Promise<void> {
    const guestNumber = this.extractGuestNumber(displayName);
    if (guestNumber === null) return;

    const guestsDocRef = this.getGuestsDocRef();

    await runTransaction(this.firestore, async (transaction) => {
      const usedNumbers = await this.getUsedGuestNumbers(transaction, guestsDocRef);
      if (!usedNumbers.length) return;

      const nextNumbers = usedNumbers.filter((value) => value !== guestNumber);
      if (nextNumbers.length === usedNumbers.length) return;

      this.setUsedGuestNumbers(transaction, guestsDocRef, nextNumbers);
    });
  }

  /** Extracts the 3-digit guest number from the display name. */
  private extractGuestNumber(displayName: string): number | null {
    const numberMatch = displayName.match(/\b\d{3}\b/);
    if (!numberMatch) {
      return null;
    }
    return Number(numberMatch[0]);
  }

  private async removeGuestFromAllChannels(userId: string): Promise<void> {
    const membersQuery = query(
      collectionGroup(this.firestore, 'members'),
      where('scope', '==', 'channel'),
      where('id', '==', userId)
    );

    const membersSnap = await getDocs(membersQuery);

    const channelIds = new Set<string>();
    for (const memberDoc of membersSnap.docs) {
      const channelId = memberDoc.data()['channelId'] as string | undefined;
      if (channelId) {
        channelIds.add(channelId);
      } else {
        await deleteDoc(memberDoc.ref);
      }
    }

    await this.leaveAllChannels(channelIds, userId);
  }

  private async leaveAllChannels(channelIds: Set<string>, userId: string): Promise<void> {
    const results = await Promise.allSettled(
      [...channelIds].map((channelId) => this.firestoreService.leaveChannel(channelId, userId))
    );

    const failures = results.filter((result) => result.status === 'rejected');
    results.forEach((result) => console.error('leaveChannel', result));

    if (failures.length) {
      throw new Error(NOTIFICATIONS.GUEST_LEAVE_CHANNEL_FAILED);
    }
  }
}
