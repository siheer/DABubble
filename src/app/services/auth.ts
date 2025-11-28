import { Injectable, inject } from '@angular/core';
import {
  Auth,
  User,
  UserCredential,
  authState,
  user,
  createUserWithEmailAndPassword,
  idToken,
  signInWithEmailAndPassword,
  signOut,
  AuthErrorCodes,
  validatePassword,
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

export interface AuthenticationResult<T> {
  success: boolean;
  data?: T;
  errorMessage?: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  unmetCriteria: {
    missingLowercase?: string;
    missingUppercase?: string;
    missingNumber?: string;
    missingSpecialChar?: string;
    tooShort?: string;
    tooLong?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth = inject(Auth);

  readonly user$: Observable<User | null> = user(this.auth);
  readonly authState$: Observable<User | null> = authState(this.auth);
  readonly idToken$: Observable<string | null> = idToken(this.auth);

  readonly isLoggedIn$: Observable<boolean> = this.authState$.pipe(
    map((currentUser) => currentUser != null),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private processError<T>(error: any): never {
    const mappedErrorMessage = this.mapFirebaseError(error);
    if (mappedErrorMessage) {
      const authenticationResult: AuthenticationResult<T> = {
        success: false,
        errorMessage: mappedErrorMessage,
      };
      throw authenticationResult;
    }
    throw error;
  }

  async signUpWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<AuthenticationResult<UserCredential>> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return {
        success: true,
        data: userCredential,
      };
    } catch (error: any) {
      this.processError<UserCredential>(error);
    }
  }

  async signInWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<AuthenticationResult<UserCredential>> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return {
        success: true,
        data: userCredential,
      };
    } catch (error: any) {
      this.processError<UserCredential>(error);
    }
  }

  async signOut(): Promise<AuthenticationResult<void>> {
    try {
      await signOut(this.auth);
      return {
        success: true,
      };
    } catch (error: any) {
      this.processError<void>(error);
    }
  }

  private mapFirebaseError(error: any): string | undefined {
    const code = error?.code;
    switch (code) {
      case AuthErrorCodes.INVALID_EMAIL:
        return 'Die E-Mail-Adresse ist ungültig.';
      case AuthErrorCodes.USER_DISABLED:
        return 'Dieser Benutzer wurde deaktiviert.';
      case AuthErrorCodes.USER_DELETED:
        return 'Es existiert kein Benutzer mit diesen Daten.';
      case AuthErrorCodes.INVALID_PASSWORD:
        return 'Das Passwort ist falsch.';
      case AuthErrorCodes.EMAIL_EXISTS:
        return 'Diese E-Mail-Adresse wird bereits verwendet.';
      case AuthErrorCodes.WEAK_PASSWORD:
        return 'Das Passwort ist zu schwach.';
      default:
        return undefined;
    }
  }

  async validateUserPassword(password: string): Promise<PasswordValidationResult> {
    const status = await validatePassword(this.auth, password);
    const unmetCriteria: PasswordValidationResult['unmetCriteria'] = {};
    const isValid = status.isValid;

    if (!isValid) {
      if (status.containsLowercaseLetter !== true) {
        unmetCriteria.missingLowercase = 'Mindestens ein Kleinbuchstabe wird benötigt.';
      }
      if (status.containsUppercaseLetter !== true) {
        unmetCriteria.missingUppercase = 'Mindestens ein Großbuchstabe wird benötigt.';
      }
      if (status.containsNumericCharacter !== true) {
        unmetCriteria.missingNumber = 'Mindestens eine Zahl wird benötigt.';
      }
      if (status.containsNonAlphanumericCharacter !== true) {
        unmetCriteria.missingSpecialChar = 'Mindestens ein Sonderzeichen wird benötigt.';
      }
      if (status.meetsMinPasswordLength !== true) {
        unmetCriteria.tooShort = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
      }
      if (status.meetsMaxPasswordLength !== true) {
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
