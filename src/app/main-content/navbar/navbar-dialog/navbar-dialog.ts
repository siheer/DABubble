import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { OverlayService } from '../../../services/overlay.service';
import { ProfileMenu } from '../profile-menu/profile-menu';
import { AuthService } from '../../../services/auth.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { BrandStateService } from '../../../services/brand-state.service';

@Component({
  selector: 'app-navbar-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar-dialog.html',
  styleUrl: './navbar-dialog.scss',
  animations: [
    trigger('slide', [
      transition('void => desktop', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition('desktop => void', [animate('300ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))]),

      transition('void => mobile', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('250ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
      transition('mobile => void', [animate('250ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))]),
    ]),
  ],
})
export class NavbarDialog {
  originTarget!: HTMLElement;
  visible = true;
  mode: 'desktop' | 'mobile' = 'desktop';

  @ViewChild('profileBtn', { read: ElementRef })
  profileBtn!: ElementRef<HTMLElement>;
  activeItem: 'profile' | 'logout' | null = null;

  constructor(
    private authService: AuthService,
    private overlayService: OverlayService,
    public brandState: BrandStateService
  ) {}

  ngAfterViewInit() {
    this.originTarget = this.profileBtn.nativeElement;
  }

  ngOnInit() {
    this.overlayService.registerOnAnyOverlayClosed(() => {
      this.activeItem = null;
    });
  }

  openProfileDialog() {
    this.activeItem = 'profile';

    if (this.mode === 'desktop') {
      this.openProfileDesktop();
    } else {
      this.openProfileMobile();
    }
  }

  openProfileDesktop() {
    this.overlayService.open(ProfileMenu, {
      target: this.originTarget,
      offsetX: -225,
      offsetY: -72,
      data: { originTarget: this.originTarget },
    });
  }

  openProfileMobile() {
    this.overlayService.open(ProfileMenu, {
      target: this.originTarget,
      offsetX: -5,
      offsetY: -535,
    });
  }

  startCloseAnimation() {
    this.visible = false;
  }

  onAnimationDone(event: any) {
    if (!this.visible) {
      this.overlayService.closeLast();
    }
  }

  logOut() {
    this.authService.signOut();
    console.log('User logged out');
    this.startCloseAnimation();
    this.brandState.resetSplash();
  }
}
