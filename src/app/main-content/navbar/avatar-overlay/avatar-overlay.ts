import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit } from '@angular/core';
import { SetProfilePicture } from '../../../auth/set-profile-picture/set-profile-picture';
import { UserService } from '../../../services/user.service';
import { ProfilePictureKey } from '../../../types';
import { OverlayService } from '../../../services/overlay.service';

@Component({
  selector: 'app-avatar-overlay',
  standalone: true,
  imports: [CommonModule, SetProfilePicture],
  templateUrl: './avatar-overlay.html',
  styleUrl: './avatar-overlay.scss',
})
export class AvatarOverlay implements OnInit {
  private userService = inject(UserService);
  private overlayService = inject(OverlayService);
  @Input() selectedProfilePictureKey: ProfilePictureKey = 'default';

  currentKey: ProfilePictureKey = this.selectedProfilePictureKey;

  selectedKey!: ProfilePictureKey;

  saving = false;

  get displayName(): string {
    return this.userService.currentUser()?.name ?? 'Gast';
  }

  ngOnInit(): void {
    this.selectedKey = this.selectedProfilePictureKey;
  }

  onSelect(key: ProfilePictureKey) {
    this.selectedKey = key;
  }

  save(): void {
    this.saving = true;

    this.userService.updateUser({ profilePictureKey: this.selectedKey }).finally(() => {
      this.saving = false;
      this.close();
    });
  }

  close(): void {
    this.overlayService.closeLast();
  }
}
