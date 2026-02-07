import { Component, inject, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppUser } from '../../services/user.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { ProfilePictureKey } from '../../types';
import { ProfilePictureService } from '../../services/profile-picture.service';

export interface MemberDialogData {
  user: AppUser;
}

@Component({
  selector: 'app-member-dialog',
  imports: [CommonModule],
  templateUrl: './member-dialog.html',
  styleUrl: './member-dialog.scss',
  animations: [
    trigger('dialogAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.85)' }),
        animate('250ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('180ms cubic-bezier(0.4, 0, 1, 1)', style({ opacity: 0, transform: 'scale(0.85)' })),
      ]),
    ]),
  ],
})
export class MemberDialog {
  private readonly profilePictureService = inject(ProfilePictureService);

  constructor(
    public dialogRef: MatDialogRef<MemberDialog>,
    @Inject(MAT_DIALOG_DATA) public data: MemberDialogData,
    private router: Router
  ) {}

  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  close() {
    this.dialogRef.close();
  }

  openDirectMessage() {
    if (!this.data.user?.uid) {
      this.dialogRef.close();
      return;
    }

    void this.router.navigate(['/main/dms', this.data.user.uid]).then(() => this.dialogRef.close());
  }
}
