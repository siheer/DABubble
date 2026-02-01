import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Workspace } from './workspace/workspace';
import { ScreenService } from '../services/screen.service';
import { ChannelMembershipService } from '../services/membership.service';
import { UserService } from '../services/user.service';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

@Component({
  selector: 'app-main-home',
  standalone: true,
  imports: [CommonModule, Workspace],

  template: `
    @if (isTabletScreen()) {
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
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly userService = inject(UserService);

  private readonly currentUser$ = this.userService.currentUser$;

  protected readonly isTabletScreen = this.screenService.isTabletScreen;
  protected readonly isLoading = signal(true);
  protected readonly hasChannels = signal(false);

  constructor() {
    this.screenService.connect();

    this.currentUser$
      .pipe(
        map((user) => user?.uid ?? null),
        distinctUntilChanged(),
        tap((uid) => {
          this.isLoading.set(true);
          if (!uid) this.hasChannels.set(false);
        }),
        switchMap((uid) => {
          if (!uid) return of(null);
          return this.membershipService.getChannelsForUser(uid).pipe(
            catchError((error) => {
              console.error(error);
              return of([]);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((channels) => {
        if (channels === null) {
          return;
        }

        this.isLoading.set(false);
        this.hasChannels.set(channels.length > 0);

        const welcomeChannelId = channels.find((channel) => (channel.title ?? '') === 'Welcome')?.id;
        const firstChannelId = channels.find((channel) => !!channel.id)?.id;
        const targetChannelId = welcomeChannelId ? welcomeChannelId : firstChannelId;

        if (!this.isTabletScreen() && targetChannelId) {
          void this.router.navigate(['/main/channels', targetChannelId], { replaceUrl: true });
        }
      });
  }
}
