import { Component, inject } from '@angular/core';
import { AsideContentWrapperComponent } from '../aside-content-wrapper';
import { Router } from '@angular/router';

@Component({
  selector: 'app-legal-notice',
  imports: [AsideContentWrapperComponent],
  templateUrl: './legal-notice.html',
  styleUrl: './legal-notice.scss',
})
export class LegalNotice {
  private router = inject(Router);

  backToMain() {
    this.router.navigate(['/main']);
  }
}
