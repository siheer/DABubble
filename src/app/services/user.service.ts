import { Injectable, inject, signal } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, updateDoc, onSnapshot, DocumentSnapshot } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { User as FirebaseUser } from 'firebase/auth';

// Own User-Interface
export interface AppUser {
  uid: string;
  email: string | null;
  name: string;
  photoUrl: string;
  onlineStatus: boolean;
  //   role?: 'moderator' | 'user';
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /**
   * Signal for the currently logged-in user (AppUser).
   */
  currentUser = signal<AppUser | null>(null);

  // Listen to auth state changes
  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.currentUser.set(null);
        return;
      }

      // Monitor the Firestore user document.
      this.listenToUserDocument(user.uid);
    });
  }

  /**
   * Creates a new user document in Firestore.
   */
  async createUserDocument(firebaseUser: FirebaseUser, data: Partial<AppUser>): Promise<void> {
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);

    const newUser: AppUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: data.name || 'Neuer User',
      photoUrl: data.photoUrl || '',
      onlineStatus: true,
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
   * The Firestore listener automatically updates `currentUser`.
   */
  private listenToUserDocument(uid: string): void {
    const userRef = doc(this.firestore, `users/${uid}`);

    onSnapshot(userRef, (snap: DocumentSnapshot<any>) => {
      if (!snap.exists()) {
        this.currentUser.set(null);
        return;
      }

      this.currentUser.set(snap.data() as AppUser);
    });
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
}
