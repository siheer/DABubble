import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, inject } from '@angular/core';
import { SearchService } from '../../services/search.service';
import { CommonModule } from '@angular/common';
import { SearchResult } from '../../classes/search-result.class';
import { MatDialog } from '@angular/material/dialog';
import { MemberDialog } from '../member-dialog/member-dialog';
import { AppUser, UserService } from '../../services/user.service';
import { ChannelSelectionService } from '../../services/channel-selection.service';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

@Component({
  selector: 'app-filter-box',
  imports: [CommonModule],
  templateUrl: './filter-box.html',
  styleUrl: './filter-box.scss',
})
export class FilterBox implements OnInit, OnChanges {
  @Input() searchTerm: string = '';
  @Output() selectItem = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  constructor(
    private searchService: SearchService,
    private dialog: MatDialog,
    private userService: UserService,
    private channelSelectionService: ChannelSelectionService
  ) {}

  private destroyRef = inject(DestroyRef);

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
    if (!changes['searchTerm']) return;

    const term = this.searchTerm.trim();

    if (term === '@' || term === '#') {
      this.searchService.smartSearch$(term).subscribe((results) => {
        this.results = results ?? [];
      });
      return;
    }

    this.searchTerm$.next(term);
  }

  ngOnInit() {
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
      });
  }

  choose(item: SearchResult) {
    if (item.collection === 'users') {
      const user: AppUser = {
        uid: item.id,
        name: item.data.name,
        email: item.data.email ?? null,
        photoUrl: item.data.photoUrl ?? 'imgs/default-profile-picture.png',
        onlineStatus: item.data.onlineStatus ?? false,
        lastSeen: item.data.lastSeen,
        createdAt: item.data.createdAt,
        updatedAt: item.data.updatedAt,
      };

      this.dialog.open(MemberDialog, {
        data: { user },
      });

      this.close.emit();
    } else if (item.collection === 'channels') {
      this.channelSelectionService.selectChannel(item.id);
      this.selectItem.emit(item);
      this.close.emit();
    } else if (item.collection === 'messages') {
      this.channelSelectionService.selectChannel(item.channelId);
      this.selectItem.emit(item);
      this.close.emit();
    }
  }

  get users() {
    return this.results.filter((r) => r.collection === 'users');
  }

  get channels() {
    return this.results.filter((r) => r.collection === 'channels');
  }

  get messages() {
    return this.results.filter((r) => r.collection === 'messages');
  }

  get isUserSearch(): boolean {
    return this.searchTerm.startsWith('@');
  }

  get isChannelSearch(): boolean {
    return this.searchTerm.startsWith('#');
  }

  get hasResults(): boolean {
    return this.results.length > 0;
  }

  get shouldShowResults(): boolean {
    return this.searchTerm.trim().length > 0;
  }
}
