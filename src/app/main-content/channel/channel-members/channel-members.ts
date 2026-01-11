import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { AddToChannel } from '../add-to-channel/add-to-channel';
import { MatDialog, matDialogAnimations } from '@angular/material/dialog';
import { AppUser } from '../../../services/user.service';
import { MemberDialog } from '../../member-dialog/member-dialog';
import { ChannelMemberView } from '../../../types';

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

  @Input() members: ChannelMemberView[] = [];
  @Input() title = 'Mitglieder';
  @Input() channelId?: string;

  originTarget!: HTMLElement;
  protected visible = true;

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
    if (!overlayRef) return;
    overlayRef.replaceComponent(AddToChannel, {
      target: this.originTarget,
      offsetX: -370,
      offsetY: 8,
    });
  }

  protected openMemberProfile(member: ChannelMemberView): void {
    if (member.isCurrentUser) {
      return;
    }

    const fallbackUser: AppUser = member.user ?? {
      uid: member.id,
      name: member.name,
      email: null,
      profilePictureKey: undefined,
      onlineStatus: false,
      lastSeen: undefined,
      updatedAt: undefined,
      createdAt: undefined,
    };

    this.dialog.open(MemberDialog, {
      data: { user: fallbackUser },
    });
  }
}
