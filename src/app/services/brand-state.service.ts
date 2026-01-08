import { Injectable, signal } from '@angular/core';

const SPLASH_KEY = 'dab_splash_done';

@Injectable({ providedIn: 'root' })
export class BrandStateService {
  splashDone = signal<boolean>(false);

  constructor() {
    const done = localStorage.getItem(SPLASH_KEY) === 'true';
    this.splashDone.set(done);
  }

  markSplashDone() {
    this.splashDone.set(true);
    localStorage.setItem(SPLASH_KEY, 'true');
  }

  resetSplash() {
    this.splashDone.set(false);
    localStorage.removeItem(SPLASH_KEY);
  }
}
