import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { UserService } from '../../../services/user.service';
import { FormsModule } from '@angular/forms';
import { AvatarOverlay } from '../avatar-overlay/avatar-overlay';
import { ProfilePictureService } from '../../../services/profile-picture.service';
import { ProfilePictureKey } from '../../../types';

@Component({
  selector: 'app-profile-menu-edit',
  standalone: true,
  imports: [MatIcon, CommonModule, FormsModule],
  templateUrl: './profile-menu-edit.html',
  styleUrl: './profile-menu-edit.scss',
  animations: [
    trigger('scaleAnimation', [
      transition(':leave', [animate('250ms ease-in', style({ transform: 'scale(0.8)', opacity: 0 }))]),
    ]),
  ],
})
export class ProfileMenuEdit {
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);
  readonly profilePictureService = inject(ProfilePictureService);

  @Output() closed = new EventEmitter<void>();

  newName: string = '';
  currentUser = this.userService.currentUser;
  visible = true;
  overlayRef!: any;

  onAnimationDone(event: any) {
    if (!this.visible) {
      this.closed.emit();
    }
  }

  closeOverlay() {
    this.overlayRef.startCloseAnimation();
  }

  updateName() {
    const trimmed = this.newName.trim();
    if (!trimmed) return;

    this.userService
      .updateUser({ name: trimmed })
      .then(() => {
        console.log('Name aktualisiert');
        this.closeOverlay();
      })
      .catch((err) => console.error(err));
  }

  get canEditName(): boolean {
    const user = this.currentUser();
    return !!user && !!user.email;
  }

  openAvatarOverlay() {
    const overlayRef = this.overlayService.getLastOverlay();
    if (!overlayRef) return;
    overlayRef.replaceComponent(AvatarOverlay, {
      target: this.overlayRef.target,
    });
  }
}
