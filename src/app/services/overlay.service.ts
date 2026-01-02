import { Injectable, Type, inject, ApplicationRef, EnvironmentInjector } from '@angular/core';
import { OverlayRef, OverlayConfig } from '../classes/overlay.class';

@Injectable({ providedIn: 'root' })
export class OverlayService {
  private appRef = inject(ApplicationRef);
  private envInjector = inject(EnvironmentInjector);

  private overlays: OverlayRef<object>[] = [];
  private backdrop!: HTMLElement;
  private onAnyOverlayClosed?: () => void;

  constructor() {
    this.createBackdrop();
  }

  registerOnAnyOverlayClosed(cb: () => void) {
    this.onAnyOverlayClosed = cb;
  }

  private updateBackdropStyle() {
    const depth = this.overlays.length;

    if (depth <= 1) {
      this.backdrop.style.background = 'rgba(0,0,0,0.4)';
    } else {
      this.backdrop.style.background = 'rgba(0,0,0,0.6)';
    }

    this.backdrop.style.zIndex = String(1000 + depth - 1);
  }

  private createBackdrop() {
    this.backdrop = document.createElement('div');

    Object.assign(this.backdrop.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.4)',
      zIndex: '999',
      display: 'none',
    });

    this.backdrop.addEventListener('click', () => {
      const last = this.overlays[this.overlays.length - 1];
      last?.startCloseAnimation();
    });

    document.body.appendChild(this.backdrop);
  }

  open<T extends object>(component: Type<T>, config?: OverlayConfig<T>) {
    const previous = this.getLastOverlay();
    previous?.suspendFocus?.();
    this.backdrop.style.display = 'block';
    this.backdrop.style.zIndex = String(1000 + this.overlays.length);

    const overlayRef = new OverlayRef<T>(component, config, this.appRef, this.envInjector);

    overlayRef.stackIndex = this.overlays.length;

    this.overlays.push(overlayRef as OverlayRef<object>);
    config ??= {};
    config.data ??= {};
    (config.data as any).overlayRef = overlayRef;
    this.updateBackdropStyle();

    overlayRef.onClose(() => {
      this.overlays = this.overlays.filter((o) => o !== overlayRef);

      const last = this.getLastOverlay();
      if (last) {
        last.resumeFocus();
      } else {
        overlayRef['previouslyFocusedElement']?.focus();
        this.backdrop.style.display = 'none';
      }

      this.onAnyOverlayClosed?.();
      this.updateBackdropStyle();
    });

    overlayRef.open();
    return overlayRef;
  }

  closeLast() {
    const last = this.overlays[this.overlays.length - 1];
    last?.startCloseAnimation();
  }

  closeAll() {
    this.overlays.forEach((o) => o.startCloseAnimation());
    this.overlays = [];
    this.backdrop.style.display = 'none';
  }

  getLastOverlay(): OverlayRef | undefined {
    return this.overlays[this.overlays.length - 1];
  }
}
