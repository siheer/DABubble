import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { OverlayService } from '../../../services/overlay.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { take } from 'rxjs';
import { ChannelMembershipService } from '../../../services/membership.service';
import { ProfilePictureKey } from '../../../types';
import { ProfilePictureService } from '../../../services/profile-picture.service';

type ChannelMember = {
  id: string;
  name: string;
};

type SuggestedMember = {
  id: string;
  name: string;
  avatar: string;
  subtitle?: string;
  status?: 'online' | 'offline';
  profilePictureKey: ProfilePictureKey;
};

@Component({
  selector: 'app-add-to-channel',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './add-to-channel.html',
  styleUrl: './add-to-channel.scss',
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
export class AddToChannel implements OnInit {
  private readonly overlayService = inject(OverlayService);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(ChannelMembershipService);
  private readonly profilePictureService = inject(ProfilePictureService);

  @Input() channelId?: string;
  @Input() channelTitle = 'Entwicklerteam';
  @Input() members: ChannelMember[] = [];
  @Input() mode: 'desktop' | 'mobile' = 'desktop';

  protected visible = true;
  protected searchTerm = '';
  protected showSuggestions = false;
  protected suggestedMembers: SuggestedMember[] = [];
  protected filteredMembers: SuggestedMember[] = [];
  protected selectedMembers: SuggestedMember[] = [];
  protected isSaving = false;
  protected saveError?: string;

  ngOnInit(): void {
    this.userService
      .getAllUsers()
      .pipe(take(1))
      .subscribe((users) => {
        this.suggestedMembers = users
          .filter((user) => !this.members.some((member) => member.id === user.uid))
          .map((user) => ({
            id: user.uid,
            name: user.name,
            avatar: this.profilePictureService.getUrl(user.profilePictureKey),
            profilePictureKey: user.profilePictureKey,
            subtitle: user.email ?? undefined,
            status: user.onlineStatus ? 'online' : 'offline',
          }));

        this.filteredMembers = this.filterMembers(this.searchTerm);
      });
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
    this.saveError = undefined;
  }

  protected removeSelectedMember(memberId: string): void {
    this.selectedMembers = this.selectedMembers.filter((member) => member.id !== memberId);
    this.filteredMembers = this.filterMembers(this.searchTerm);
  }

  protected confirmSuggestions(): void {
    this.showSuggestions = false;
  }
  protected onSubmit(event?: Event): void {
    event?.preventDefault();
    void this.addSelectedMembers();
  }

  protected async addSelectedMembers(): Promise<void> {
    if (!this.selectedMembers.length) return;
    if (!this.channelId) {
      this.saveError = 'Channel konnte nicht geladen werden.';
      return;
    }

    this.isSaving = true;
    this.saveError = undefined;

    try {
      await Promise.all(
        this.selectedMembers.map((member) =>
          this.membershipService.upsertChannelMember(this.channelId!, {
            id: member.id,
            name: member.name,
            profilePictureKey: member.profilePictureKey,
            subtitle: member.subtitle,
          })
        )
      );

      this.closeOverlay();
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Mitglieds', error);
      this.saveError = 'Mitglied konnte nicht hinzugefügt werden.';
    } finally {
      this.isSaving = false;
    }
  }

  private isAlreadySelected(memberId: string): boolean {
    return (
      this.selectedMembers.some((member) => member.id === memberId) ||
      this.members.some((member) => member.id === memberId)
    );
  }

  protected closeOverlay(): void {
    this.visible = false;
  }

  protected onAnimationDone(): void {
    if (!this.visible) {
      this.overlayService.closeLast();
    }
  }
}
