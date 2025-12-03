import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NOTIFICATIONS } from '../../notifications';
import { RegistrationStateService } from '../../services/registration-state';
import { PROFILE_PICTURE_URLS } from '../set-profile-picture/set-profile-picture';

@Component({
  selector: 'app-signup',
  imports: [CommonModule, FormsModule],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup implements OnInit {
  private authenticationService = inject(AuthService);
  private router = inject(Router);
  private registrationStateService = inject(RegistrationStateService);

  name = '';
  emailAddress = '';
  password = '';
  acceptedPrivacy = false;

  isSubmitting = false;
  errorMessage: string | null = null;
  passwordValidationErrors: string[] = [];

  ngOnInit(): void {
    const storedData = this.registrationStateService.getRegistrationData();
    if (storedData) {
      this.name = storedData.fullName;
      this.emailAddress = storedData.emailAddress;
      this.password = storedData.password;
      this.acceptedPrivacy = storedData.acceptedPrivacy;
    }
  }

  async onSubmit(form: NgForm): Promise<void> {
    if (this.isSubmitting || form.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.passwordValidationErrors = [];

    try {
      const passwordValidationResult = await this.authenticationService.validateUserPassword(
        this.password
      );

      if (!passwordValidationResult.isValid) {
        this.passwordValidationErrors =
          this.authenticationService.buildPasswordErrorMessages(passwordValidationResult);
        return;
      }

      this.registrationStateService.setRegistrationData({
        fullName: this.name,
        emailAddress: this.emailAddress,
        password: this.password,
        acceptedPrivacy: this.acceptedPrivacy,
        profilePicture: { key: 'default', path: PROFILE_PICTURE_URLS.default },
      });

      await this.router.navigate(['/set-profile-picture']);
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  onBackToLogin(): void {
    this.registrationStateService.clearRegistrationData();
    this.router.navigate(['/login']);
  }
}
