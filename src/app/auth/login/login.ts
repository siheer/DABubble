import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NOTIFICATIONS } from '../../notifications';
import { AuthenticationResult } from '../../types';
import { UserCredential } from 'firebase/auth';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';

  isSubmitting = false;
  errorMessage: string | null = null;

  private handleError(error: any) {
    if (error && typeof error === 'object' && 'success' in error) {
      const authenticationResultError = error as AuthenticationResult<unknown>;
      this.errorMessage = authenticationResultError.errorMessage ?? NOTIFICATIONS.SIGNUP_ERROR;
    } else {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    }
  }

  private async executeLogin(
    loginAction: () => Promise<AuthenticationResult<UserCredential>>
  ): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      await loginAction();
      this.router.navigate(['/main']);
    } catch (error: any) {
      this.handleError(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  async onSubmit(form: NgForm) {
    if (form.invalid) {
      return;
    }

    await this.executeLogin(() =>
      this.authService.signInWithEmailAndPassword(this.email, this.password)
    );
  }

  async onLoginWithGoogle() {
    await this.executeLogin(() => this.authService.signInWithGoogle());
  }

  async onGuestLogin() {
    await this.executeLogin(() => this.authService.signInAsGuest());
  }
}
