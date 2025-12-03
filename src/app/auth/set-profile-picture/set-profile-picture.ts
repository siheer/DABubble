import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';
import { NOTIFICATIONS } from '../../notifications';
import { RegistrationStateService } from '../../services/registration-state';
import { Router } from '@angular/router';
import { AuthenticationResult, ProfilePicture, ProfilePictureKey } from '../../types';

export const PROFILE_PICTURE_URLS = {
  default: 'imgs/default-profile-picture.png',
  m1: 'imgs/m1.png',
  m2: 'imgs/m2.png',
  m3: 'imgs/m3.png',
  m4: 'imgs/m4.png',
  f1: 'imgs/f1.png',
  f2: 'imgs/f2.png',
} as const;

@Component({
  selector: 'app-set-profile-picture',
  imports: [CommonModule],
  templateUrl: './set-profile-picture.html',
  styleUrls: ['./set-profile-picture.scss'],
})
export class SetProfilePicture implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly registrationStateService = inject(RegistrationStateService);
  private readonly router = inject(Router);

  readonly profilePictureOptions: ProfilePicture[] = Object.entries(PROFILE_PICTURE_URLS).map(
    ([key, path]) => ({
      key: key as ProfilePictureKey,
      path,
    })
  );

  profilePicture!: ProfilePicture;
  displayName = '';

  isSubmitting = false;
  updateErrorMessage = '';

  ngOnInit(): void {
    const registrationData = this.registrationStateService.getRegistrationData();
    if (!registrationData && !this.authService.auth.currentUser) {
      this.router.navigate(['/signup']);
      return;
    }

    const currentUser = this.authService.auth.currentUser;
    if (currentUser) {
      this.displayName = currentUser.displayName as string;
      this.profilePicture = this.getProfilePictureFromPath(currentUser.photoURL as string);
    }

    if (registrationData) {
      this.displayName = registrationData.fullName;
      this.profilePicture = registrationData.profilePicture;
    }
  }

  private getProfilePictureFromPath(path: string): ProfilePicture {
    const matchedOption = this.profilePictureOptions.find((option) => option.path === path);
    const matchedKey: ProfilePictureKey = matchedOption?.key ?? 'default';

    return {
      key: matchedKey,
      path: PROFILE_PICTURE_URLS[matchedKey],
    };
  }

  selectProfilePicture(path: string): void {
    this.profilePicture = this.getProfilePictureFromPath(path);
  }

  async signUp(): Promise<void> {
    const registrationData = this.registrationStateService.getRegistrationData();
    if (!registrationData || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.updateErrorMessage = '';

    try {
      const { data } = await this.authService.signUpWithEmailAndPassword(
        registrationData.emailAddress,
        registrationData.password
      );

      await this.authService.updateUserProfile(registrationData.fullName, this.profilePicture.path);

      await this.authService.sendEmailVerificationLink(data!.user);

      this.registrationStateService.clearRegistrationData();
      await this.router.navigate(['/verify-email']);
    } catch (error: any) {
      if (error && typeof error === 'object' && 'success' in error) {
        const authenticationResultError = error as AuthenticationResult<unknown>;
        this.updateErrorMessage =
          authenticationResultError.errorMessage ?? NOTIFICATIONS.SIGNUP_ERROR;
      } else {
        this.updateErrorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  onBackToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
