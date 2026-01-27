import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { ProfileMenuEdit } from '../profile-menu-edit/profile-menu-edit';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { UserService } from '../../../services/user.service';
import { ProfilePictureKey } from '../../../types';
import { ProfilePictureService } from '../../../services/profile-picture.service';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [MatIcon, CommonModule],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
  animations: [
    trigger('scaleAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.7)', opacity: 0 }),
        animate('350ms ease-out', style({ transform: 'scale(1)', opacity: 1 })),
      ]),
      transition(':leave', [animate('250ms ease-in', style({ transform: 'scale(0.8)', opacity: 0 }))]),
    ]),
  ],
})
export class ProfileMenu {
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);
  private readonly profilePictureService = inject(ProfilePictureService);
  @Output() closed = new EventEmitter<void>();

  protected getAvatarUrl(key?: ProfilePictureKey): string {
  return this.profilePictureService.getUrl(key);
}

  currentUser = this.userService.currentUser;

  originTarget!: HTMLElement;
  visible = true;
  overlayRef!: any;
  isEditActive = false;

  onAnimationDone(event: any) {
    if (!this.visible) {
      this.closed.emit();
    }
  }

  editProfile() {
    const overlayRef = this.overlayService.getLastOverlay();
    if (!overlayRef) return;
    overlayRef.replaceComponent(ProfileMenuEdit, {
      target: this.originTarget,
    });
  }

  closeOverlay() {
    this.overlayRef.startCloseAnimation();
  }
}
