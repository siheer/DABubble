import { Component, computed, Input, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfilePicture, ProfilePictureKey } from '../../types';

export const PROFILE_PICTURE_URLS = {
  default: 'imgs/default-profile-picture.png',
  female1: 'imgs/f1.png',
  male1: 'imgs/m1.png',
  male4: 'imgs/m4.png',
  male3: 'imgs/m3.png',
  female2: 'imgs/f2.png',
  male2: 'imgs/m2.png',
} as const;

@Component({
  selector: 'app-set-profile-picture',
  imports: [CommonModule],
  templateUrl: './set-profile-picture.html',
  styleUrls: ['./set-profile-picture.scss'],
})
export class SetProfilePicture {
  @Input() variant: 'auth' | 'overlay' = 'auth';
  readonly displayName = input.required<string>();
  readonly selectedProfilePictureKey = input<ProfilePictureKey>('default');
  readonly actionLabel = input<string>('Speichern');
  readonly isActionDisabled = input<boolean>(false);

  readonly profilePictureOptions: ProfilePicture[] = Object.entries(PROFILE_PICTURE_URLS).map(([key, path]) => ({
    key: key as ProfilePictureKey,
    path,
  }));

  readonly selectedProfilePicture = computed<ProfilePicture>(() => {
    const key = this.selectedProfilePictureKey();
    return {
      key,
      path: PROFILE_PICTURE_URLS[key],
    };
  });

  readonly profilePictureChange = output<ProfilePictureKey>();
  readonly back = output<void>();
  readonly action = output<void>();

  selectProfilePicture(key: ProfilePictureKey): void {
    this.profilePictureChange.emit(key);
  }

  isSelected(key: ProfilePictureKey): boolean {
    return this.selectedProfilePictureKey() === key;
  }

  onBackClick(): void {
    this.back.emit();
  }

  onActionClick(): void {
    if (this.isActionDisabled()) {
      return;
    }
    this.action.emit();
  }
}
