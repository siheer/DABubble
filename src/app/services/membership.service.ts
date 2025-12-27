import { Injectable, inject } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { UserService, AppUser } from './user.service';
import { map, switchMap, Observable, shareReplay, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class ChannelMembershipService {

  private userService = inject(UserService);
  private firestoreService = inject(FirestoreService);

  // ✅ Injection Context: FIELD INITIALIZER
  private currentUser$ = toObservable(this.userService.currentUser);

  /**
   * Emits the set of channel IDs the current user is a member of.
   * Always emits (empty set if logged out).
   */
  getAllowedChannelIds$(): Observable<Set<string>> {
    return this.currentUser$.pipe(
      switchMap((user: AppUser | null) => {
        if (!user?.uid) {
          // 🔑 EXTREM WICHTIG: IMMER emitten
          return of(new Set<string>());
        }

        return this.firestoreService.getChannelsForUser(user.uid).pipe(
          map(channels =>
            new Set(
              channels
                .map(c => c.id)
                .filter((id): id is string => typeof id === 'string')
            )
          )
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
