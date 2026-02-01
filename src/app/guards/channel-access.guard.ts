import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { UserService } from '../services/user.service';
import { ChannelMembershipService } from '../services/membership.service';
import { map, Observable, of, switchMap, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChannelAccessGuard implements CanActivate {
  constructor(
    private userService: UserService,
    private membershipService: ChannelMembershipService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const channelId = route.paramMap.get('channelId');
    if (!channelId) {
      return of(this.router.createUrlTree(['/main']));
    }

    return this.userService.currentUser$.pipe(
      take(1),
      switchMap((user) => {
        if (!user) {
          return of(this.router.createUrlTree(['/login']));
        }
        return this.membershipService.getChannelsForUser(user.uid).pipe(
          take(1),
          map((channels) => (channels.some((c) => c.id === channelId) ? true : this.router.createUrlTree(['/main'])))
        );
      })
    );
  }
}
