import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NOTIFICATIONS } from '../../notifications';
import { SetProfilePicture } from '../set-profile-picture/set-profile-picture';
import { ProfilePictureKey } from '../../types';
import { UserService } from '../../services/user.service';
import { AsideContentWrapperComponent } from '../../aside-content/aside-content-wrapper';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { PrivacyPolicyOverlay } from '../../aside-content/privacy-policy-overlay';
import { ToastService } from '../../toast/toast.service';

@Component({
  selector: 'app-signup',
  imports: [CommonModule, FormsModule, RouterLink, SetProfilePicture, AsideContentWrapperComponent, MatCheckboxModule],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private authenticationService = inject(AuthService);
  private userService = inject(UserService);
  private router = inject(Router);
  private overlayDialog = inject(MatDialog);
  private toastService = inject(ToastService);

  name = '';
  emailAddress = '';
  password = '';
  privacyAccepted = false;

  isSubmitting = false;
  errorMessage: string | null = null;
  passwordValidationErrors: string[] = [];

  isAvatarStep = false;
  selectedProfilePictureKey: ProfilePictureKey = 'default';

  async onFirstSignupStep(form: NgForm): Promise<void> {
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

  onNameBlur(): void {
    this.name = this.normalizeUserName(this.name);
  }

  private normalizeUserName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  onProfilePictureChange(key: ProfilePictureKey): void {
    this.selectedProfilePictureKey = key;
  }

  openPrivacyOverlay() {
    this.overlayDialog.open(PrivacyPolicyOverlay, {
      panelClass: 'privacy-policy-overlay-pane',
      backdropClass: 'privacy-policy-overlay-backdrop',
      maxWidth: '800px',
      width: '100%',
      maxHeight: '65vh',
      autoFocus: false,
      restoreFocus: false,
      data: {
        mode: 'embedded',
      },
    });
  }

  async onCompleteSignup(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    this.name = this.normalizeUserName(this.name);

    try {
      const userCredential = await this.authenticationService.signUpWithEmailAndPassword(
        this.emailAddress,
        this.password
      );

      await this.authenticationService.updateUserProfile(this.name);

      await this.userService.createUserDocument(userCredential.user, {
        name: this.name,
        profilePictureKey: this.selectedProfilePictureKey,
      });

      await this.authenticationService.sendEmailVerificationLink(userCredential.user);

      this.toastService.success(NOTIFICATIONS.TOAST_SIGNUP_SUCCESS);

      this.router.navigate(['/verify-email']);
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  onBackToLogin(): void {
    this.router.navigate(['/login'], {
      info: { mobileRouteDirection: 'back' },
    });
  }

  onBackFromAvatarStep(): void {
    if (this.isSubmitting) {
      return;
    }
    this.isAvatarStep = false;
  }
}
