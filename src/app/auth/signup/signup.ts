import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NOTIFICATIONS } from '../../notifications';
import { SetProfilePicture, PROFILE_PICTURE_URLS } from '../set-profile-picture/set-profile-picture';
import { ProfilePictureKey } from '../../types';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-signup',
  imports: [CommonModule, FormsModule, SetProfilePicture],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private authenticationService = inject(AuthService);
  private userService = inject(UserService);
  private router = inject(Router);

  name = '';
  emailAddress = '';
  password = '';
  acceptedPrivacy = false;

  isSubmitting = false;
  errorMessage: string | null = null;
  passwordValidationErrors: string[] = [];

  isAvatarStep = false;
  selectedProfilePictureKey: ProfilePictureKey = 'default';

  async onSubmit(form: NgForm): Promise<void> {
    if (this.isSubmitting || form.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.passwordValidationErrors = [];

    try {
      const passwordValidationResult = await this.authenticationService.validateUserPassword(this.password);

      if (!passwordValidationResult.isValid) {
        this.passwordValidationErrors = this.authenticationService.buildPasswordErrorMessages(passwordValidationResult);
        return;
      }

      this.isAvatarStep = true;
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  onProfilePictureChange(key: ProfilePictureKey): void {
    this.selectedProfilePictureKey = key;
  }

  async onCompleteSignup(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      const userCredential = await this.authenticationService.signUpWithEmailAndPassword(
        this.emailAddress,
        this.password
      );

      const photoUrl = PROFILE_PICTURE_URLS[this.selectedProfilePictureKey];
      await this.authenticationService.updateUserProfile(this.name, photoUrl);

      await this.userService.createUserDocument(userCredential.user, {
        name: this.name,
        photoUrl: photoUrl,
        onlineStatus: true,
      });

      await this.authenticationService.sendEmailVerificationLink(userCredential.user);
      this.router.navigate(['/verify-email']);
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  onBackToLogin(): void {
    this.router.navigate(['/login']);
  }

  onBackFromAvatarStep(): void {
    if (this.isSubmitting) {
      return;
    }
    this.isAvatarStep = false;
  }
}
