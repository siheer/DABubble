import { Component, input, OnDestroy, signal } from '@angular/core';
import { Logo } from './logo';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { BrandStateService } from '../services/brand-state.service';

@Component({
  selector: 'app-aside-content-wrapper',
  standalone: true,
  imports: [Logo, RouterLink, NgTemplateOutlet],
  template: `
    <ng-template #main>
      <main class="dab-page-card">
        <ng-content select="[card]"></ng-content>
      </main>
    </ng-template>

    <ng-template #top>
      <ng-content select="[topRight]"></ng-content>
    </ng-template>

    <ng-template #footer>
      <footer>
        <div class="flex h-full items-end justify-center px-8 pt-4 pb-6 sm:px-10 sm:pb-10">
          <div class="flex flex-wrap justify-center gap-4">
            <a routerLink="/legal-notice" class="dab-anchor-on-bg">Impressum</a>
            <a routerLink="/privacy-policy" class="dab-anchor-on-bg">Datenschutz</a>
          </div>
        </div>
      </footer>
    </ng-template>

    @if (showCardSurroundings()) {
      @if (isSmallScreen()) {
        <section class="aside-content-wrapper">
          <header>
            <div class="flex h-full justify-center px-8 pt-6 pb-4 sm:px-10 sm:pt-10">
              <app-logo [class.logo-hidden]="!brandState.splashDone()"></app-logo>
            </div>
          </header>

          <ng-container [ngTemplateOutlet]="main"></ng-container>

          <div class="top-above-footer flex items-end justify-center">
            <ng-container [ngTemplateOutlet]="top"></ng-container>
          </div>

          <ng-container [ngTemplateOutlet]="footer"></ng-container>
        </section>
      } @else {
        <section class="aside-content-wrapper">
          <header>
            <div class="flex h-full items-start justify-between px-8 pt-6 pb-4 sm:px-10 sm:pt-10">
              <app-logo [class.logo-hidden]="!brandState.splashDone()"></app-logo>
              <ng-container [ngTemplateOutlet]="top"></ng-container>
            </div>
          </header>

          <ng-container [ngTemplateOutlet]="main"></ng-container>

          <ng-container [ngTemplateOutlet]="footer"></ng-container>
        </section>
      }
    } @else {
      <ng-container [ngTemplateOutlet]="main"></ng-container>
    }
  `,
  styles: `
    .top-above-footer ::ng-deep [topright] {
      align-items: center;

      a {
        margin-right: 0;
      }
    }
    .logo-hidden {
      opacity: 0;
      visibility: hidden;
    }
  `,
})
export class AsideContentWrapperComponent implements OnDestroy {
  /**
   * Set to false if the content is only the card, e.g. in an overlay for reauth.
   */
  showCardSurroundings = input(true);

  isSmallScreen = signal(false);
  mediaQueryListener: MediaQueryList;
  matchQuery: () => void;

  constructor(public brandState: BrandStateService) {
    this.mediaQueryListener = matchMedia('(width < 40rem)');
    this.matchQuery = () => this.isSmallScreen.set(this.mediaQueryListener.matches);

    this.matchQuery();
    this.mediaQueryListener.addEventListener('change', this.matchQuery);
  }

  ngOnDestroy(): void {
    this.mediaQueryListener.removeEventListener('change', this.matchQuery);
  }
}
