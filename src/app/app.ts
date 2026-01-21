import { Component, signal, inject, OnDestroy } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, filter, takeUntil } from 'rxjs';
import { BrandStateService } from './services/brand-state.service';
import { Startscreen } from './startscreen/startscreen';
import { ToastOutletComponent } from './toast/toast-outlet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Startscreen, CommonModule, ToastOutletComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private router = inject(Router);
  private destroy$ = new Subject<void>();
  private previousUrl: string | null = null;
  private readonly NO_SPLASH_RETURN_ROUTES = new Set(['/legal-notice', '/privacy-policy', '/signup']);

  constructor(public brandState: BrandStateService) {
    this.router.events
      .pipe(
        filter((e): e is NavigationStart => e instanceof NavigationStart),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        if (event.url === '/login' && !this.isInternalReturn()) {
          this.brandState.resetSplash();
        }

        this.previousUrl = event.url;
      });
  }

  private isInternalReturn(): boolean {
    return this.previousUrl ? this.NO_SPLASH_RETURN_ROUTES.has(this.previousUrl) : false;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly title = signal('daBubble');
}
