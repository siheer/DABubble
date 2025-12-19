import { Routes } from '@angular/router';
import { Signup } from './auth/signup/signup';
import { MainContent } from './main-content/main-content';
import { Login } from './auth/login/login';
import { VerifyEmail } from './auth/verify-email/verify-email';
import { EmailConfirmed } from './auth/email-confirmed/email-confirmed';
import { publicOrRedirectGuard } from './guards/public-or-redirect.guard';
import { onlyVerifiedGuard } from './guards/only-verified.guard';
import { emailConfirmedGuard } from './guards/email-confirmed.guard';
import { ResetPassword } from './auth/reset-password/reset-password';
import { AuthAction } from './auth/auth-action/auth-action';
import { unverifiedGuard } from './guards/unverified.guard';
import { LegalNotice } from './aside-content/legal-notice/legal-notice';
import { PrivacyPolicy } from './aside-content/privacy-policy/privacy-policy';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    component: Login,
    canActivate: [publicOrRedirectGuard],
  },
  {
    path: 'signup',
    component: Signup,
    canActivate: [publicOrRedirectGuard],
  },
  {
    path: 'auth-action',
    component: AuthAction,
  },
  {
    path: 'reset-password',
    component: ResetPassword,
  },
  {
    path: 'verify-email',
    component: VerifyEmail,
    canActivate: [unverifiedGuard],
  },
  {
    path: 'email-confirmed',
    component: EmailConfirmed,
    canActivate: [emailConfirmedGuard],
  },
  {
    path: 'main',
    component: MainContent,
    canActivate: [onlyVerifiedGuard],
  },
  {
    path: 'legal-notice',
    component: LegalNotice,
  },
  {
    path: 'privacy-policy',
    component: PrivacyPolicy,
  },
];
