import { Directive, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[clickOutside]',
  standalone: true,
})
export class ClickOutsideDirective {
  @Output() clickOutside = new EventEmitter<void>();

  constructor(private el: ElementRef) {}

  @HostListener('document:click', ['$event.target'])
  onClick(target: EventTarget | null) {
    if (
      target instanceof HTMLElement &&
      !this.el.nativeElement.contains(target) &&
      !target.classList.contains('overlay-backdrop')
    ) {
      this.clickOutside.emit();
    }
  }
}
