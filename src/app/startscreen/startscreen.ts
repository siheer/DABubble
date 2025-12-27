import { animate, state, style, transition, trigger } from '@angular/animations';
import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandStateService } from '../services/brand-state.service';

@Component({
  selector: 'app-startscreen',
  imports: [CommonModule],
  templateUrl: './startscreen.html',
  styleUrl: './startscreen.scss',
  animations: [
    trigger('logoMove', [
      state('center', style({ transform: 'translate(0, 0) scale({{ startScale }})' }), { params: { startScale: 2 } }),
      state('textIn', style({ transform: 'translate(0, 0) scale({{ startScale }})' }), {
        params: { startScale: 2 },
      }),
      state('move', style({ transform: '{{ transform }}' }), { params: { transform: 'translate(0,0) scale(1)' } }),

      transition('center => textIn', animate('900ms cubic-bezier(0.22, 1, 0.36, 1)')),

      transition('textIn => move', animate('700ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),

    trigger('textMask', [
      state(
        'hidden',
        style({
          width: '0px',
        })
      ),
      state(
        'visible',
        style({
          width: '*',
        })
      ),
      transition('hidden => visible', animate('500ms cubic-bezier(0.25, 0.8, 0.25, 1)')),
    ]),

    trigger('textSlide', [
      state('hidden', style({ opacity: 1 })),
      state('visible', style({ opacity: 1 })),
      transition('hidden => visible', animate('500ms')),
    ]),

    trigger('textColor', [
      state(
        'light',
        style({
          color: '#ffffff',
        })
      ),
      state(
        'dark',
        style({
          color: '#000000',
        })
      ),
      transition('light => dark', animate('700ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),

    trigger('fadeOut', [
      state(
        'visible',
        style({
          opacity: 1,
        })
      ),
      state(
        'hidden',
        style({
          opacity: 0,
        })
      ),
      transition('visible => hidden', animate('1200ms ease-in-out', style({ opacity: 0 }))),
    ]),
  ],
})
export class Startscreen implements AfterViewInit {
  @ViewChild('splashWrapper', { read: ElementRef })
  splashWrapper!: ElementRef<HTMLElement>;
  logoOpacity: any;
  isSmallScreen = window.matchMedia('(max-width: 40rem)').matches;
  startScale = this.isSmallScreen ? 1 : 2;

  constructor(private brandState: BrandStateService) {}

  private getTargetLogoRect(): DOMRect | null {
    const el = document.querySelector('app-logo a > div') as HTMLElement;
    return el ? el.getBoundingClientRect() : null;
  }

  logoState: 'center' | 'textIn' | 'move' = 'center';
  logoTransform = '';
  showText = false;
  fadeState: 'visible' | 'hidden' = 'visible';
  textColorState: 'light' | 'dark' = 'light';

  ngAfterViewInit() {
    // show text
    setTimeout(() => {
      this.logoState = 'textIn';
    }, 200);

    setTimeout(() => {
      this.showText = true;
    }, 500);

    // moving logo
    setTimeout(() => {
      const targetRect = this.getTargetLogoRect();
      if (!targetRect) return;

      const splashRect = this.splashWrapper.nativeElement.getBoundingClientRect();

      const splashCenterX = splashRect.left + splashRect.width / 2;
      const splashCenterY = splashRect.top + splashRect.height / 2;

      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      const devicePixelRatio = window.devicePixelRatio || 1;
      const snapToDevicePixel = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;

      const translateX = snapToDevicePixel(targetCenterX - splashCenterX);
      const translateY = snapToDevicePixel(targetCenterY - splashCenterY);

      this.logoTransform = `translate(${translateX}px, ${translateY}px) scale(1)`;

      this.logoState = 'move';
    }, 1000);

    setTimeout(() => {
      this.fadeState = 'hidden';
    }, 1000);

    setTimeout(() => {
      this.textColorState = 'dark';
    }, 1100);

    setTimeout(() => {
      this.logoOpacity = 0;
      this.brandState.markSplashDone();
    }, 1700);
  }
}
