import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Workspace } from './workspace/workspace';
import { ScreenService } from '../services/screen.service';
import { FirestoreService } from '../services/firestore.service';
import { UserService } from '../services/user.service';
import { of, switchMap } from 'rxjs';

@Component({
  selector: 'app-main-home',
  standalone: true,
  imports: [CommonModule, Workspace],
  template: `
    @if (isSmallScreen()) {
      <app-workspace class="h-full w-full"></app-workspace>
    } @else {
      <section class="main-home">
        <p *ngIf="isLoading()">Lade deine Channels...</p>
        <p *ngIf="!isLoading() && !hasChannels()">Kein Channel gefunden. Lege links einen an, um zu starten.</p>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .main-home {
        height: 100%;
        display: grid;
        place-items: center;
        color: #64748b;
        font-size: 1.1rem;
      }
    `,
  ],
})
export class MainHome {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly screenService = inject(ScreenService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly userService = inject(UserService);
  private readonly currentUser$ = toObservable(this.userService.currentUser);

  protected readonly isSmallScreen = this.screenService.isSmallScreen;
  protected readonly isLoading = signal(true);
  protected readonly hasChannels = signal(false);

  constructor() {
    this.screenService.connect();

    this.currentUser$
      .pipe(
        switchMap((user) => (user ? this.firestoreService.getChannelsForUser(user.uid) : of([]))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((channels) => {
        this.isLoading.set(false);
        this.hasChannels.set(channels.length > 0);

        const firstChannelId = channels.find((c) => !!c.id)?.id;
        if (!this.isSmallScreen() && firstChannelId) {
          void this.router.navigate(['/main/channels', firstChannelId], { replaceUrl: true });
        }
      });
  }
}
