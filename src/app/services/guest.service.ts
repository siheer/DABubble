import { Injectable, inject } from '@angular/core';
import {
  deleteDoc,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  runTransaction,
  setDoc,
  Timestamp,
  Transaction,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NOTIFICATIONS } from '../notifications';
import { type AppUser } from './user.service';
import { GuestRegistryData } from '../types';
import { ChannelService } from './channel.service';
import { ChannelMembershipService } from './membership.service';
import { DirectMessagesService } from './direct-messages.service';
import { MessageReactionsService } from './message-reactions.service';
import { ToastService } from '../toast/toast.service';

const GUEST_FALLBACK_NUMBER = 999;

@Injectable({ providedIn: 'root' })
export class GuestService {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private channelService = inject(ChannelService);
  private membershipService = inject(ChannelMembershipService);
  private directMessagesService = inject(DirectMessagesService);
  private messageReactionsService = inject(MessageReactionsService);
  private toastService = inject(ToastService);

  /** Builds the initial guest user payload. */
  async buildGuestUserDocData(): Promise<Partial<AppUser>> {
    const guestNumber = await this.getRandomGuestNumber();
    const name = `Gast ${guestNumber}`;
    const profilePictureKey = 'default';

    return {
      name,
      profilePictureKey,
      isGuest: true,
    };
  }

  /** Signs out and cleans up database for a guest account. */
  async signOutGuest(user: AppUser | null): Promise<void> {
    if (!this.isGuestUser(user)) {
      throw new Error(NOTIFICATIONS.TOAST_LOGOUT_FAILURE);
    }
    await this.cleanupGuestUserData(user!);
  }

