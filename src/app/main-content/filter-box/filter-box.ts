import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, inject } from '@angular/core';
import { SearchService } from '../../services/search.service';
import { CommonModule } from '@angular/common';
import { ChannelSearchResult, MessageSearchResult, SearchResult, UserSearchResult } from '../../types';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';
import { AppUser, UserService } from '../../services/user.service';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-filter-box',
  imports: [CommonModule],
  templateUrl: './filter-box.html',
  styleUrl: './filter-box.scss',
})
export class FilterBox implements OnInit, OnChanges {
  @Input() searchTerm: string = '';
  @Input() isFocused = false;
  @Output() selectItem = new EventEmitter<SearchResult>();
  @Output() close = new EventEmitter<void>();

  constructor(
    private searchService: SearchService,
    private dialog: MatDialog,
    public userService: UserService,
    private router: Router
  ) {}

  private destroyRef = inject(DestroyRef);

  private usersById = new Map<string, AppUser>();

  private emptyStateTimer?: number;
  showEmptyState = false;

  containerVisible = false;
  private containerTimer?: number;

  get currentUserUid(): string | null {
    return this.userService.currentUser()?.uid ?? null;
  }

  /**
   * Returns the list of users sorted alphabetically by name,
   * with the current user at the top of the list.
   * Getter is used to ensure re-evaluation on each access.
   * */
  get sortedUsers() {
    if (!this.users.length) return [];

    const usersCopy = [...this.users];
    usersCopy.sort((a, b) => a.data.name.localeCompare(b.data.name));

    const currentUid = this.currentUserUid;
    const currentIndex = usersCopy.findIndex((u) => u.id === currentUid);

    if (currentIndex > -1) {
      const currentUser = { ...usersCopy.splice(currentIndex, 1)[0] };
      currentUser.data = { ...currentUser.data, name: currentUser.data.name + ' (Du)' };
      usersCopy.unshift(currentUser);
    }

    return usersCopy;
  }
  private searchTerm$ = new Subject<string>();
  results: SearchResult[] = [];

  ngOnChanges(changes: SimpleChanges) {
    const term = this.searchTerm.trim();

    if (!term) {
      this.results = [];
      this.showEmptyState = false;
      clearTimeout(this.emptyStateTimer);
      return;
    }

    if (changes['isFocused'] && !this.isFocused) {
      this.showEmptyState = false;
      return;
    }

    if (!this.isFocused) return;

    if (this.isGuidance) return;

    this.searchTerm$.next(term);
  }

  ngOnInit() {
    this.userService
      .getAllUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => {
        this.usersById = new Map(users.map((u) => [u.uid, u]));
      });

    this.searchTerm$
      .pipe(
        debounceTime(200),
        switchMap((term) => {
          return this.searchService.smartSearch$(term);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.results = results ?? [];

        this.handleEmptyState(this.searchTerm.trim());
      });
  }

  choose(item: SearchResult) {
    if (item.collection === 'users') {
      this.dialog.open(MemberDialog, {
        data: { user: item.data },
      });

      this.close.emit();
    } else if (item.collection === 'channels') {
      void this.router.navigate(['/main/channels', item.id]);
      this.selectItem.emit(item);
      this.close.emit();
    } else if (item.collection === 'messages') {
      if (item.isThread) {
        void this.router.navigate(['/main/channels', item.channelId, 'threads', item.parentMessageId]);
      } else {
        void this.router.navigate(['/main/channels', item.channelId], { queryParams: { highlight: item.id } });
      }
      this.selectItem.emit(item);
      this.close.emit();
    }
  }

  get users(): UserSearchResult[] {
    return this.results.filter((r) => r.collection === 'users') as UserSearchResult[];
  }

  get channels(): ChannelSearchResult[] {
    return this.results.filter((r) => r.collection === 'channels') as ChannelSearchResult[];
  }

  get messages(): MessageSearchResult[] {
    return this.results.filter((r) => r.collection === 'messages') as MessageSearchResult[];
  }

  get isUserSearch(): boolean {
    return this.searchTerm.startsWith('@');
  }

  get isChannelSearch(): boolean {
    return this.searchTerm.startsWith('#');
  }

  get isGuidance(): boolean {
    return this.isFocused && this.searchTerm.trim().length === 0;
  }

  get hasRenderableContent(): boolean {
    return this.isGuidance || this.results.length > 0 || this.showEmptyState;
  }

  getAuthor(message: Extract<SearchResult, { collection: 'messages' }>): AppUser | undefined {
    return this.usersById.get(message.data.authorId);
  }

  private handleEmptyState(term: string) {
    clearTimeout(this.emptyStateTimer);
    this.showEmptyState = false;

    if (!term || this.results.length > 0) return;

    this.emptyStateTimer = window.setTimeout(() => {
      this.showEmptyState = true;
    }, 400);
  }

  getProfileUrl(user: Extract<SearchResult, { collection: 'users' }>): string {
    return this.userService.getProfilePictureUrl(user.data);
  }
}
