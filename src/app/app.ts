import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Startscreen } from './startscreen/startscreen';
import { CommonModule } from '@angular/common';
import { BrandStateService } from './services/brand-state.service';
import { ToastOutletComponent } from './toast/toast-outlet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Startscreen, CommonModule, ToastOutletComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor(public brandState: BrandStateService) {}
  protected readonly title = signal('daBubble');
}
