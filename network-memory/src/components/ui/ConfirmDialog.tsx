import { useEffect, useRef, type ReactNode } from 'react';
import './ConfirmDialog.css';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 確認ダイアログ（ネイティブ <dialog> を使用し、フォーカス管理・Esc を任せる） */
export function ConfirmDialog({ open, title, children, confirmLabel = 'OK', cancelLabel = 'キャンセル', danger, confirmDisabled, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${danger ? 'dialog--danger' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="dialog__body">
        <p className="dialog__kicker mono">{danger ? '!! CONFIRM' : '> CONFIRM'}</p>
        <h2 className="dialog__title">{title}</h2>
        {children && <div className="dialog__content">{children}</div>}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn btn--primary ${danger ? 'btn--danger' : ''}`} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
