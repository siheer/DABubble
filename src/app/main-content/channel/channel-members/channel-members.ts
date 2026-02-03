import { Component, DestroyRef, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { AddToChannel } from '../add-to-channel/add-to-channel';
import { MatDialog, matDialogAnimations } from '@angular/material/dialog';
import { AppUser, UserService } from '../../../services/user.service';
import { MemberDialog } from '../../member-dialog/member-dialog';
import { ChannelMemberView, ProfilePictureKey } from '../../../types';
import { ProfilePictureService } from '../../../services/profile-picture.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-channel-members',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './channel-members.html',
  styleUrls: ['./channel-members.scss'], // <-- plural
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px) scale(0.96)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'translateY(-4px) scale(0.96)' })),
      ]),
    ]),
  ],
})
export class ChannelMembers {
  private readonly overlayService = inject(OverlayService);
  private readonly dialog = inject(MatDialog);
  private readonly profilePictureService = inject(ProfilePictureService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private allUsersSnapshot: AppUser[] = [];

  @Input() members: ChannelMemberView[] = [];
  @Input() overlayTitle  = 'Mitglieder';
  @Input() channelId?: string;
  @Input() channelTitle?: string;
  @Input() mode: 'desktop' | 'mobile' = 'desktop';

  @Input() originTarget?: HTMLElement;
  protected visible = true;

  constructor() {
    this.userService
      .getAllUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => (this.allUsersSnapshot = users));
  }

  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  protected closeOverlay(): void {
    this.visible = false;
  }

  protected onAnimationDone(): void {
    if (!this.visible) {
      this.overlayService.closeLast();
    }
  }

  protected openAddToChannel(event: Event): void {
    const overlayRef = this.overlayService.getLastOverlay();
    if (!overlayRef || !this.originTarget) return;

    const isMobile = this.mode === 'mobile';

    overlayRef.replaceComponent(AddToChannel, {
      target: this.originTarget,
      offsetY: 8,

      centerX: isMobile,

      offsetX: isMobile ? -285 : -285,

      mode: isMobile ? 'mobile' : 'desktop',
      data: {
        channelId: this.channelId,
        members: this.members,
        channelTitle: this.channelTitle,
      },
    });
  }

  protected openMemberProfile(member: ChannelMemberView): void {
    const resolvedUser = this.allUsersSnapshot.find((user) => user.uid === member.id);
    const fallbackUser: AppUser = resolvedUser ?? {
      uid: member.id,
      name: member.name,
      email: null,
      profilePictureKey: member.profilePictureKey,
      onlineStatus: false,
      lastSeen: undefined,
      updatedAt: undefined,
      createdAt: undefined,
    };

    this.dialog.open(MemberDialog, {
      data: { user: fallbackUser },
    });
  }

  protected isCurrentUser(member: ChannelMemberView): boolean {
    const currentUserId = this.userService.currentUser()?.uid;
    return Boolean(currentUserId && member.id === currentUserId);
  }
}
