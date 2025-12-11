import { Injectable, inject } from '@angular/core';
import {
  Auth,
  User,
  UserCredential,
  authState,
  user,
  createUserWithEmailAndPassword,
  idToken,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
  AuthErrorCodes,
  validatePassword,
  updateProfile,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  signInAnonymously,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  applyActionCode,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  deleteUser,
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { PasswordValidationResult } from '../types';
import { NOTIFICATIONS } from '../notifications';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly auth: Auth = inject(Auth);
  private router = inject(Router);

  constructor() {
    this.auth.useDeviceLanguage();
    (globalThis as any).signOut = () => this.signOut();
  }

  readonly user$: Observable<User | null> = user(this.auth);
  readonly authState$: Observable<User | null> = authState(this.auth);
  readonly idToken$: Observable<string | null> = idToken(this.auth);

  readonly isLoggedIn$: Observable<boolean> = this.authState$.pipe(
    map((currentUser) => currentUser != null),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly isEmailVerified$: Observable<boolean> = this.user$.pipe(
    map((currentUser) => Boolean(currentUser?.emailVerified || currentUser?.isAnonymous)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private throwMappedError(error: any): never {
    const mappedMessage = this.mapFirebaseError(error);
    if (mappedMessage) {
      const mappedError = new Error(mappedMessage) as any;
      mappedError.code = error.code;
      throw mappedError;
    }
    throw error;
  }

  async signUpWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    try {
      return await createUserWithEmailAndPassword(this.auth, email, password);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    try {
      return await firebaseSignInWithEmailAndPassword(this.auth, email, password);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async signInWithGoogle(): Promise<UserCredential> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
      });
      return await signInWithPopup(this.auth, provider);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async signInAsGuest(): Promise<UserCredential> {
    try {
      return await signInAnonymously(this.auth);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      await firebaseSendPasswordResetEmail(this.auth, email, {
        url: `${window.location.origin}/auth-action`,
        handleCodeInApp: true,
      });
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async updateUserProfile(displayName?: string | null, photoURL?: string | null): Promise<User> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error(NOTIFICATIONS.NO_USER_LOGGED_IN);
    }

    try {
      await updateProfile(currentUser, {
        displayName: displayName ?? currentUser.displayName ?? undefined,
        photoURL: photoURL ?? currentUser.photoURL ?? undefined,
      });

      return currentUser;
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async sendEmailVerificationLink(user: User | null): Promise<void> {
    if (!user) {
      throw new Error(NOTIFICATIONS.NO_USER_LOGGED_IN);
    }

    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/auth-action`,
        handleCodeInApp: true,
      });
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async verifyEmail(outOfBandCode: string): Promise<void> {
    try {
      await applyActionCode(this.auth, outOfBandCode);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async verifyPasswordResetCode(outOfBandCode: string): Promise<string> {
    try {
      return await firebaseVerifyPasswordResetCode(this.auth, outOfBandCode);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async confirmPasswordReset(outOfBandCode: string, newPassword: string): Promise<void> {
    try {
      await firebaseConfirmPasswordReset(this.auth, outOfBandCode, newPassword);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async reauthenticateWithPassword(password: string): Promise<User> {
    const currentUser = this.auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error(NOTIFICATIONS.NO_USER_LOGGED_IN);
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      const result = await reauthenticateWithCredential(currentUser, credential);
      return result.user;
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async reauthenticateWithGoogle(): Promise<User> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error(NOTIFICATIONS.NO_USER_LOGGED_IN);
    }

    try {
      const provider = new GoogleAuthProvider();
      const result = await reauthenticateWithPopup(currentUser, provider);
      return result.user;
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  async deleteCurrentUser(): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error(NOTIFICATIONS.NO_USER_LOGGED_IN);
    }

    try {
      await deleteUser(currentUser);
      await this.router.navigate(['/login']);
    } catch (error: any) {
      this.throwMappedError(error);
    }
  }

  getCurrentUserSignInProvider(): 'password' | 'google' | 'anonymous' | 'other' | null {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      return null;
    }

    if (currentUser.isAnonymous) {
      return 'anonymous';
    }

    const primaryProviderId = currentUser.providerData[0]?.providerId;

    if (primaryProviderId === 'password') {
      return 'password';
    }

    if (primaryProviderId === 'google.com') {
      return 'google';
    }

    return 'other';
  }

  private readonly firebaseErrorMessages: Record<string, string> = {
    [AuthErrorCodes.INVALID_EMAIL]: NOTIFICATIONS.FIREBASE_INVALID_EMAIL,
    [AuthErrorCodes.USER_DISABLED]: NOTIFICATIONS.FIREBASE_USER_DISABLED,
    [AuthErrorCodes.USER_DELETED]: NOTIFICATIONS.FIREBASE_USER_DELETED,
    [AuthErrorCodes.INVALID_PASSWORD]: NOTIFICATIONS.FIREBASE_INVALID_PASSWORD,
    [AuthErrorCodes.EMAIL_EXISTS]: NOTIFICATIONS.FIREBASE_EMAIL_EXISTS,
    [AuthErrorCodes.WEAK_PASSWORD]: NOTIFICATIONS.FIREBASE_WEAK_PASSWORD,
    [AuthErrorCodes.INVALID_LOGIN_CREDENTIALS]: NOTIFICATIONS.FIREBASE_INVALID_LOGIN_CREDENTIALS,
    [AuthErrorCodes.POPUP_CLOSED_BY_USER]: NOTIFICATIONS.FIREBASE_POPUP_CLOSED_BY_USER,
    [AuthErrorCodes.EXPIRED_OOB_CODE]: NOTIFICATIONS.FIREBASE_EXPIRED_OOB_CODE,
    [AuthErrorCodes.INVALID_OOB_CODE]: NOTIFICATIONS.FIREBASE_INVALID_OOB_CODE,
    [AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER]: NOTIFICATIONS.FIREBASE_TOO_MANY_REQUESTS,
    [AuthErrorCodes.CREDENTIAL_TOO_OLD_LOGIN_AGAIN]: NOTIFICATIONS.FIREBASE_REQUIRES_RECENT_LOGIN,
  };

  private mapFirebaseError(error: any): string | undefined {
    const code = error?.code as string | undefined;
    if (!code) {
      return undefined;
    }
    return this.firebaseErrorMessages[code];
  }

  async validateUserPassword(password: string): Promise<PasswordValidationResult> {
    const status = await validatePassword(this.auth, password);
    const unmetCriteria: PasswordValidationResult['unmetCriteria'] = {};
    const isValid = status.isValid;

    if (!isValid) {
      if (status.containsLowercaseLetter === false) {
        unmetCriteria.missingLowercase = 'Mindestens ein Kleinbuchstabe wird benötigt.';
      }
      if (status.containsUppercaseLetter === false) {
        unmetCriteria.missingUppercase = 'Mindestens ein Großbuchstabe wird benötigt.';
      }
      if (status.containsNumericCharacter === false) {
        unmetCriteria.missingNumber = 'Mindestens eine Zahl wird benötigt.';
      }
      if (status.containsNonAlphanumericCharacter === false) {
        unmetCriteria.missingSpecialChar = 'Mindestens ein Sonderzeichen wird benötigt.';
      }
      if (status.meetsMinPasswordLength === false) {
        unmetCriteria.tooShort = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
      }
      if (status.meetsMaxPasswordLength === false) {
        unmetCriteria.tooLong = 'Das Passwort darf höchstens 50 Zeichen lang sein.';
      }
    }

    return { isValid, unmetCriteria };
  }

  buildPasswordErrorMessages(passwordValidationResult: PasswordValidationResult): string[] {
    return Object.values(passwordValidationResult.unmetCriteria).filter(
      (criteriaMessage) => typeof criteriaMessage === 'string'
    );
  }
}
