import { Component, inject, input, output, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NOTIFICATIONS } from '../../notifications';
import { UserCredential } from 'firebase/auth';
import { UserService } from '../../services/user.service';
import { GuestService } from '../../services/guest.service';
import { AsideContentWrapperComponent } from '../../aside-content/aside-content-wrapper';
import { ToastService } from '../../toast/toast.service';
import { firstValueFrom } from 'rxjs';
import { FullscreenOverlayService } from '../../services/fullscreen-overlay.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink, AsideContentWrapperComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly guestService = inject(GuestService);
  private readonly toastService = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly fullscreenOverlayService = inject(FullscreenOverlayService);

  mode = input<'login' | 'reauth'>('login');
  embedded = input(false);
  completed = output<'login' | 'reauth'>();

  email = '';
  password = '';

  isSubmitting = false;
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  isResetMode = false;

  private get isReauthMode(): boolean {
    return this.mode() === 'reauth';
  }

  private resetMessages() {
    this.errorMessage = null;
    this.infoMessage = null;
  }

  private async executeLogin(loginAction: () => Promise<UserCredential>) {
    if (this.isSubmitting) {
      return;
    }

    this.fullscreenOverlayService.showFullscreenOverlay('loading', NOTIFICATIONS.LOGGING_IN);
    this.isSubmitting = true;
    this.resetMessages();

    try {
      const credential = await loginAction();
      await this.userService.ensureUserDocumentForCurrentUser(credential);
      this.cleanupExpiredGuests();

      this.toastService.info(NOTIFICATIONS.TOAST_LOGIN_SUCCESS, { durationMs: 2000 });

      this.router.navigate(['/main']);
      this.completed.emit('login');
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
      this.toastService.error(NOTIFICATIONS.TOAST_LOGIN_FAILURE);
    } finally {
      this.isSubmitting = false;
      this.fullscreenOverlayService.hideFullscreenOverlay();
    }
  }

  private async handleReauthWithPassword() {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.resetMessages();

    try {
      await this.authService.reauthenticateWithPassword(this.password);
      this.completed.emit('reauth');
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.GENERAL_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  private async handleReauthWithGoogle() {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.resetMessages();

    try {
      await this.authService.reauthenticateWithGoogle();
      this.completed.emit('reauth');
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.GENERAL_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  async onSubmit(form: NgForm) {
    if (form.invalid) {
      return;
    }

    if (this.isReauthMode) {
      await this.handleReauthWithPassword();
      return;
    }

    await this.executeLogin(() => this.authService.signInWithEmailAndPassword(this.email, this.password));
  }

  async onLoginWithGoogle() {
    if (this.isReauthMode) {
      await this.handleReauthWithGoogle();
      return;
    }

    await this.executeLogin(() => this.authService.signInWithGoogle());
  }

  async onGuestLogin() {
    if (this.isReauthMode) {
      return;
    }

    await this.executeLogin(() => this.authService.signInAsGuest());
  }

  onStartPasswordReset() {
    if (this.isSubmitting || this.isReauthMode) {
      return;
    }

    this.resetMessages();
    this.isResetMode = true;
  }

  onBackToLoginView() {
    if (this.isSubmitting) {
      return;
    }

    this.resetMessages();
    this.isResetMode = false;
  }

  async onSendPasswordReset(form: NgForm) {
    if (this.isSubmitting || form.invalid) {
      return;
    }

    this.resetMessages();

    if (!this.email) {
      this.errorMessage = NOTIFICATIONS.EMAIL_FORMAT_ERROR;
      return;
    }

    this.isSubmitting = true;

    try {
      await this.authService.sendPasswordResetEmail(this.email);
      this.toastService.info(NOTIFICATIONS.TOAST_EMAIL_SENT, { icon: 'send' });
    } catch (error: any) {
      this.errorMessage = error?.message ?? NOTIFICATIONS.SIGNUP_ERROR;
    } finally {
      this.isSubmitting = false;
    }
  }

  private cleanupExpiredGuests() {
    queueMicrotask(() => {
      runInInjectionContext(this.injector, async () => {
        try {
          const allUsers = await firstValueFrom(this.userService.getAllUsers());
          await this.guestService.cleanupExpiredGuestsIfNeeded(allUsers);
        } catch (error: any) {
          // Silently ignore failed-precondition errors from concurrent cleanups
          if (error?.code !== 'failed-precondition') {
            console.error(NOTIFICATIONS.GUEST_CLEANUP_EXPIRED_FAILED, error);
          }
        }
      });
    });
  }
}
