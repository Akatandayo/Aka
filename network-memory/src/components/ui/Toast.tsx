import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import './Toast.css';

export type ToastTone = 'info' | 'success' | 'warn' | 'error' | 'discover';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
}

interface ToastApi {
  push: (t: { title: string; body?: string; tone?: ToastTone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_LABEL: Record<ToastTone, string> = {
  info: 'SYSTEM',
  success: 'COMPLETE',
  warn: 'WARNING',
  error: 'ERROR',
  discover: 'NEW RECORD',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback<ToastApi['push']>(
    ({ title, body, tone = 'info', durationMs }) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, title, body, tone }]);
      window.setTimeout(() => dismiss(id), durationMs ?? (tone === 'error' || tone === 'warn' ? 6500 : 3800));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <button key={t.id} type="button" className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)} aria-label={`${t.title}（タップで閉じる）`}>
            <span className="toast__tone mono">{TONE_LABEL[t.tone]}</span>
            <span className="toast__title">{t.title}</span>
            {t.body && <span className="toast__body">{t.body}</span>}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast は ToastProvider の内側で使用してください');
  return ctx;
}
