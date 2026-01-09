import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Workspace } from './workspace/workspace';
import { Navbar } from './navbar/navbar';
import { ScreenService } from '../services/screen.service';
import { WorkspaceToggleButton } from './workspace-toggle-button/workspace-toggle-button';
import { UnreadMessagesService } from '../services/unread-messages.service';
import { ThreadService } from '../services/thread.service';

@Component({
  selector: 'app-main-content',
  standalone: true,
  imports: [MatSidenavModule, Workspace, Navbar, CommonModule, RouterOutlet, WorkspaceToggleButton],
  templateUrl: './main-content.html',
  styleUrl: './main-content.scss',
})
export class MainContent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly screenService = inject(ScreenService);
  private readonly threadService = inject(ThreadService);
  private readonly unreadMessagesService = inject(UnreadMessagesService);

  protected readonly isTabletScreen = this.screenService.isTabletScreen;
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
  }

  protected showMobileBackButton(): boolean {
    if (!this.isTabletScreen()) return false;
    return this.activeView() !== 'home';
  }

  protected navigateUp(): void {
    if (this.activeView() === 'thread') {
      this.threadService.requestClose();
      return;
    }

    const target = this.mobileBackTarget();
    if (!target) return;
    void this.router.navigateByUrl(target, {
      info: { mobileRouteDirection: 'back' },
    });
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

  /**
   * Synchronisiert den lokalen UI-Zustand mit dem aktuellen Router-Zustand.
   *
   * Die Methode traversiert den `ActivatedRoute`-Baum entlang der `firstChild`-Kette (von der aktuellen Route aus)
   * und leitet daraus eine Momentaufnahme für die UI ab:
   *
   * - Ermittelt die aktuell relevanten Routenparameter `channelId`, `dmId` und `threadId` aus den Snapshots.
   * - Bestimmt die aktive Ansicht (`activeView`) anhand des `routeConfig.path` der gefundenen Route-Segmente.
   * - Setzt bei fehlender Child-Route den Default-Zustand (`home`) und löscht alle IDs.
   *
   * Prioritätsregel:
   * - Wenn eine `threadId` vorhanden ist, wird die Ansicht unabhängig von zuvor gefundenen Segmenten auf `thread` gesetzt.
   *
   * Hinweis:
   * - Es wird ausschließlich die lineare `firstChild`-Kette ausgewertet. Parallele/named outlets oder Geschwister-Routen
   *   werden von dieser Logik nicht berücksichtigt.
   *
   * @param route Root-Route der Komponente (typischerweise `this.route`), deren Child-Kette ausgewertet wird.
   */
  private syncRouteState(route: ActivatedRoute): void {
    const previousView = this.activeView();
    let current: ActivatedRoute | null = route.firstChild;

    if (!current) {
      this.activeChannelId.set(null);
      this.activeDmId.set(null);
      this.activeThreadId.set(null);
      this.unreadMessagesService.setActiveChannelId(null);
      this.unreadMessagesService.setActiveDmId(null);
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

    if (threadId && this.isTabletScreen()) {
      view = 'thread';
    }

    this.activeChannelId.set(channelId);
    this.activeDmId.set(dmId);
    this.activeThreadId.set(threadId);
    this.unreadMessagesService.setActiveChannelId(channelId);
    this.unreadMessagesService.setActiveDmId(dmId);
    this.activeView.set(view);
  }
}
