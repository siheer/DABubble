import { Injectable } from '@angular/core';
import { PROFILE_PICTURE_URLS } from '../auth/set-profile-picture/set-profile-picture';
import { ProfilePictureKey } from '../types';

@Injectable({ providedIn: 'root' })
export class ProfilePictureService {
  getUrl(key?: ProfilePictureKey): string {
    return PROFILE_PICTURE_URLS[key ?? 'default'];
  }
}
