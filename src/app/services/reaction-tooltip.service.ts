import { Injectable, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ReactionTooltipComponent } from '../main-content/tooltip/tooltip';
import { UserService } from './user.service';
import type { AppUser } from './user.service';

@Injectable({ providedIn: 'root' })
export class ReactionTooltipService {
  private readonly overlay = inject(Overlay);
  private readonly userService = inject(UserService);

  private overlayRef?: OverlayRef;
  private allUsersSnapshot: AppUser[] = [];

  constructor() {
    this.userService.getAllUsers().subscribe((users) => {
      this.allUsersSnapshot = users;
    });
  }

  show(event: MouseEvent, emoji: string, userIds: string[]): void {
    const currentUser = this.userService.currentUser();
    if (!currentUser) return;

    const currentUserId = currentUser.uid;
    const isCurrentUserIncluded = userIds.includes(currentUserId);

    const names = userIds
      .filter((uid) => uid !== currentUserId)
      .map((uid) => this.allUsersSnapshot.find((u) => u.uid === uid)?.name)
      .filter(Boolean) as string[];

    this.hide();

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(event.target as HTMLElement)
      .withPositions([
        {
          originX: 'center',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom',
          offsetX: 75,
        },
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });

    const portal = new ComponentPortal(ReactionTooltipComponent);
    const tooltipRef = this.overlayRef.attach(portal);

    const { users, verbText } = this.buildReactionTooltipData(names, isCurrentUserIncluded);

    tooltipRef.instance.emoji = emoji;
    tooltipRef.instance.users = users;
    tooltipRef.instance.verbText = verbText;
  }

  hide(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  private buildReactionTooltipData(
    names: string[],
    isCurrentUserIncluded: boolean
  ): { users: string[]; verbText: string } {
    let users = isCurrentUserIncluded ? ['Du', ...names] : [...names];
    users = this.moveDuToEnd(users);

    if (users.length === 1 && users[0] === 'Du') {
      return { users, verbText: 'hast reagiert' };
    }

    if (users.length === 1) {
      return { users, verbText: 'hat reagiert' };
    }

    return { users, verbText: 'haben reagiert' };
  }

  private moveDuToEnd(users: string[]): string[] {
    const withoutDu = users.filter((u) => u !== 'Du');
    return users.includes('Du') ? [...withoutDu, 'Du'] : users;
  }
}
