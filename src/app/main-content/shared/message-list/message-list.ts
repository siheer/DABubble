import { Component, ElementRef, inject } from '@angular/core';

@Component({
  selector: 'app-message-list',
  standalone: true,
  templateUrl: './message-list.html',
  styleUrl: './message-list.scss',
})
export class MessageList {
  private readonly host = inject(ElementRef<HTMLElement>);

  get nativeElement(): HTMLElement {
    return this.host.nativeElement;
  }
}
