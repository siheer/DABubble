import { Directive, inject } from '@angular/core';
import { ScreenService } from '../services/screen.service';
import { MobileRouteAnimationService } from '../services/mobile-route-animation.service';

@Directive({
  selector: '[appMobileRouteAnimation]',
  standalone: true,
  host: {
    '[class.mobile-route-surface]': 'this.screenService.isTabletScreen()',
    '[animate.enter]': 'enterClass',
    // commented out, since it leads to bug on signout, then signin -> container are not removed anymore on navigation.
    // '[animate.leave]': 'leaveClass',
  },
})
export class MobileRouteAnimationDirective {
  protected readonly screenService = inject(ScreenService);
  private readonly mobileRouteAnimation = inject(MobileRouteAnimationService);

  constructor() {
    this.screenService.connect();
  }

  protected get enterClass(): string {
    if (!this.screenService.isTabletScreen()) {
      return '';
    }

    return this.mobileRouteAnimation.enterClass();
  }

  protected get leaveClass(): string {
    if (!this.screenService.isTabletScreen()) {
      return '';
    }

    return this.mobileRouteAnimation.leaveClass();
  }
}
