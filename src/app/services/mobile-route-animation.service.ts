import { Injectable, signal } from '@angular/core';

export type MobileRouteDirection = 'forward' | 'back';

@Injectable({ providedIn: 'root' })
export class MobileRouteAnimationService {
  private readonly direction = signal<MobileRouteDirection>('forward');

  setDirection(direction: MobileRouteDirection): void {
    this.direction.set(direction);
  }

  enterClass(): string {
    return this.direction() === 'back' ? 'mobile-route-enter-back' : 'mobile-route-enter-forward';
  }

  leaveClass(): string {
    return this.direction() === 'back' ? 'mobile-route-leave-back' : 'mobile-route-leave-forward';
  }
}
