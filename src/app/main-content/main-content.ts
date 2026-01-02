import { animate, group, query, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Workspace } from './workspace/workspace';
import { Navbar } from './navbar/navbar';
import { ScreenService } from '../services/screen.service';

@Component({
  selector: 'app-main-content',
  standalone: true,
  imports: [MatSidenavModule, Workspace, Navbar, CommonModule, RouterOutlet],
  templateUrl: './main-content.html',
  styleUrl: './main-content.scss',
  animations: [
    trigger('mobileRoute', [
      transition('* <=> *', [
        style({ position: 'relative', overflow: 'hidden' }),
        query(
          ':enter, :leave',
          [
            style({
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }),
          ],
          { optional: true }
        ),
        group([
          query(
            ':enter',
            [
              style({ transform: 'translateX(100%)', opacity: 0 }),
              animate('250ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ transform: 'translateX(0)', opacity: 1 })),
            ],
            { optional: true }
          ),
          query(
            ':leave',
            [
              style({ transform: 'translateX(0)', opacity: 1 }),
              animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(-20%)', opacity: 0 })),
            ],
            { optional: true }
          ),
        ]),
      ]),
    ]),
  ],
})
export class MainContent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly screenService = inject(ScreenService);

  protected readonly isSmallScreen = this.screenService.isSmallScreen;
  protected readonly activeChannelId = signal<string | null>(null);
  protected readonly activeDmId = signal<string | null>(null);
  protected readonly activeThreadId = signal<string | null>(null);
  protected readonly activeView = signal<'home' | 'channel' | 'dm' | 'thread' | 'newMessage'>('home');
  protected isCloseWorkspaceButtonHovered = false;
  protected isOpenWorkspaceButtonHovered = false;

  constructor() {
    this.screenService.connect();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        map(() => this.route),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((route) => this.syncRouteState(route));

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.urlAfterRedirects.includes('undefined')) {
          void this.router.navigate(['/main'], { replaceUrl: true });
        }
      });
  }

  protected showMobileBackButton(): boolean {
    if (!this.isSmallScreen()) return false;
    return this.activeView() !== 'home';
  }

  protected navigateUp(): void {
    const target = this.mobileBackTarget();
    if (!target) return;

    void this.router.navigateByUrl(target);
  }

  protected prepareRoute(outlet: RouterOutlet): string {
    if (!outlet || !outlet.isActivated) {
      return '';
    }

    return (
      (outlet.activatedRouteData?.['animation'] as string | undefined) ??
      outlet.activatedRoute?.routeConfig?.path ??
      ''
    );
  }

  private mobileBackTarget(): string | null {
    switch (this.activeView()) {
      case 'thread':
        return this.activeChannelId() ? `/main/channels/${this.activeChannelId()}` : '/main';
      case 'channel':
      case 'dm':
      case 'newMessage':
        return '/main';
      default:
        return null;
    }
  }

  private syncRouteState(route: ActivatedRoute): void {
    let current: ActivatedRoute | null = route.firstChild;

    if (!current) {
      this.activeChannelId.set(null);
      this.activeDmId.set(null);
      this.activeThreadId.set(null);
      this.activeView.set('home');
      return;
    }

    let channelId: string | null = null;
    let dmId: string | null = null;
    let threadId: string | null = null;
    let view: 'home' | 'channel' | 'dm' | 'thread' | 'newMessage' = 'home';

    while (current) {
      const path = current.routeConfig?.path ?? '';
      const params = current.snapshot?.paramMap;

      channelId = params?.get('channelId') ?? channelId;
      dmId = params?.get('dmId') ?? dmId;
      threadId = params?.get('threadId') ?? threadId;

      if (path.startsWith('channels')) view = 'channel';
      if (path.startsWith('dms')) view = 'dm';
      if (path.startsWith('new-message')) view = 'newMessage';

      current = current.firstChild;
    }

    if (threadId) {
      view = 'thread';
    }

    this.activeChannelId.set(channelId);
    this.activeDmId.set(dmId);
    this.activeThreadId.set(threadId);
    this.activeView.set(view);
  }
}
