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
    this.overlayContainer = document.createElement('div');
    Object.assign(this.overlayContainer.style, {
      position: 'fixed',
      zIndex: String(1000 + this.stackIndex),
    });
    document.body.appendChild(this.overlayContainer);

    this.createComponent(this.component, this.config.data);

    this.updatePosition();
    this._updateBound = this.updatePosition.bind(this);
    window.addEventListener('resize', this._updateBound);
    window.addEventListener('scroll', this._updateBound);

    this._escListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.startCloseAnimation();
    };
    window.addEventListener('keydown', this._escListener);
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
    const oldInstance = this.componentRef.instance as any;
    oldInstance.startCloseAnimation?.();

    setTimeout(() => {
      this.createComponent(component, config?.data);
      this.updatePosition();
    }, 250);
  }

  /**
   * Updates the position of the overlay based on the target element and offsets.
   */
  private updatePosition() {
    if (!this.config.target) return;
    const rect = this.config.target.getBoundingClientRect();
    const offsetX = this.config.offsetX ?? 0;
    const offsetY = this.config.offsetY ?? 0;
    this.overlayContainer.style.left = rect.left + offsetX + 'px';
    this.overlayContainer.style.top = rect.bottom + offsetY + 'px';
  }

  /**
   * Initiates the close animation for the overlay/waits for animation event to complete before destroying.
   */
  startCloseAnimation() {
    this.visible = false;

    const instance = this.componentRef.instance as any;

    if ('visible' in instance) {
      instance.visible = false;
    }

    if ('closed' in instance) {
      instance.closed.subscribe(() => {
        if (!this.visible) {
          this.destroy();
        }
      });
    } else {
      // Fallback if component has no closed event
      this.destroy();
    }
  }

  /**
   * Destroys the overlay and the attached component.
   */
  private destroy() {
    window.removeEventListener('keydown', this._escListener);
    window.removeEventListener('resize', this._updateBound);
    window.removeEventListener('scroll', this._updateBound);

    this.appRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
    this.overlayContainer.remove();

    this.onCloseCallback?.();
    (document.activeElement as HTMLElement)?.blur();
  }

  /**
   * Registers a callback that is executed after the overlay is closed.
   * @param cb - Callback function to execute on close
   */
  onClose(cb: () => void) {
    this.onCloseCallback = cb;
  }
}
