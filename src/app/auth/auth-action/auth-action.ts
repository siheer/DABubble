import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth-action',
  imports: [CommonModule],
  template: ``,
})
export class AuthAction implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    if (!mode || !oobCode) {
      this.router.navigate(['/login']);
      return;
    }

    switch (mode) {
      case 'verifyEmail':
        this.router.navigate(['/email-confirmed'], {
          queryParams: { mode, oobCode },
        });
        break;

      case 'resetPassword':
        this.router.navigate(['/reset-password'], {
          queryParams: { mode, oobCode },
        });
        break;

      default:
        this.router.navigate(['/login']);
    }
  }
}
