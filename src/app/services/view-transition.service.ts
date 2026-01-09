import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, ViewTransitionInfo } from '@angular/router';
import { ScreenService } from './screen.service';
import { BrandStateService } from './brand-state.service';
import { MobileRouteDirection, ViewTransitionSkipRule } from '../types';

@Injectable({ providedIn: 'root' })
export class ViewTransitionService {
  private readonly screenService = inject(ScreenService);
  private readonly router = inject(Router);
  private startscreenService = inject(BrandStateService);

  private readonly skipRules: ViewTransitionSkipRule[] = [
    { route: 'threads', from: true, to: true },
    { route: 'login', from: false, to: true },
  ];

  handleViewTransition(transitionInfo: ViewTransitionInfo): void {
    if (!this.screenService.isTabletScreen()) {
      transitionInfo.transition.skipTransition();
      return;
    }

    if (this.shouldSkipViewTransition(transitionInfo.from, transitionInfo.to, this.skipRules)) {
      transitionInfo.transition.skipTransition();
      return;
    }

    this.applyMobileRouteTransitionDirection(transitionInfo.transition);
  }

  private shouldSkipViewTransition(
    from: ActivatedRouteSnapshot,
    to: ActivatedRouteSnapshot,
    rules: ViewTransitionSkipRule[]
  ): boolean {
    for (const rule of rules) {
      if (rule.from && this.routeTreeMatchesKey(from, rule.route)) return true;
      if (rule.to && this.routeTreeMatchesKey(to, rule.route)) return true;
    }
    return false;
  }

  private routeTreeMatchesKey(snapshot: ActivatedRouteSnapshot, key: string): boolean {
    const stack: ActivatedRouteSnapshot[] = [snapshot];

    while (stack.length) {
      const current = stack.pop()!;

      if (current.data['viewTransitionRouteKey'] === key) {
        if (key === 'login' && this.startscreenService.splashDone()) {
          return false;
        }
        return true;
      }

      for (const child of current.children) {
        stack.push(child);
      }
    }

    return false;
  }

  private applyMobileRouteTransitionDirection(transition: ViewTransition): void {
    const navigation = this.router.currentNavigation();

    const navigationInfo = navigation?.extras.info as { mobileRouteDirection?: MobileRouteDirection } | undefined;
    const explicitDirection = navigationInfo?.mobileRouteDirection;

    const isBackLike = navigation?.trigger === 'popstate' || explicitDirection === 'back';

    const root = document.documentElement;
    this.clearRootDirectionClasses();
    root.classList.add(isBackLike ? 'vt-mobile-back' : 'vt-mobile-forward');

    transition.finished.finally(() => this.clearRootDirectionClasses());
  }

  private clearRootDirectionClasses(): void {
    document.documentElement.classList.remove('vt-mobile-forward', 'vt-mobile-back');
  }
}
