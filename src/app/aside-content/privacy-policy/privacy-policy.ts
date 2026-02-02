import { Component, inject, input, output } from '@angular/core';
import { AsideContentWrapperComponent } from '../aside-content-wrapper';
import { Router } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  imports: [AsideContentWrapperComponent],
  templateUrl: './privacy-policy.html',
  styleUrl: './privacy-policy.scss',
})
export class PrivacyPolicy {
  private router = inject(Router);

  embedded = input(false);
  action = output<void>();

  backToMain() {
    this.router.navigate(['/main']);
  }

  embeddedAction() {
    this.action.emit();
  }
}
