import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppUser } from './user.service';

@Injectable({ providedIn: 'root' })
export class DirectMessageSelectionService {
  private readonly selectedUserSubject = new BehaviorSubject<AppUser | null>(null);
  readonly selectedUser$ = this.selectedUserSubject.asObservable();

  selectUser(user: AppUser | null): void {
    if (user && this.selectedUserSubject.value?.uid === user.uid) {
      return;
    }

    this.selectedUserSubject.next(user);
  }
}