import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { CreateChannel } from './create-channel/create-channel';
import { UnreadMessagesService } from '../../services/unread-messages.service';
import type { ChannelListItem, DirectMessageUser, ProfilePictureKey } from '../../types';
import { FormsModule } from '@angular/forms';
import { FilterBox } from '../filter-box/filter-box';
import { ClickOutsideDirective } from '../../classes/click-outside.class';
import { ProfilePictureService } from '../../services/profile-picture.service';

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

  protected startNewMessage(): void {
    void this.router.navigate(['/main/new-message']);
  }

  protected openCreateChannel(): void {
    this.isCreateChannelOpen = true;
  }

  protected closeCreateChannel(): void {
    this.isCreateChannelOpen = false;
  }

  protected toggleChannels(): void {
    this.areChannelsCollapsed = !this.areChannelsCollapsed;
  }

  protected selectChannel(channel: ChannelListItem): void {
    if (!channel?.id) return;
    void this.router.navigate(['/main/channels', channel.id]);
  }

  protected toggleDirectMessages(): void {
    this.areDirectMessagesCollapsed = !this.areDirectMessagesCollapsed;
  }

  protected openDirectMessage(user: DirectMessageUser): void {
    if (!user?.uid) return;
    void this.router.navigate(['/main/dms', user.uid]);
  }

  protected trackChannel(index: number, channel: ChannelListItem): string {
    return channel.id ?? `${index}`;
  }

  protected trackDirectUser(index: number, user: DirectMessageUser): string {
    return user.uid ?? `${index}`;
  }

  protected getAvatarUrl(key?: ProfilePictureKey): string {
    return this.profilePictureService.getUrl(key);
  }

  onSearchInput(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
  }

  onFocus() {
    this.isSearchFocused = true;
    this.dropdownOpen = true;
  }

  onBlur() {
    this.isSearchFocused = false;
  }

  closeDropdown() {
    this.searchTerm = '';
    this.dropdownOpen = false;
  }
}
