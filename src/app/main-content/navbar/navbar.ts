import { Component, computed, ElementRef, inject, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { OverlayService } from '../../services/overlay.service';
import { NavbarDialog } from './navbar-dialog/navbar-dialog';
import { UserService } from '../../services/user.service';
import { CommonModule, Location } from '@angular/common';
import { FilterBox } from '../filter-box/filter-box';
import { FormsModule } from '@angular/forms';
import { ClickOutsideDirective } from '../../classes/click-outside.class';
import { DisplayNamePipe } from '../../pipes/display-name.pipe';
import { ScreenService } from '../../services/screen.service';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

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
  private readonly router = inject(Router);
  private overlayService = inject(OverlayService);
  private userService = inject(UserService);
  private readonly screenService = inject(ScreenService);
  private readonly location = inject(Location);

  protected readonly isTabletScreen = this.screenService.isTabletScreen;
  protected showBackButton = false;

  @ViewChild('menuBtn', { read: ElementRef })
  menuBtn!: ElementRef<HTMLElement>;

  dropdownOpen = false;
  searchTerm: string = '';
  isSearchFocused = false;

  currentUser = this.userService.currentUser;

  constructor() {
    this.screenService.connect();

    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.showBackButton = this.computeShowBackButton(e.urlAfterRedirects);
    });
  }

  private computeShowBackButton(url: string): boolean {
    if (!this.isTabletScreen()) return false;
    if (url === '/main/home') return false;
    return url.startsWith('/main');
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
    this.location.back();
  }

  profilePictureUrl = computed(() => this.userService.getProfilePictureUrl(this.currentUser()));
}
