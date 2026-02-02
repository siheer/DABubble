import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const emailConfirmedGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const queryParamMap = route.queryParamMap;
  const outOfBandCode = queryParamMap.get('oobCode');
  const mode = queryParamMap.get('mode');

  return combineLatest([authService.isLoggedIn$, authService.isEmailVerified$]).pipe(
    map(([isLoggedIn, isEmailVerified]) => {
      const hasValidVerificationParams = Boolean(outOfBandCode && mode === 'verifyEmail');
      if (hasValidVerificationParams) {
        return true;
      }

      if (isLoggedIn && isEmailVerified) {
        return true;
      }

      if (isLoggedIn && !isEmailVerified) {
        return router.createUrlTree(['/verify-email']);
      }

      return router.createUrlTree(['/login']);
    })
  );
};
