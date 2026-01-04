import { Directive, inject } from '@angular/core';
import { ScreenService } from '../services/screen.service';
import { MobileRouteAnimationService } from '../services/mobile-route-animation.service';

@Directive({
  selector: '[appMobileRouteAnimation]',
  standalone: true,
  host: {
    '[class.mobile-route-surface]': 'isTablet()',
    '[animate.enter]': 'enterClass',
    '[animate.leave]': 'leaveClass',
  },
})
export class MobileRouteAnimationDirective {
  private readonly screenService = inject(ScreenService);
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

  protected isTablet(): boolean {
    return this.screenService.isTabletScreen();
  }
}
