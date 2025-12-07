import { Component, inject } from '@angular/core';
import { OverlayService } from '../../../services/overlay.service';
import { ProfileMenu } from '../profile-menu/profile-menu';
import { AuthService } from '../../../services/auth.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar-dialog.html',
  styleUrl: './navbar-dialog.scss',
  animations: [
    trigger('slideFromRight', [
      transition('enter => leave', [animate('500ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))]),
      transition('void => enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
    ]),
  ],
})
export class NavbarDialog {
  originTarget!: HTMLElement;
  visible = true;

  constructor(
    private authService: AuthService,
    private overlayService: OverlayService
  ) {}

  openProfileDialog(event: Event) {
    this.overlayService.open(ProfileMenu, {
      target: this.originTarget,
      offsetX: -400,
      offsetY: 10,
      data: { originTarget: this.originTarget },
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
  }
}
