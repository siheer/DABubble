import { Component, input } from '@angular/core';

@Component({
  selector: 'app-aside-content-wrapper',
  standalone: true,
  template: `
    <section class="max-width m-auto grid min-h-full grid-rows-[1fr_auto_1fr]">
      <div>
        @if (showCardSurroundings()) {
          <div class="flex h-full items-start justify-between px-8 pt-8 sm:px-12 sm:pt-12">
            <ng-content select="[topLeft]"></ng-content>
            <ng-content select="[topRight]"></ng-content>
          </div>
        }
      </div>

      <div class="dab-page-card">
        <ng-content select="[card]"></ng-content>
      </div>

      <div>
        @if (showCardSurroundings()) {
          <footer class="flex h-full items-end justify-center px-8 pb-8 sm:px-12 sm:pb-12">
            <ng-content select="[footer]"></ng-content>
          </footer>
        }
      </div>
    </section>
  `,
})
export class AsideContentWrapperComponent {
  /**
   * Set to false if the content is only the card, e.g. in an overlay for reauth.
   */
  showCardSurroundings = input(true);
}
