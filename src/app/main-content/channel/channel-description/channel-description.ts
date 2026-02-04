import { Component, ElementRef, ViewChild, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OverlayService } from '../../../services/overlay.service';
import { FormsModule } from '@angular/forms';
import { ChannelService } from '../../../services/channel.service';
import { ChannelMembershipService } from '../../../services/membership.service';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-channel-description',
  imports: [CommonModule, FormsModule],
  templateUrl: './channel-description.html',
  styleUrl: './channel-description.scss',
})
export class ChannelDescription implements OnChanges, OnInit {
  private readonly overlayService = inject(OverlayService);
  private readonly channelService = inject(ChannelService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly nonLeavableTitles = new Set(['willkommen', 'allgemeines', 'meetings']);

  @Input() channelId?: string;
  @Input() title = '';
  @Input() description = '';
  @Input() createdBy = 'Team-Admins';
  @Input() createdAt = 'Gerade eben';

  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;
  @ViewChild('descriptionInput') private descriptionInput?: ElementRef<HTMLTextAreaElement>;
  protected editableTitle = '';
  protected editableDescription = '';
  protected isEditingTitle = false;
  protected isEditingDescription = false;
  protected isSavingTitle = false;
  protected isSavingDescription = false;
  protected isLeaving = false;
  protected errorMessage = '';
  protected get canLeave(): boolean {
    return !this.nonLeavableTitles.has((this.title ?? '').trim().toLowerCase());
  }

  ngOnInit(): void {
    this.syncEditableFields();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.syncEditableFields();
  }
  protected closeOverlay(): void {
    this.overlayService.closeLast();
  }

  protected startEditTitle(): void {
    this.isEditingTitle = true;
    this.errorMessage = '';
    this.focusTitleInput();
  }

  protected startEditDescription(): void {
    this.isEditingDescription = true;
    this.errorMessage = '';
    this.focusDescriptionInput();
  }

  protected async saveTitle(): Promise<void> {
    if (!this.channelId || this.isSavingTitle) {
      return;
    }

    const trimmedTitle = this.editableTitle.trim();
    if (!trimmedTitle || trimmedTitle === this.title.trim()) {
      this.isEditingTitle = false;
      this.editableTitle = this.title;
      return;
    }

    this.isSavingTitle = true;
    this.errorMessage = '';

    try {
      await this.channelService.updateChannel(this.channelId, {
        title: trimmedTitle,
      });

      this.title = trimmedTitle;
      this.editableTitle = trimmedTitle;
      this.isEditingTitle = false;
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Channel-Namens', error);
      this.errorMessage = 'Channel-Änderungen konnten nicht gespeichert werden.';
    } finally {
      this.isSavingTitle = false;
    }
  }

  protected async saveDescription(): Promise<void> {
    if (!this.channelId || this.isSavingDescription) {
      return;
    }

    const trimmedDescription = this.editableDescription.trim();
    if (trimmedDescription === this.description.trim()) {
      this.isEditingDescription = false;
      this.editableDescription = this.description;
      return;
    }

    this.isSavingDescription = true;
    this.errorMessage = '';

    try {
      await this.channelService.updateChannel(this.channelId, {
        description: trimmedDescription,
      });

      this.description = trimmedDescription;
      this.editableDescription = trimmedDescription;
      this.isEditingDescription = false;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Channel-Beschreibung', error);
      this.errorMessage = 'Channel-Änderungen konnten nicht gespeichert werden.';
    } finally {
      this.isSavingDescription = false;
    }
  }

  protected async leaveChannel(): Promise<void> {
    if (!this.channelId || this.isLeaving || !this.canLeave) {
      return;
    }

    const currentUser = this.userService.currentUser();
    if (!currentUser?.uid) {
      this.errorMessage = 'Kein eingeloggter Nutzer gefunden.';
      return;
    }

    this.isLeaving = true;
    this.errorMessage = '';

    try {
      // Schließe Overlay sofort
      this.closeOverlay();
      
      await this.membershipService.leaveChannel(this.channelId, currentUser.uid);
      await this.router.navigate(['/main']);
    } catch (error) {
      console.error('Fehler beim Verlassen des Channels', error);
      this.errorMessage = 'Channel konnte nicht verlassen werden.';
    } finally {
      this.isLeaving = false;
    }
  }
  private syncEditableFields(): void {
    this.editableTitle = this.title ?? '';
    this.editableDescription = this.description ?? '';
  }

  private focusTitleInput(): void {
    setTimeout(() => {
      this.titleInput?.nativeElement.focus();
      this.titleInput?.nativeElement.select();
    });
  }

  private focusDescriptionInput(): void {
    setTimeout(() => {
      this.descriptionInput?.nativeElement.focus();
      this.descriptionInput?.nativeElement.select();
    });
  }
}
