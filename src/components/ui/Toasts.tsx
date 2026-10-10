import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';

export function Toasts(): JSX.Element {
  const toasts = useFlowStore((s) => s.toasts);
  const dismissToast = useFlowStore((s) => s.dismissToast);

  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          data-testid="toast"
          data-toast-kind={toast.kind}
          role="status"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
