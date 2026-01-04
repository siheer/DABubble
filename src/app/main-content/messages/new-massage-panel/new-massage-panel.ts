import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { Channel, FirestoreService } from '../../../services/firestore.service';
import { AppUser, UserService } from '../../../services/user.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MobileRouteAnimationDirective } from '../../../directives/mobile-route-animation.directive';

type SearchResult = {
  channels: Channel[];
  users: Array<AppUser & { displayName: string; isCurrentUser: boolean }>;
  hasQuery: boolean;
};

@Component({
  selector: 'app-new-message-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  hostDirectives: [MobileRouteAnimationDirective],
  templateUrl: './new-massage-panel.html',
  styleUrl: './new-massage-panel.scss',
})
export class NewMessagePanel {
  private readonly firestoreService = inject(FirestoreService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  @Output() readonly close = new EventEmitter<void>();

  private readonly currentUser$ = toObservable(this.userService.currentUser);
  private readonly searchTermSubject = new BehaviorSubject<string>('');
  protected readonly searchTerm$ = this.searchTermSubject.asObservable();
  protected searchTerm = '';

  private readonly channels$: Observable<Channel[]> = this.currentUser$.pipe(
    switchMap((user) => (user ? this.firestoreService.getChannelsForUser(user.uid) : of([])))
  );

  private readonly users$ = this.userService.getAllUsers();

  protected readonly searchResults$: Observable<SearchResult> = combineLatest([
    this.searchTerm$,
    this.channels$,
    this.users$,
    this.currentUser$,
  ]).pipe(
    map(([term, channels, users, currentUser]) => {
      const normalizedTerm = term.trim().toLowerCase();
      const hasQuery = normalizedTerm.length > 0;
      const matchesTerm = (value: string | null | undefined): boolean => {
        if (!normalizedTerm) return true;

        return value?.toLowerCase().includes(normalizedTerm) ?? false;
      };

      const filteredChannels = channels
        .filter((channel) => matchesTerm(channel.title))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

      const filteredUsers = users
        .map((user) => ({
          ...user,
          displayName: currentUser && user.uid === currentUser.uid ? `${user.name} (Du)` : user.name,
          isCurrentUser: currentUser ? user.uid === currentUser.uid : false,
        }))
        .filter((user) => matchesTerm(user.name) || matchesTerm(user.email || ''))
        .sort((a, b) => {
          if (a.isCurrentUser) return -1;
          if (b.isCurrentUser) return 1;
          return a.name.localeCompare(b.name);
        });

      return { channels: filteredChannels, users: filteredUsers, hasQuery };
    })
  );

  protected updateSearch(term: string): void {
    this.searchTerm = term;
    this.searchTermSubject.next(term);
  }

  protected selectChannel(channel: Channel): void {
    if (!channel.id) return;
    void this.router.navigate(['/main/channels', channel.id]);
    this.close.emit();
  }

  protected startDirectMessage(user: AppUser): void {
    if (!user?.uid) return;
    void this.router.navigate(['/main/dms', user.uid]);
    this.close.emit();
  }

  protected closePanel(): void {
    this.close.emit();
    void this.router.navigate(['/main']);
  }
}
