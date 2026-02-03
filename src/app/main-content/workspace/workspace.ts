import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { CreateChannel } from './create-channel/create-channel';
import { UnreadMessagesService } from '../../services/unread-messages.service';
import type { ChannelListItem, DirectMessageUser, ProfilePictureKey } from '../../types';
import { FormsModule } from '@angular/forms';
import { FilterBox } from '../filter-box/filter-box';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { OverlayService } from '../../services/overlay.service';
import { CreateChannelWithMembers } from './create-channel-with-members/create-channel-with-members';
import { ScreenService } from '../../services/screen.service';

/** Workspace sidebar component for channel and direct message navigation. */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, CreateChannel, FormsModule, FilterBox, ClickOutsideDirective],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  dropdownOpen = false;
  searchTerm: string = '';
  isSearchFocused = false;

  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly router = inject(Router);
  private readonly profilePictureService = inject(ProfilePictureService);
  private readonly overlayService = inject(OverlayService);
  private readonly screenService = inject(ScreenService);

  readonly activeChannelId = input<string | null>(null);
  readonly activeDmId = input<string | null>(null);

  protected readonly channelsWithUnreadCount$: Observable<ChannelListItem[]> =
    this.unreadMessagesService.channelsWithUnreadCount$;
  protected readonly directMessageUsersWithUnreadCount$: Observable<DirectMessageUser[]> =
    this.unreadMessagesService.directMessageUsersWithUnreadCount$;
  protected readonly directMessageUnreadTotalCount$: Observable<number> =
    this.unreadMessagesService.directMessageUnreadTotalCount$;
  protected readonly channelUnreadTotalCount$: Observable<number> = this.unreadMessagesService.channelUnreadTotalCount$;

  protected areChannelsCollapsed = false;
  protected areDirectMessagesCollapsed = false;
  protected isCreateChannelOpen = false;
  protected isAddChannelHovered = false;
  protected isChannelsHeaderHovered = false;
  protected isDirectMessagesHeaderHovered = false;

  /** Navigates to new message composer. */
  protected startNewMessage(): void {
    void this.router.navigate(['/main/new-message']);
  }

  /** Opens channel creation dialog. */
  protected openCreateChannel(): void {
    const isMobile = this.screenService.isTabletScreen();

    this.overlayService.open(CreateChannelWithMembers, {
      fullscreen: isMobile,
      centerX: !isMobile,
      centerY: !isMobile,
      mode: isMobile ? 'mobile' : 'desktop',
    });
  }

  /** Closes channel creation dialog. */
  protected closeCreateChannel(): void {
    this.isCreateChannelOpen = false;
  }

  /** Toggles channels section collapse state. */
  protected toggleChannels(): void {
    this.areChannelsCollapsed = !this.areChannelsCollapsed;
  }

  /** Navigates to selected channel. */
  protected selectChannel(channel: ChannelListItem): void {
    if (!channel?.id) return;
    void this.router.navigate(['/main/channels', channel.id]);
  }

  /** Toggles direct messages section collapse state. */
  protected toggleDirectMessages(): void {
    this.areDirectMessagesCollapsed = !this.areDirectMessagesCollapsed;
  }

  /** Navigates to direct message conversation with user. */
  protected openDirectMessage(user: DirectMessageUser): void {
    if (!user?.uid) return;
    void this.router.navigate(['/main/dms', user.uid]);
  }

  /** Tracks channel by ID for ngFor optimization. */
  protected trackChannel(index: number, channel: ChannelListItem): string {
    return channel.id ?? `${index}`;
  }

  /** Tracks direct message user by UID for ngFor optimization. */
  protected trackDirectUser(index: number, user: DirectMessageUser): string {
    return user.uid ?? `${index}`;
  }

  /** Gets avatar URL for profile picture key. */
  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  /** Handles search input change. */
  onSearchInput(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
  }

  /** Handles search focus. */
  onFocus() {
    this.isSearchFocused = true;
    this.dropdownOpen = true;
  }

  /** Handles search blur. */
  onBlur() {
    this.isSearchFocused = false;
  }

  /** Closes search dropdown. */
  closeDropdown() {
    this.searchTerm = '';
    this.dropdownOpen = false;
  }
}
