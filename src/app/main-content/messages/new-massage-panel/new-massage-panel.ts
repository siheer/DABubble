import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, map, of, switchMap } from 'rxjs';
import { Channel, FirestoreService } from '../../../services/firestore.service';
import { ChannelSelectionService } from '../../../services/channel-selection.service';
import { DirectMessageSelectionService } from '../../../services/direct-message-selection.service';
import { AppUser, UserService } from '../../../services/user.service';
import { toObservable } from '@angular/core/rxjs-interop';

type SuggestionSet = {
  term: string;
  channels: Channel[];
  users: AppUser[];
  mode: 'channel' | 'user' | 'none';
};

@Component({
  selector: 'app-new-message-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-massage-panel.html',
  styleUrl: './new-massage-panel.scss',
})
export class NewMessagePanel {
  private readonly firestoreService = inject(FirestoreService);
  private readonly channelSelectionService = inject(ChannelSelectionService);
  private readonly directMessageSelectionService = inject(
    DirectMessageSelectionService
  );
  private readonly userService = inject(UserService);
  private readonly searchTermSubject = new BehaviorSubject<string>('');
  protected readonly searchTerm$ = this.searchTermSubject.asObservable();
  protected readonly currentUser$ = toObservable(this.userService.currentUser);
  private readonly channels$ = this.currentUser$.pipe(
    switchMap((user) =>
      user ? this.firestoreService.getChannelsForUser(user.uid) : of([])
    )
  );
  private readonly users$ = this.userService.getAllUsers();
  protected readonly suggestions$ = combineLatest([
    this.searchTerm$,
    this.channels$,
    this.users$,
  ]).pipe(
    map(([term, channels, users]) =>
      this.buildSuggestions(term, channels, users)
    )
  );

  @Output() readonly close = new EventEmitter<void>();

  protected onSearchChange(term: string): void {
    this.searchTermSubject.next(term);
  }

  protected hasResults(suggestions: SuggestionSet): boolean {
    return suggestions.channels.length > 0 || suggestions.users.length > 0;
  }

  protected openChannel(channel: Channel | undefined): void {
    if (!channel?.id) return;

    this.channelSelectionService.selectChannel(channel.id);
    this.directMessageSelectionService.selectUser(null);
    this.close.emit();
  }

  protected openDirectMessage(user: AppUser): void {
    this.directMessageSelectionService.selectUser(user);
    this.channelSelectionService.selectChannel(null);
    this.close.emit();
  }

  private buildSuggestions(
    term: string,
    channels: Channel[],
    users: AppUser[]
  ): SuggestionSet {
    const trimmed = term.trim();

    if (!trimmed) {
      return { term: '', channels: [], users: [], mode: 'none' };
    }

    if (trimmed.startsWith('#')) {
      const query = trimmed.slice(1).toLowerCase();
      const filteredChannels = channels.filter((channel) => {
        const title = (channel.title ?? 'Unbenannter Channel').toLowerCase();

        return title.includes(query);
      });

      return { term: trimmed, channels: filteredChannels, users: [], mode: 'channel' };
    }

    const normalized = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    const lookup = normalized.toLowerCase();
    const filteredUsers = users.filter((user) => {
      const name = user.name?.toLowerCase?.() ?? '';
      const email = (user.email ?? '').toLowerCase();

      return name.includes(lookup) || email.includes(lookup);
    });

    return { term: trimmed, channels: [], users: filteredUsers, mode: 'user' };
  }
}