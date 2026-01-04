/** Class that dynamically creates, renders, and manages an overlay element.
 *
 * Features:
 * - Render any Angular component in an overlay container.
 * - Position overlay relative to a target element.
 * - Handle enter/leave animations and cleanup.
 * - Replace the currently displayed component with a new one.
 * - Properly destroy overlay and cleanup event listeners.
 */

import {
  Type,
  ApplicationRef,
  ComponentRef,
  EmbeddedViewRef,
  createComponent,
  EnvironmentInjector,
} from '@angular/core';
import { take } from 'rxjs';

export interface OverlayConfig<T = any> {
  target?: HTMLElement;
  backdropOpacity?: number;
  data?: Partial<T>;
  offsetX?: number;
  offsetY?: number;
  mode?: 'desktop' | 'mobile';
}

/**
 * @template T - The type of the component to be rendered in the overlay.
 */
export class OverlayRef<T extends object = any> {
  private componentRef!: ComponentRef<T>;
  private overlayContainer!: HTMLElement;
  private _updateBound!: () => void;
  private _escListener!: (e: KeyboardEvent) => void;
  private onCloseCallback?: () => void;
  private previouslyFocusedElement: HTMLElement | null = null;
  public mode: 'desktop' | 'mobile' = 'desktop';
  public stackIndex = 0;

  /** Visibility flag for controlling animations */
  public visible = true;

  /**
   * @param component - Component to render inside the overlay
   * @param config - Optional configuration for overlay position, target, and data
   * @param appRef - Angular ApplicationRef used to attach the component
   * @param envInjector - EnvironmentInjector for dependency injection
   */
  constructor(
    private component: Type<T>,
    private config: OverlayConfig<T> = {},
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector
  ) {
    this.mode = config.mode ?? 'desktop';
  }

  /**
   * Opens the overlay and renders the component inside it.
   */
  open() {
    this.previouslyFocusedElement = document.activeElement as HTMLElement;

    this.overlayContainer = document.createElement('div');
    Object.assign(this.overlayContainer.style, {
      position: 'fixed',
      zIndex: String(1000 + this.stackIndex),
    });

    this.overlayContainer.setAttribute('role', 'dialog');
    this.overlayContainer.setAttribute('aria-modal', 'true');
    this.overlayContainer.classList.add('overlay');
    this.overlayContainer.tabIndex = -1;

    document.body.appendChild(this.overlayContainer);

    this.createComponent(this.component, this.config.data);

    this.trapFocus();
    this.focusFirstElement();

    this.updatePosition();
    this._updateBound = this.updatePosition.bind(this);
    window.addEventListener('resize', this._updateBound);
    window.addEventListener('scroll', this._updateBound);
  }

  /**
   * Creates and attaches a new component inside the overlay container.
   * @param component - The Angular component to create
   * @param data - Optional data to assign to the component instance
   */
  private createComponent(component: Type<any>, data?: any) {
    this.componentRef = createComponent(component, { environmentInjector: this.envInjector });

    const instance = this.componentRef.instance as any;
    if ('mode' in instance) {
      instance.mode = this.mode;
    }
    if (data) Object.assign(instance, data);
    instance.visible ??= true;
    instance.startCloseAnimation ??= () => (this.visible = false);

    this.appRef.attachView(this.componentRef.hostView);
    const domElem = (this.componentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement;
    this.overlayContainer.innerHTML = '';
    this.overlayContainer.appendChild(domElem);
  }

  /**
   * Replaces the currently displayed component with a new one + Starts the close animation on the old component.
   * @param component - New Angular component to display
   * @param config - Optional overlay configuration for the new component
   */
  replaceComponent<T2 extends object>(component: Type<T2>, config?: OverlayConfig<T2>) {
    const data = {
      ...(config?.data ?? {}),
      overlayRef: this,
    };

    this.createComponent(component, data);
    this.updatePosition();
  }

  /**
   * Updates the position of the overlay based on the target element and offsets.
   */
  private updatePosition() {
    if (!this.config.target) return;
    const rect = this.config.target.getBoundingClientRect();
    const offsetX = this.config.offsetX ?? 0;
    const offsetY = this.config.offsetY ?? 0;
    // this.overlayContainer.style.left = rect.left + offsetX + 'px';
    // this.overlayContainer.style.top = rect.bottom + offsetY + 'px';
    const margin = 12;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(0, viewportWidth - margin * 2);
    const maxHeight = Math.max(0, viewportHeight - margin * 2);

    this.overlayContainer.style.maxWidth = `${maxWidth}px`;
    this.overlayContainer.style.maxHeight = `${maxHeight}px`;
    this.overlayContainer.style.overflowY = 'auto';
    this.overlayContainer.style.overflowX = 'hidden';
    const overlayWidth = this.overlayContainer.offsetWidth;
    const overlayHeight = this.overlayContainer.offsetHeight;
    let left = rect.left + offsetX;
    let top = rect.bottom + offsetY;

    if (left + overlayWidth > viewportWidth - margin) {
      left = viewportWidth - overlayWidth - margin;
    }

    if (left < margin) {
      left = margin;
    }

    if (top + overlayHeight > viewportHeight - margin) {
      top = rect.top - overlayHeight - offsetY;
    }

    if (top < margin) {
      top = margin;
    }

    this.overlayContainer.style.left = `${left}px`;
    this.overlayContainer.style.top = `${top}px`;
  }

  /**
   * Initiates the close animation for the overlay/waits for animation event to complete before destroying.
   */
  startCloseAnimation() {
    this.visible = false;

    const instance = this.componentRef.instance as any;
    instance.visible = false;

    if (instance.closed) {
      instance.closed.pipe(take(1)).subscribe(() => {
        this.destroy();
      });
    } else {
      setTimeout(() => this.destroy(), 300);
    }
  }

  /**
   * Destroys the overlay and the attached component.
   */
  private destroy() {
    this.overlayContainer.removeEventListener('keydown', this._escListener);
    window.removeEventListener('resize', this._updateBound);
    window.removeEventListener('scroll', this._updateBound);

    this.appRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
    this.overlayContainer.remove();

    this.onCloseCallback?.();
  }

  /**
   * Registers a callback that is executed after the overlay is closed.
   * @param cb - Callback function to execute on close
   */
  onClose(cb: () => void) {
    this.onCloseCallback = cb;
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(
      this.overlayContainer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled'));
  }

  private trapFocus() {
    this._escListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.startCloseAnimation();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = this.focusableElements();
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    this.overlayContainer.addEventListener('keydown', this._escListener);
  }

  private focusFirstElement() {
    requestAnimationFrame(() => {
      const elements = this.focusableElements();
      if (elements.length > 0) {
        elements[0].focus();
      } else {
        this.overlayContainer.focus();
      }
    });
  }

  suspendFocus() {
    this.overlayContainer?.setAttribute('aria-hidden', 'true');
    this.overlayContainer?.setAttribute('inert', '');
  }

  resumeFocus() {
    this.overlayContainer?.removeAttribute('aria-hidden');
    this.overlayContainer?.removeAttribute('inert');
    this.focusFirstElement();
  }
}
