import { PROFILE_PICTURE_URLS } from './auth/set-profile-picture/set-profile-picture';

export interface AuthenticationResult<T> {
  success: boolean;
  data?: T;
  errorMessage?: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  unmetCriteria: {
    missingLowercase?: string;
    missingUppercase?: string;
    missingNumber?: string;
    missingSpecialChar?: string;
    tooShort?: string;
    tooLong?: string;
  };
}

export interface PendingRegistrationData {
  fullName: string;
  emailAddress: string;
  password: string;
  acceptedPrivacy: boolean;
  profilePicture: ProfilePicture;
}

export type ProfilePictureKey = keyof typeof PROFILE_PICTURE_URLS;

export interface ProfilePicture {
  key: ProfilePictureKey;
  path: string;
}
