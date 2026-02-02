import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ToastService } from './toast.service';
import { ToastEnterFrom, ToastItem } from './toast.model';
import { ScreenService } from '../services/screen.service';

@Component({
  selector: 'app-toast-outlet',
  standalone: true,
  imports: [NgClass, NgTemplateOutlet],
  templateUrl: './toast-outlet.html',
  styleUrl: './toast-outlet.scss',
})
export class ToastOutletComponent {
  private readonly toastService = inject(ToastService);
  private readonly screenService = inject(ScreenService);

  readonly toasts = this.toastService.toasts;
  readonly isSmallScreen = this.screenService.isSmallScreen;

  readonly anchors: { key: ToastEnterFrom; containerClass: string }[] = [
    {
      key: 'right',
      containerClass:
        'py-6 -my-6 pointer-events-none fixed right-6 bottom-6 z-50 flex max-w-[calc(100vw-2rem)] flex-col-reverse items-end gap-3 max-sm:right-4 max-sm:bottom-4',
    },
    {
      key: 'left',
      containerClass:
        'py-6 -my-6 pointer-events-none fixed left-6 bottom-6 z-50 flex max-w-[calc(100vw-2rem)] flex-col-reverse items-start gap-3 max-sm:left-4 max-sm:bottom-4',
    },
    {
      key: 'top',
      containerClass:
        'py-6 -my-6 pointer-events-none fixed top-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-3 max-sm:top-4',
    },
    {
      key: 'bottom',
      containerClass:
        'py-6 -my-6 pointer-events-none fixed bottom-6 w-full left-0 px-2 z-50 flex flex-col-reverse items-center-safe gap-3 max-sm:bottom-4 overflow-auto [scrollbar-width:none]',
    },
  ];

  private readonly groupedToasts = computed(() => {
    const buckets: Record<ToastEnterFrom, ToastItem[]> = { left: [], right: [], top: [], bottom: [] };
    for (const toast of this.toasts()) {
      buckets[toast.enterFrom].push(toast);
    }
    return buckets;
  });

  readonly bottomToasts = computed(() => {
    return this.toasts().map((toast) => ({
      ...toast,
      enterFrom: 'bottom',
    }));
  });

  constructor() {
    this.screenService.connect();
  }

  toastsFor(anchor: ToastEnterFrom): ToastItem[] {
    return this.groupedToasts()[anchor];
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  handleActionClick(toast: ToastItem): void {
    toast.action?.onClick();
    if (toast.action?.dismissOnClick ?? true) this.toastService.dismiss(toast.id);
  }

  toastClass(toast: ToastItem): string[] {
    const base = this.variantClass(toast);
    const motion = this.motionClass(toast);
    const corners = this.cornersClass(toast);
    return [...base, ...motion, corners, toast.extraClasses].filter(Boolean);
  }

  private variantClass(toast: ToastItem): string[] {
    if (toast.variant === 'success') return ['bg-emerald-600', 'text-white'];
    if (toast.variant === 'error') return ['bg-red-600', 'text-black'];
    return ['bg-dab-purple-1', 'text-white'];
  }

  private motionClass(toast: ToastItem): string[] {
    if (toast.animation === 'fade') {
      return toast.isLeaving ? ['dab-toast-leave-fade'] : ['dab-toast-enter-fade'];
    }

    if (toast.enterFrom === 'left') return toast.isLeaving ? ['dab-toast-leave-left'] : ['dab-toast-enter-left'];
    if (toast.enterFrom === 'top') return toast.isLeaving ? ['dab-toast-leave-top'] : ['dab-toast-enter-top'];
    if (toast.enterFrom === 'bottom') return toast.isLeaving ? ['dab-toast-leave-bottom'] : ['dab-toast-enter-bottom'];
    return toast.isLeaving ? ['dab-toast-leave-right'] : ['dab-toast-enter-right'];
  }

  private cornersClass(toast: ToastItem): string {
    if (toast.enterFrom === 'right') return 'rounded-t-2xl rounded-l-2xl';
    if (toast.enterFrom === 'left') return 'rounded-t-2xl rounded-r-2xl';
    return 'rounded-2xl';
  }
}
