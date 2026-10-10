import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import '../panels/panels.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reusable destructive-action confirmation dialog. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = 'fl-confirm-title';
  const messageId = 'fl-confirm-message';

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fl-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        data-testid="confirm-dialog"
        className="fl-dialog"
      >
        <div className="fl-dialog-header">
          <h2 id={titleId} className="fl-dialog-title">
            {title}
          </h2>
        </div>
        <div className="fl-dialog-body">
          <p id={messageId} className="fl-dialog-text">
            {message}
          </p>
        </div>
        <div className="fl-dialog-actions">
          <button
            type="button"
            className="fl-btn fl-btn-ghost"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="fl-btn fl-btn-danger"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
