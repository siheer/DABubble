import { animate, state, style, transition, trigger } from '@angular/animations';
import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Logo } from '../aside-content/logo';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-startscreen',
  imports: [Logo, CommonModule],
  templateUrl: './startscreen.html',
  styleUrl: './startscreen.scss',
  animations: [
    trigger('logoMove', [
      state(
        'center',
        style({
          transform: 'translate(0, 0) scale(2)',
        })
      ),
      state(
        'move',
        style({
          transform: '{{ transform }}',
        }),
        { params: { transform: 'translate(0,0) scale(1)' } }
      ),
      transition('center => move', animate('700ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
    trigger('textSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50px)' }),
        animate('1200ms 300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
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
      transition('visible => hidden', animate('400ms ease-out')),
    ]),
  ],
})
export class Startscreen implements AfterViewInit {
  @ViewChild('splashWrapper', { read: ElementRef })
  splashWrapper!: ElementRef<HTMLElement>;

  @ViewChild('targetLogo', { read: ElementRef })
  targetLogo!: ElementRef<HTMLElement>;

  private router = inject(Router);

  logoState: 'center' | 'move' = 'center';
  logoTransform = '';
  showText = false;
  fadeState: 'visible' | 'hidden' = 'visible';

  ngAfterViewInit() {
    // show text
    setTimeout(() => (this.showText = true), 900);

    // moving logo
    setTimeout(() => {
      const splashRect = this.splashWrapper.nativeElement.getBoundingClientRect();
      const targetRect = this.targetLogo.nativeElement.getBoundingClientRect();

      const translateX = targetRect.left - splashRect.left;
      const translateY = targetRect.top - splashRect.top;

      this.logoTransform = `translate(${translateX}px, ${translateY}px) scale(1)`;
      this.logoState = 'move';
    }, 2000);

    // fade before end
    setTimeout(() => {
      this.fadeState = 'hidden';
    }, 2200);

    // routing while fading out
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 2000);
  }
}
