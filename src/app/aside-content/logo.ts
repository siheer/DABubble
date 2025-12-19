import { Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  imports: [],
  template: `
    <div class="flex items-center gap-3">
      <img src="imgs/logo.svg" alt="DABubble Logo" class="block" />
      @if (withText()) {
        <span class="text-2xl font-bold sm:text-3xl">DABubble</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 70px;
      width: 70px;
    }

    @media (min-width: 40rem) {
      :host {
        height: 80px;
        width: 80px;
      }
    }
  `,
})
export class Logo {
  withText = input(true);
}
