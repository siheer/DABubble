import { Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { OverlayService } from '../../services/overlay.service';
import { NavbarDialog } from './navbar-dialog/navbar-dialog';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { FilterBox } from '../filter-box/filter-box';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-navbar',
  imports: [MatFormFieldModule, MatInputModule, MatIconModule, CommonModule, FilterBox, FormsModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss'],
})
export class Navbar {
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);

  dropdownOpen = false;
  searchTerm: string = '';

  currentUser = this.userService.currentUser;

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm = value;

    this.dropdownOpen = value.trim().length > 0;
  }

  onSelect(item: any) {
    console.log('Ausgewählt:', item);

    this.dropdownOpen = false;

    // this.searchTerm = '';

  }

  openUserMenu(event: Event) {
    const target = event.currentTarget as HTMLElement;

    this.overlayService.open(NavbarDialog, {
      target,
      offsetX: -200,
      offsetY: 10,
      data: { originTarget: target },
    });
  }

  closeDropdown() {
    this.dropdownOpen = false;
  }
}
