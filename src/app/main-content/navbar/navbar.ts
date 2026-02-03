import { Component, computed, ElementRef, inject, input, output, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { OverlayService } from '../../services/overlay.service';
import { NavbarDialog } from './navbar-dialog/navbar-dialog';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { FilterBox } from '../filter-box/filter-box';
import { FormsModule } from '@angular/forms';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { DisplayNamePipe } from '../../pipes/display-name.pipe';
import { ScreenService } from '../../services/screen.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    CommonModule,
    FilterBox,
    FormsModule,
    ClickOutsideDirective,
    DisplayNamePipe,
  ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss'],
})
export class Navbar {
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);
  private readonly screenService = inject(ScreenService);

  readonly showBackButton = input(false);
  readonly back = output<void>();
  protected readonly isTabletScreen = this.screenService.isTabletScreen;

  @ViewChild('menuBtn', { read: ElementRef })
  menuBtn!: ElementRef<HTMLElement>;

  dropdownOpen = false;
  searchTerm: string = '';
  isSearchFocused = false;

  currentUser = this.userService.currentUser;

  constructor() {
    this.screenService.connect();
  }

  onSearchInput(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
  }

  onFocus() {
    this.isSearchFocused = true;
    this.dropdownOpen = true;
  }

  onBlur() {
    this.isSearchFocused = false;
  }

  openUserMenu() {
    if (!this.isTabletScreen()) {
      this.openDesktopMenu();
    } else {
      this.openMobileMenu();
    }
  }

  openDesktopMenu() {
    if (!this.menuBtn) return;
    const target = this.menuBtn.nativeElement;

    this.overlayService.open(NavbarDialog, {
      target,
      offsetX: -225,
      offsetY: 43,
      mode: 'desktop',
    });
  }

  openMobileMenu() {
    this.overlayService.open(NavbarDialog, {
      mode: 'mobile',
    });
  }

  closeDropdown() {
    this.searchTerm = '';
    this.dropdownOpen = false;
  }

  onBackClick() {
    this.back.emit();
  }

  profilePictureUrl = computed(() => this.userService.getProfilePictureUrl(this.currentUser()));
}
