import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { CreateChannel } from './create-channel/create-channel';

import { Channel, FirestoreService } from '../../services/firestore.service';
import { ChannelSelectionService } from '../../services/channel-selection.service';
import { AppUser, UserService } from '../../services/user.service';
import { DirectMessageSelectionService } from '../../services/direct-message-selection.service';
import { toObservable } from '@angular/core/rxjs-interop';

type DirectMessageUser = AppUser & { displayName: string };

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, CreateChannel],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  private readonly firestoreService = inject(FirestoreService);
  private readonly userService = inject(UserService);
  private readonly channelSelectionService = inject(ChannelSelectionService);
  private readonly directMessageSelectionService = inject(
    DirectMessageSelectionService
  );
  private readonly currentUser$ = toObservable(this.userService.currentUser);
  @Output() readonly newMessage = new EventEmitter<void>();
  @Output() readonly channelSelected = new EventEmitter<void>();
  protected readonly channels$: Observable<Channel[]> = this.currentUser$.pipe(
    switchMap((user) =>
      user ? this.firestoreService.getChannelsForUser(user.uid) : of([])
    )
  );
  protected readonly directMessageUsers$: Observable<DirectMessageUser[]> =
    combineLatest([this.userService.getAllUsers(), this.currentUser$]).pipe(
      map(([users, currentUser]) => {
        const enhancedUsers = users.map((user) => ({
          ...user,
          displayName:
            currentUser && user.uid === currentUser.uid
              ? `${user.name} (Du)`
              : user.name,
        }));

        enhancedUsers.sort((a, b) => {
          if (currentUser) {
            if (a.uid === currentUser.uid) return -1;
            if (b.uid === currentUser.uid) return 1;
          }

          return a.name.localeCompare(b.name);
        });

        return enhancedUsers;
      })
    );
  protected readonly selectedChannelId$ =
    this.channelSelectionService.selectedChannelId$;
  protected readonly selectedDirectMessageUser$ =
    this.directMessageSelectionService.selectedUser$;
  protected areChannelsCollapsed = false;
  protected areDirectMessagesCollapsed = false;
  protected isCreateChannelOpen = false;
  protected isAddChannelHovered = false;
  protected isChannelsHeaderHovered = false;
  protected isDirectMessagesHeaderHovered = false;
  protected startNewMessage(): void {
    this.newMessage.emit();
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

  protected selectChannel(channelId?: string | null): void {
    this.channelSelectionService.selectChannel(channelId);
    this.directMessageSelectionService.selectUser(null);
    this.channelSelected.emit();
  }

  protected toggleDirectMessages(): void {
    this.areDirectMessagesCollapsed = !this.areDirectMessagesCollapsed;
  }

  protected openDirectMessage(user: AppUser): void {
    this.directMessageSelectionService.selectUser(user);
  }


}