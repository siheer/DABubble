import { Injectable, signal } from '@angular/core';
import { ToastCreateOptions, ToastId, ToastItem, ToastRef, ToastVariant } from './toast.model';

let toastSequence = 0;

function createToastId(): ToastId {
  toastSequence += 1;
  return `${Date.now()}-${toastSequence}`;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);

  private readonly timers = new Map<ToastId, number>();
  private readonly maxToasts = 5;

  success(message: string, options?: Omit<ToastCreateOptions, 'message' | 'variant'>): ToastRef {
    return this.show({ ...options, message, variant: 'success' });
  }

  error(message: string, options?: Omit<ToastCreateOptions, 'message' | 'variant'>): ToastRef {
    return this.show({ ...options, message, variant: 'error' });
  }

  info(message: string, options?: Omit<ToastCreateOptions, 'message' | 'variant'>): ToastRef {
    return this.show({ ...options, message, variant: 'info' });
  }

  show(options: ToastCreateOptions): ToastRef {
    const id = createToastId();
    const variant: ToastVariant = options.variant ?? 'info';

    const toast: ToastItem = {
      id,
      message: options.message,
      variant,
      createdAtMs: Date.now(),

      durationMs: options.durationMs === undefined ? 5000 : options.durationMs,
      showCloseButton: options.showCloseButton ?? true,
      icon: options.icon,
      action: options.action,

      enterFrom: options.enterFrom ?? 'right',
      animation: options.animation ?? 'slide',
      enterMs: options.enterMs ?? 500,
      exitMs: options.exitMs ?? 500,

      extraClasses: options.extraClasses ?? '',
      isLeaving: false,
      onDismissed: options.onDismissed,
    };

    this.toasts.update((current) => {
      const next = [toast, ...current].slice(0, this.maxToasts);
      return next;
    });

    if (toast.durationMs !== null && toast.durationMs > 0) {
      const timerId = setTimeout(() => this.dismiss(id), toast.durationMs);
      this.timers.set(id, timerId);
    }

    return { id, dismiss: () => this.dismiss(id) };
  }

  dismiss(id: ToastId): void {
    const existing = this.toasts().find((toast) => toast.id === id);
    if (!existing || existing.isLeaving) return;

    const timerId = this.timers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.timers.delete(id);
    }

    this.toasts.update((current) => current.map((toast) => (toast.id === id ? { ...toast, isLeaving: true } : toast)));

    setTimeout(() => {
      const dismissed = this.toasts().find((toast) => toast.id === id);
      this.toasts.update((current) => current.filter((toast) => toast.id !== id));
      dismissed?.onDismissed?.();
    }, existing.exitMs);
  }

  dismissAll(): void {
    const ids = this.toasts().map((toast) => toast.id);
    ids.forEach((id) => this.dismiss(id));
  }

  getDefaultIcon(variant: ToastVariant): string {
    if (variant === 'success') return 'check_circle_outlined';
    if (variant === 'error') return 'error_outlined';
    return 'info_outlined';
  }
}
