import { Injectable, signal, WritableSignal } from '@angular/core';

export type FullscreenOverlayMode = 'loading';

@Injectable({ providedIn: 'root' })
export class FullscreenOverlayService {
  readonly fullscreenOverlayMode = signal<FullscreenOverlayMode | null>(null);
  readonly fullscreenOverlayMessage: WritableSignal<string | undefined | null> = signal(null);

  showFullscreenOverlay(mode: FullscreenOverlayMode, message?: string): void {
    this.fullscreenOverlayMessage.set(message);
    this.fullscreenOverlayMode.set(mode);
  }

  hideFullscreenOverlay(): void {
    this.fullscreenOverlayMode.set(null);
    this.fullscreenOverlayMessage.set(null);
  }
}