  private isGuestUser(user: AppUser | null) {
    const firebaseUser = this.authService.auth.currentUser;
    if (!user || !firebaseUser) return false;
    if (!user.isGuest || !firebaseUser.isAnonymous) return false;
    return true;
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
    const displayName = user.name;

    try {
      await this.deleteAllMessagesByAuthor(user.uid);
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.MESSAGES_DELETE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.removeReactionsByUser(user.uid);
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.REACTIONS_REMOVE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await deleteDoc(doc(this.firestore, `users/${user.uid}`));
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.USER_DOCUMENT_DELETE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.membershipService.removeUserFromAllChannels(user.uid);
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.CHANNEL_MEMBERSHIPS_REMOVE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.directMessagesService.deleteAllDirectMessagesByParticipant(user.uid);
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.DIRECT_MESSAGES_DELETE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.releaseGuestNumber(displayName);
    } catch (error) {
      console.error('Gast: ' + NOTIFICATIONS.GUEST_NUMBER_RELEASE_FAILED, error);
      isSuccessful = false;
    }

    try {
      await this.deleteGuestAuthRecord(user);
    } catch (error: any) {
      this.toastService.error(NOTIFICATIONS.TOAST_LOGOUT_FAILURE);
      console.error('Gast: ' + error.message);
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
    const data = this.buildGuestRegistry(snap.data() as Partial<GuestRegistryData> | undefined);

    if (!data.isCleanedUp || !data.lastCleanupAt) {
      return true;
    }

    return Date.now() - data.lastCleanupAt >= 24 * 60 * 60 * 1000;
  }

  /** Persists the last successful cleanup time. */
  private async markCleanupDone(): Promise<void> {
    const guestsDocRef = this.getGuestsDocRef();
    const snap = await getDoc(guestsDocRef);
    const data = this.buildGuestRegistry(snap.data() as Partial<GuestRegistryData> | undefined);
    await setDoc(guestsDocRef, {
      ...data,
      isCleanedUp: true,
      lastCleanupAt: Date.now(),
    });
  }

  /** Removes channel and DM messages written by the user. */
  private async deleteAllMessagesByAuthor(userId: string): Promise<void> {
    await this.channelService.deleteAllChannelMessagesByAuthor(userId);
    await this.directMessagesService.deleteAllDirectMessagesByParticipant(userId);
  }

  /** Removes the user from all reactions in channels. */
  private async removeReactionsByUser(userId: string): Promise<void> {
    await this.messageReactionsService.removeReactionsByUser(userId);
  }

  async deleteGuestAuthRecord(user: AppUser | null): Promise<void> {
    if (!this.isGuestUser(user)) {
      throw new Error(NOTIFICATIONS.GUEST_WRONG_IDENTITY);
    }

    try {
      await this.authService.deleteCurrentUser();
    } catch (error) {
      console.error(error);
      throw new Error(NOTIFICATIONS.ACCOUNT_DELETION_FAILURE);
    }
  }

  /** Picks a random unused guest number. */
  private async getRandomGuestNumber(): Promise<number> {
    const guestsDocRef = this.getGuestsDocRef();

    try {
      return await runTransaction(this.firestore, async (transaction) => {
        const registry = await this.getGuestRegistry(transaction, guestsDocRef);
        const usedNumbers = registry.usedNumbers;
        const availableNumbers = this.buildAvailableGuestNumbers(usedNumbers);

        if (!availableNumbers.length) {
          return GUEST_FALLBACK_NUMBER;
        }

        const selectedNumber = this.pickRandomNumber(availableNumbers);
        this.setGuestRegistry(transaction, guestsDocRef, {
          ...registry,
          usedNumbers: [...usedNumbers, selectedNumber],
        });
        return selectedNumber;
      });
    } catch (error: any) {
      // Ignore failed-precondition errors and return fallback
      if (error?.code === 'failed-precondition') {
        console.warn('Gast: Registry update failed, using fallback number');
        return GUEST_FALLBACK_NUMBER;
      }
      throw error;
    }
  }

  /** Returns the guest registry document reference. */
  private getGuestsDocRef(): DocumentReference {
    return doc(this.firestore, 'guests', 'registry');
  }

  /** Loads the used guest numbers from the registry. */
  private async getGuestRegistry(
    transaction: Transaction,
    guestsDocRef: DocumentReference
  ): Promise<GuestRegistryData> {
    const snap = await transaction.get(guestsDocRef);
    return this.buildGuestRegistry(snap.data() as Partial<GuestRegistryData> | undefined);
  }

  private buildGuestRegistry(data?: Partial<GuestRegistryData>): GuestRegistryData {
    return {
      usedNumbers: data?.usedNumbers ?? [],
      isCleanedUp: data?.isCleanedUp ?? false,
      lastCleanupAt: data?.lastCleanupAt ?? 0,
    };
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
  private setGuestRegistry(transaction: Transaction, guestsDocRef: DocumentReference, data: GuestRegistryData): void {
    transaction.set(guestsDocRef, data);
  }

  /** Releases the guest number for reuse. */
  private async releaseGuestNumber(displayName: AppUser['name']): Promise<void> {
    const guestNumber = this.extractGuestNumber(displayName);
    if (guestNumber === null) return;

    const guestsDocRef = this.getGuestsDocRef();

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const registry = await this.getGuestRegistry(transaction, guestsDocRef);
        const usedNumbers = registry.usedNumbers;
        if (!usedNumbers.length) return;

        const nextNumbers = usedNumbers.filter((value) => value !== guestNumber);
        if (nextNumbers.length === usedNumbers.length) return;

        this.setGuestRegistry(transaction, guestsDocRef, { ...registry, usedNumbers: nextNumbers });
      });
    } catch (error: any) {
      // Ignore failed-precondition errors from concurrent updates
      if (error?.code === 'failed-precondition') {
        console.warn('Gast: Registry update skipped due to concurrent modification');
        return;
      }
      throw error;
    }
  }

  /** Extracts the 3-digit guest number from the display name. */
  private extractGuestNumber(displayName: string): number | null {
    const numberMatch = displayName.match(/\b\d{3}\b/);
    if (!numberMatch) {
      return null;
    }
    return Number(numberMatch[0]);
  }
}
