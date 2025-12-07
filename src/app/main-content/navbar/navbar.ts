import { Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { OverlayService } from '../../services/overlay.service';
import { NavbarDialog } from './navbar-dialog/navbar-dialog';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  imports: [MatFormFieldModule, MatInputModule, MatIconModule, CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);

  currentUser = this.userService.currentUser;


  openUserMenu(event: Event) {
    const target = event.currentTarget as HTMLElement;

    this.overlayService.open(NavbarDialog, {
      target,
      offsetX: -200,
      offsetY: 10,
      data: { originTarget: target },
    });
  }
}
