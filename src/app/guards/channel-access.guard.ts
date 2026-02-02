import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { ChannelMembershipService } from '../services/membership.service';
import { AuthService } from '../services/auth.service';
import { map, Observable, of, switchMap, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChannelAccessGuard implements CanActivate {
  constructor(
    private membershipService: ChannelMembershipService,
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const channelId = route.paramMap.get('channelId');
    if (!channelId) {
      return of(this.router.createUrlTree(['/main']));
    }

    return this.authService.authState$.pipe(
      take(1),
      switchMap((authUser) => {
        if (!authUser) {
          return of(this.router.createUrlTree(['/login']));
        }

        return this.membershipService.getChannelsForUser(authUser.uid).pipe(
          take(1),
          map((channels) => (channels.some((c) => c.id === channelId) ? true : this.router.createUrlTree(['/main'])))
        );
      })
    );
  }
}
