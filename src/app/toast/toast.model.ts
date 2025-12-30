export type ToastVariant = 'success' | 'error' | 'info';
export type ToastEnterFrom = 'right' | 'left' | 'top' | 'bottom';
export type ToastAnimation = 'slide' | 'fade';
export type ToastId = string;
export interface ToastAction {
  label: string;
  onClick: () => void;
  dismissOnClick?: boolean;
}

export interface ToastCreateOptions {
  message: string;
  variant?: ToastVariant;
  durationMs?: number | null;
  showCloseButton?: boolean;
  icon?: string;
  action?: ToastAction;

  enterFrom?: ToastEnterFrom;
  animation?: ToastAnimation;
  enterMs?: number;
  exitMs?: number;

  extraClasses?: string;
  onDismissed?: () => void;
}

export interface ToastItem {
  id: ToastId;
  message: string;
  variant: ToastVariant;
  createdAtMs: number;

  durationMs: number | null;
  showCloseButton: boolean;
  icon?: string;
  action?: ToastAction;

  enterFrom: ToastEnterFrom;
  animation: ToastAnimation;
  enterMs: number;
  exitMs: number;

  extraClasses: string;
  isLeaving: boolean;
  onDismissed?: () => void;
}

export interface ToastRef {
  id: ToastId;
  dismiss: () => void;
}
