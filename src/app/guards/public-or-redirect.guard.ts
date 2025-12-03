import { inject } from '@angular/core';
import { CanMatchFn, Router, Route, UrlSegment } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth';

export const publicOrRedirectGuard: CanMatchFn = (route: Route, segments: UrlSegment[]) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return combineLatest([authService.isLoggedIn$, authService.isEmailVerified$]).pipe(
    map(([isLoggedIn, isEmailVerified]) => {
      if (!isLoggedIn) {
        return true;
      }

      if (isEmailVerified) {
        return router.createUrlTree(['/main']);
      }

      return router.createUrlTree(['/verify-email']);
    })
  );
};
