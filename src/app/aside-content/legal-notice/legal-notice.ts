import { Component } from '@angular/core';
import { AsideContentWrapperComponent } from '../aside-content-wrapper';

@Component({
  selector: 'app-legal-notice',
  imports: [AsideContentWrapperComponent],
  templateUrl: './legal-notice.html',
  styleUrl: './legal-notice.scss',
})
export class LegalNotice {
  backInHistory() {
    window.history.back();
  }
}
