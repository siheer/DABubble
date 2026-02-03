import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ChannelService } from '../../../services/channel.service';
import { ChannelMembershipService } from '../../../services/membership.service';
import { UserService } from '../../../services/user.service';
import { ProfilePictureService } from '../../../services/profile-picture.service';
import { take } from 'rxjs';
import { ProfilePictureKey } from '../../../types';
import { OverlayRef } from '../../../classes/overlay.class';

type SuggestedMember = {
  id: string;
  name: string;
  avatar: string;
  subtitle?: string;
  status?: 'online' | 'offline';
  profilePictureKey: ProfilePictureKey;
};

@Component({
  selector: 'app-create-channel-with-members',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './create-channel-with-members.html',
  styleUrl: './create-channel-with-members.scss',
})
export class CreateChannelWithMembers implements OnInit {
  overlayRef!: OverlayRef;
  private readonly channelService = inject(ChannelService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly userService = inject(UserService);
  private readonly profilePictureService = inject(ProfilePictureService);
  private readonly router = inject(Router);

  // Channel Details
  protected title = '';
  protected description = '';
  protected isPublic = false;

  // Member Selection
  protected searchTerm = '';
  protected showSuggestions = false;
  protected suggestedMembers: SuggestedMember[] = [];
  protected filteredMembers: SuggestedMember[] = [];
  protected selectedMembers: SuggestedMember[] = [];
  protected addAllMembers = false;
  protected addSpecificMembers = false;

  // State
  protected isSubmitting = false;
  protected errorMessage: string | null = null;
  protected step: 1 | 2 = 1;

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.userService
      .getAllUsers()
      .pipe(take(1))
      .subscribe((users) => {
        const currentUserId = this.userService.currentUser()?.uid;
        this.suggestedMembers = users
          .filter((user) => user.uid !== currentUserId)
          .map((user) => ({
            id: user.uid,
            name: user.name,
            avatar: this.profilePictureService.getUrl(user.profilePictureKey),
            profilePictureKey: user.profilePictureKey,
            subtitle: user.email ?? undefined,
            status: user.onlineStatus ? 'online' : 'offline',
          }));

        this.filteredMembers = [...this.suggestedMembers];
      });
  }

  protected isAdmin(): boolean {
    return this.userService.currentUser()?.role === 'admin';
  }

  protected async onSubmitStep1(form: NgForm): Promise<void> {
    if (form.invalid) return;

    const title = this.title.trim();
    if (!title) {
      this.errorMessage = 'Bitte gib einen Channel-Namen ein.';
      return;
    }

    // Prüfe ob Channel-Name schon existiert
    const exists = await this.channelService.checkIfChannelNameExists(title);
    if (exists) {
      this.errorMessage = 'Ein Channel mit diesem Namen existiert bereits.';
      return;
    }

    this.errorMessage = null;
    this.step = 2;
  }

  protected goBackToStep1(): void {
    this.step = 1;
  }

  protected onSearchFocus(): void {
    this.showSuggestions = true;
    this.filteredMembers = this.filterMembers(this.searchTerm);
  }

  protected onSearch(term: string): void {
    this.searchTerm = term;
    this.filteredMembers = this.filterMembers(term);
  }

  protected filterMembers(term: string): SuggestedMember[] {
    const search = term.trim().toLowerCase();

    if (!search) {
      return this.suggestedMembers.filter((member) => !this.isAlreadySelected(member.id));
    }

    return this.suggestedMembers.filter(
      (member) => member.name.toLowerCase().includes(search) && !this.isAlreadySelected(member.id)
    );
  }

  protected selectMember(member: SuggestedMember): void {
    if (this.isAlreadySelected(member.id)) return;

    this.selectedMembers = [...this.selectedMembers, member];
    this.searchTerm = '';
    this.showSuggestions = true;
    this.filteredMembers = this.filterMembers('');
  }

  protected removeSelectedMember(memberId: string): void {
    this.selectedMembers = this.selectedMembers.filter((member) => member.id !== memberId);
    this.filteredMembers = this.filterMembers(this.searchTerm);
  }

  protected confirmSuggestions(): void {
    this.showSuggestions = false;
  }

  protected onToggleAllMembers(): void {
    if (this.addAllMembers) {
      this.addSpecificMembers = false;
      this.clearMemberSelection();
    }
  }

  protected onToggleSpecificMembers(): void {
    if (this.addSpecificMembers) {
      this.addAllMembers = false;
      this.filteredMembers = this.filterMembers(this.searchTerm);
    } else {
      this.clearMemberSelection();
    }
  }

  protected canCreateChannel(): boolean {
    if (this.isSubmitting) return false;

    if (this.addAllMembers) return true;

    return this.addSpecificMembers && this.selectedMembers.length > 0;
  }

  protected async createChannel(): Promise<void> {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      const title = this.title.trim();
      const description = this.description.trim();

      // Erstelle Channel
      const channelId = await this.channelService.createChannel(title, description, this.isAdmin() && this.isPublic);

      // Füge aktuellen User hinzu
      const currentUser = this.userService.currentUser();
      if (currentUser) {
        await this.membershipService.upsertChannelMember(channelId, {
          id: currentUser.uid,
          name: currentUser.name,
          profilePictureKey: currentUser.profilePictureKey,
          subtitle: currentUser.email ?? undefined,
        });
      }

      const membersToAdd = this.addAllMembers ? this.suggestedMembers : this.selectedMembers;

      if (membersToAdd.length) {
        await Promise.all(
          membersToAdd.map((member) =>
            this.membershipService.upsertChannelMember(channelId, {
              id: member.id,
              name: member.name,
              profilePictureKey: member.profilePictureKey,
              subtitle: member.subtitle,
            })
          )
        );
      }

      // Navigiere zum neuen Channel
      this.overlayRef.startCloseAnimation();

      queueMicrotask(() => {
        this.router.navigate(['/main/channels', channelId]);
      });
    } catch (error: any) {
      console.error('Fehler beim Erstellen des Channels:', error);
      this.errorMessage = error?.message || 'Fehler beim Erstellen des Channels.';
      this.isSubmitting = false;
    }
  }

  private isAlreadySelected(memberId: string): boolean {
    return this.selectedMembers.some((member) => member.id === memberId);
  }

  private clearMemberSelection(): void {
    this.searchTerm = '';
    this.showSuggestions = false;
    this.selectedMembers = [];
    this.filteredMembers = this.filterMembers('');
  }

  protected cancel(): void {
    this.overlayRef.startCloseAnimation();
  }
}
