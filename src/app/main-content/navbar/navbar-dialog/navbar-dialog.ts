import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { OverlayService } from '../../../services/overlay.service';
import { ProfileMenu } from '../profile-menu/profile-menu';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { BrandStateService } from '../../../services/brand-state.service';
import { RouterModule } from '@angular/router';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-navbar-dialog',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
  overlayRef!: any;
  originTarget!: HTMLElement;
  visible = true;
  mode: 'desktop' | 'mobile' = 'desktop';
  isSigningOut = false;
  isBackground = false;

  @Output() closed = new EventEmitter<void>();

  @ViewChild('profileBtn', { read: ElementRef })
  profileBtn!: ElementRef<HTMLElement>;
  activeItem: 'profile' | 'logout' | null = null;

  constructor(
    private userService: UserService,
    private overlayService: OverlayService,
    public brandState: BrandStateService
  ) {}

  ngAfterViewInit() {
    this.originTarget = this.profileBtn.nativeElement;
  }

  ngOnInit() {
    this.overlayService.registerOnAnyOverlayClosed(() => {
      this.activeItem = null;
      this.isBackground = false;
    });
  }

  openProfileDialog() {
    this.activeItem = 'profile';
    this.isBackground = true;

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
      offsetY: -58,
      data: { originTarget: this.originTarget },
    });
  }

  openProfileMobile() {
    this.overlayService.open(ProfileMenu, {
      target: this.originTarget,
      centerX: true,
      offsetY: -700,
    });
  }

  startCloseAnimation() {
    this.overlayRef.startCloseAnimation();
  }

  onAnimationDone(event: any) {
    if (!this.visible) {
      this.closed.emit();
    }
  }

  async logOut() {
    if (this.isSigningOut) return;
    this.isSigningOut = true;

    try {
      await this.userService.logout();
      this.startCloseAnimation();
      this.brandState.resetSplash();
    } finally {
      this.isSigningOut = false;
    }
  }
}
