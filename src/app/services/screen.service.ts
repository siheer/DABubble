import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScreenService {
  readonly isSmallScreen = signal(false);
  readonly isTabletScreen = signal(false);

  readonly isDesktopAndUp = computed(() => !this.isTabletScreen());

  private readonly smallScreenMediaQueryList = matchMedia('(width < 40rem)');
  private readonly tabletScreenMediaQueryList = matchMedia('(width < 64rem)');

  private isListenerAttached = false;

  connect(): void {
    this.updateAll();

    if (this.isListenerAttached) return;

    this.smallScreenMediaQueryList.addEventListener('change', this.updateSmallScreen);
    this.tabletScreenMediaQueryList.addEventListener('change', this.updateBelowDesktop);

    this.isListenerAttached = true;
  }

  private updateAll(): void {
    this.updateSmallScreen();
    this.updateBelowDesktop();
  }

  private readonly updateSmallScreen = () => {
    this.isSmallScreen.set(this.smallScreenMediaQueryList.matches);
  };

  private readonly updateBelowDesktop = () => {
    this.isTabletScreen.set(this.tabletScreenMediaQueryList.matches);
  };
}
