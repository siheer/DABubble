import { Injectable, inject, signal } from '@angular/core';
import {
  DocumentSnapshot,
  Firestore,
  collection,
  collectionData,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
} from '@angular/fire/firestore';
import { User as FirebaseUser, UserCredential } from 'firebase/auth';
import { Observable, map } from 'rxjs';
import { PROFILE_PICTURE_URLS } from '../auth/set-profile-picture/set-profile-picture';
import { AuthService } from './auth.service';
import { TEXTS } from '../texts';

export interface AppUser {
  uid: string;
  email: string | null;
  name: string;
  photoUrl: string;
  onlineStatus: boolean;
  lastSeen?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  //   role?: 'moderator' | 'user';
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private userSnapshotUnsubscribe?: () => void;

  currentUser = signal<AppUser | null>(null);

  constructor() {
    this.authService.authState$.subscribe((firebaseUser) => {
      this.handleAuthStateChange(firebaseUser);
    });
  }

  private async handleAuthStateChange(firebaseUser: FirebaseUser | null): Promise<void> {
    if (!firebaseUser) {
      await this.handleSignOutState();
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
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const snap = await getDoc(userRef);

    // If no user document exists, do NOT create one automatically.
    // Creation occurs explicitly in signup / Google login via
    // ensureUserDocumentForCurrentUser / createUserDocument.
    if (!snap.exists()) {
      return;
    }

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
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);

    const newUser: AppUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: data.name || TEXTS.NEW_USER,
      photoUrl: data.photoUrl || PROFILE_PICTURE_URLS.default,
      onlineStatus: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    };

    return setDoc(userRef, newUser);
  }

  /**
   * Loading the user document once without setting up a listener.
   * @param uid - User ID of current User.
   */
  async getUserOnce(uid: string): Promise<AppUser | null> {
    const userDoc = doc(this.firestore, `users/${uid}`);
    const snap = await getDoc(userDoc);

    if (!snap.exists()) return null;

    return snap.data() as AppUser;
  }

  /**
   * Listener on the Firestore-User-Document.
   * Updates `currentUser` automatically on changes in firestore
   */
  private listenToUserDocument(uid: string): void {
    this.unsubscribeFromUserDocument();
    const userRef = doc(this.firestore, `users/${uid}`);

    this.userSnapshotUnsubscribe = onSnapshot(userRef, (snap: DocumentSnapshot<any>) => {
      if (!snap.exists()) {
        this.currentUser.set(null);
        return;
      }

      this.currentUser.set(snap.data() as AppUser);
    });
  }

  private async handleSignOutState(): Promise<void> {
    const prevUser = this.currentUser();
    this.unsubscribeFromUserDocument();

    if (prevUser) {
      await updateDoc(doc(this.firestore, `users/${prevUser.uid}`), {
        onlineStatus: false,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    this.currentUser.set(null);
  }

  private unsubscribeFromUserDocument(): void {
    if (this.userSnapshotUnsubscribe) {
      this.userSnapshotUnsubscribe();
      this.userSnapshotUnsubscribe = undefined;
    }
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
    const usersCollection = collection(this.firestore, 'users');

    return collectionData(usersCollection, { idField: 'uid' }).pipe(
      map((users) => {
        // 🔥 DEBUG: Alle User anzeigen, die aus Firestore kommen
        console.log('🔥 [Firestore users] raw:', users);

        return (users as Array<Partial<AppUser> & { uid?: string }>).map((user) => ({
          uid: user.uid ?? 'unbekannt',
          name: user.name ?? 'Unbenannter Nutzer',
          email: user.email ?? null,
          photoUrl: user.photoUrl || 'imgs/default-profile-picture.png',
          onlineStatus: user.onlineStatus ?? false,
          lastSeen: user.lastSeen,
          updatedAt: user.updatedAt,
          createdAt: user.createdAt,
        }));
      })
    );
  }

  /**
   * Since Google Login registers a user, if not already present, we must ensure creation of user object in firestore
   */
  async ensureUserDocumentForCurrentUser(credential: UserCredential): Promise<void> {
    const firebaseUser = credential.user;
    if (!firebaseUser || firebaseUser.isAnonymous) {
      return;
    }

    const existingAppUser = await this.getUserOnce(firebaseUser.uid);
    if (existingAppUser) {
      return;
    }

    const fallbackNameFromEmail = firebaseUser.email?.split('@')[0] ?? TEXTS.NEW_USER;
    const name = firebaseUser.displayName || fallbackNameFromEmail;
    const photoUrl = PROFILE_PICTURE_URLS.default;

    await this.authService.updateUserProfile(name, photoUrl);
    await this.createUserDocument(firebaseUser, {
      name,
      photoUrl,
    });
  }
}
