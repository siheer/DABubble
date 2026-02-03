import { EnvironmentInjector, Injectable, inject, signal, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { User as FirebaseUser, UserCredential } from 'firebase/auth';
import { Observable, Subscription, map, shareReplay } from 'rxjs';
import { PROFILE_PICTURE_URLS } from '../auth/set-profile-picture/set-profile-picture';
import { AuthService } from './auth.service';
import { GuestService } from './guest.service';
import { TEXTS } from '../texts';
import { ToastService } from '../toast/toast.service';
import { NOTIFICATIONS } from '../notifications';
import { ProfilePictureKey } from '../types';
import { AuthenticatedFirestoreStreamService } from './authenticated-firestore-stream';
import { FullscreenOverlayService } from './fullscreen-overlay.service';

const RESERVED_USER_IDS = new Set(['__system__', 'system']);

export interface AppUser {
  uid: string;
  email: string | null;
  name: string;
  profilePictureKey?: ProfilePictureKey;
  onlineStatus: boolean;
  lastSeen?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  role?: 'admin' | 'user';
  isGuest?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly injector = inject(EnvironmentInjector);
  private authService = inject(AuthService);
  private guestService = inject(GuestService);
  private firestore = inject(Firestore);
  private toastService = inject(ToastService);
  private authenticatedFirestoreStreamService = inject(AuthenticatedFirestoreStreamService);
  private fullscreenOverlayService = inject(FullscreenOverlayService);

  private userDocSubscription?: Subscription;
  private allUsers$?: Observable<AppUser[]>;
  private userDocCache = new Map<string, Observable<AppUser | null>>();

  currentUser = signal<AppUser | null>(null);
  readonly currentUser$ = toObservable(this.currentUser).pipe(shareReplay({ bufferSize: 1, refCount: false }));

  constructor() {
    this.authService.authState$.subscribe((firebaseUser) => {
      runInInjectionContext(this.injector, () => {
        this.handleAuthStateChange(firebaseUser);
      });
    });
  }

  private async handleAuthStateChange(firebaseUser: FirebaseUser | null): Promise<void> {
    if (!firebaseUser) {
      this.unsubscribeFromUserDocument();
      this.currentUser.set(null);
      return;
    }

    await this.handleSignInState(firebaseUser);
    this.listenToUserDocument(firebaseUser.uid);
  }

  /**
   * Called on login / auth state change when an existing user is present.
   * Updates only online status and timestamps, without mirroring profile fields
   * from Auth to Firestore.
   */
  private async handleSignInState(firebaseUser: FirebaseUser): Promise<void> {
    const appUser = await this.getUserOnce(firebaseUser.uid);

    // If no user document exists, do NOT create one automatically.
    if (!appUser) {
      return;
    }

    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    await updateDoc(userRef, {
      onlineStatus: true,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Creates a new user document in Firestore (only on first registration/login).
   */
  async createUserDocument(firebaseUser: FirebaseUser, data: Partial<AppUser>): Promise<void> {
    // Prüfe, ob der Name bereits existiert
    const nameExists = await this.checkIfNameExists(data.name || TEXTS.NEW_USER);
    if (nameExists) {
      throw new Error('Dieser Benutzername ist bereits vergeben. Bitte wähle einen anderen Namen.');
    }

    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);

    const newUser: AppUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: data.name || TEXTS.NEW_USER,
      profilePictureKey: data.profilePictureKey ?? 'default',
      onlineStatus: true,
      isGuest: data.isGuest ?? false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    };

    await setDoc(userRef, newUser);
  }

  /**
   * Prüft, ob ein Benutzername bereits existiert
   */
  async checkIfNameExists(name: string): Promise<boolean> {
    const users = await this.getUserDocs();
    return users.some((user) => user.data.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Loading the user document once without setting up a listener.
   * @param uid - User ID of current User.
   */
  async getUserOnce(uid: string): Promise<AppUser | null> {
    const userDoc = doc(this.firestore, `users/${uid}`);
    const snap = await runInInjectionContext(this.injector, () => getDoc(userDoc));

    if (!snap.exists()) return null;

    return snap.data() as AppUser;
  }

  /**
   * Listener on the Firestore-User-Document.
   * Updates `currentUser` automatically on changes in firestore
   */
  private listenToUserDocument(uid: string): void {
    this.unsubscribeFromUserDocument();

    this.userDocSubscription = this.getUserDoc(uid).subscribe((user) => {
      if (!user) {
        this.currentUser.set(null);
        return;
      }

      this.currentUser.set(user);
    });
  }

  private async handleSignOutState(): Promise<void> {}

  private unsubscribeFromUserDocument(): void {
    this.userDocSubscription?.unsubscribe();
    this.userDocSubscription = undefined;
  }

  /**
   * Update User.
   */
  async updateUser(data: Partial<AppUser>): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('Kein User eingeloggt.');

    const userRef = doc(this.firestore, `users/${user.uid}`);
    return updateDoc(userRef, data);
  }

  /**
   * Streams all users so they can be displayed (e.g., in the workspace menu).
   */
  getAllUsers(): Observable<AppUser[]> {
    if (!this.allUsers$) {
      this.allUsers$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<AppUser[]>({
          authState$: this.authService.authState$,
          fallbackValue: [],
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => {
            const usersCollection = collection(this.firestore, 'users');
            return collectionData(usersCollection, { idField: 'uid', serverTimestamps: 'estimate' }).pipe(
              map((users) =>
                (users as Array<Partial<AppUser> & { uid?: string }>)
                  .map((user) => ({
                    uid: user.uid ?? 'unbekannt',
                    name: user.name ?? 'Unbenannter Nutzer',
                    email: user.email ?? null,
                    profilePictureKey: user.profilePictureKey ?? 'default',
                    onlineStatus: user.onlineStatus ?? false,
                    lastSeen: user.lastSeen,
                    updatedAt: user.updatedAt,
                    createdAt: user.createdAt,
                    role: user.role,
                    isGuest: user.isGuest ?? false,
                  }))
                  .filter((user) => !RESERVED_USER_IDS.has(user.uid))
              )
            );
          },
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    return this.allUsers$;
  }

  async getUserDocs(): Promise<Array<{ id: string; data: AppUser }>> {
    return runInInjectionContext(this.injector, async () => {
      const usersCollection = collection(this.firestore, 'users');
      const snapshot = await getDocs(usersCollection);

      return snapshot.docs
        .filter((docSnap) => !RESERVED_USER_IDS.has(docSnap.id))
        .map((docSnap) => {
          const data = docSnap.data() as Partial<AppUser>;
          return {
            id: docSnap.id,
            data: {
              uid: data.uid ?? docSnap.id,
              name: data.name ?? 'Unbenannter Nutzer',
              email: data.email ?? null,
              profilePictureKey: data.profilePictureKey ?? 'default',
              onlineStatus: data.onlineStatus ?? false,
              lastSeen: data.lastSeen,
              updatedAt: data.updatedAt,
              createdAt: data.createdAt,
              role: data.role,
              isGuest: data.isGuest ?? false,
            },
          };
        });
    });
  }

  private getUserDoc(uid: string): Observable<AppUser | null> {
    if (!this.userDocCache.has(uid)) {
      const userDoc = doc(this.firestore, `users/${uid}`);

      const stream$ = this.authenticatedFirestoreStreamService
        .createStreamWithInjectionContext<AppUser | null>({
          authState$: this.authService.authState$,
          fallbackValue: null,
          isUserAllowed: (currentUser) => currentUser.uid === uid,
          shouldLogError: () => Boolean(this.authService.auth.currentUser),
          createStream: () => docData(userDoc).pipe(map((data) => (data as AppUser) ?? null)),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: true }));

      this.userDocCache.set(uid, stream$);
    }

    return this.userDocCache.get(uid)!;
  }

  /**
   * Since Google Login registers a user, if not already present, we must ensure creation of user object in firestore
   */
  async ensureUserDocumentForCurrentUser(credential: UserCredential): Promise<void> {
    const firebaseUser = credential.user;
    if (!firebaseUser) {
      return;
    }

    const existingAppUser = await this.getUserOnce(firebaseUser.uid);
    if (existingAppUser) {
      return;
    }

    if (firebaseUser.isAnonymous) {
      const userData = await this.guestService.buildGuestUserDocData();
      await this.createUserDocument(firebaseUser, userData);
      return;
    }

    const fallbackNameFromEmail = firebaseUser.email?.split('@')[0] ?? TEXTS.NEW_USER;
    const name = firebaseUser.displayName || fallbackNameFromEmail;
    const photoUrl = PROFILE_PICTURE_URLS.default;

    await this.authService.updateUserProfile(name);
    await this.createUserDocument(firebaseUser, {
      name,
      profilePictureKey: 'default',
    });
  }

  async logout(): Promise<void> {
    const user = this.currentUser();

    try {
      if (user && !user.isGuest) {
        await this.setOffline(user.uid);
      }

      if (user?.isGuest) {
        // show text because of longer time it takes to remove all guest trails
        this.fullscreenOverlayService.showFullscreenOverlay('loading', NOTIFICATIONS.LOGGING_OUT);
        await this.guestService.signOutGuest(user);
      } else {
        // show no text because that would rather flash the user. It usually signs out lightning fast and you don't even see the overlay.
        this.fullscreenOverlayService.showFullscreenOverlay('loading');
        this.currentUser.set(null);
        await this.authService.signOut();
      }
    } catch (error: any) {
      this.toastService.error(error.message ?? NOTIFICATIONS.TOAST_LOGOUT_FAILURE);
    } finally {
      this.fullscreenOverlayService.hideFullscreenOverlay();
    }
  }

  getProfilePictureUrl(user: AppUser | null): string {
    return PROFILE_PICTURE_URLS[user?.profilePictureKey ?? 'default'];
  }

  private async setOffline(uid: string): Promise<void> {
    try {
      await updateDoc(doc(this.firestore, `users/${uid}`), {
        onlineStatus: false,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Fehler beim Setzen des Offline-Status:', error);
    }
  }
}
