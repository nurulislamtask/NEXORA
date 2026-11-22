import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n.tsx';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z', sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7l1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2l-1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', notes: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14', star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z', trash: 'M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3',
  menu: 'M4 6h16M4 12h16M4 18h16', pin: 'M12 17v5M9 3h6l-1 7 3 3H7l3-3z', check: 'M5 13l4 4L19 7', x: 'M6 6l12 12M18 6L6 18', sync: 'M21 12a9 9 0 01-15.5 6.2M3 12A9 9 0 0118.5 5.8M21 4v5h-5M3 20v-5h5',
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] ?? ''} /></svg>;
}

export function Dialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const t = useT(); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); ref.current?.focus(); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (<div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <header className="dialog-h"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button></header>{children}</div></div>);
}

interface Toast { id: number; msg: string; kind: 'ok' | 'err' }
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = (): ((msg: string, kind?: 'ok' | 'err') => void) => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => { const id = Date.now() + Math.random(); setList((l) => [...l, { id, msg, kind }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4000); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{list.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.msg}</div>)}</div></ToastCtx.Provider>;
}
export function Skeleton({ rows = 3 }: { rows?: number }) { return <div aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>; }
export function Empty({ title, hint }: { title: string; hint?: string }) { return <div className="empty"><div className="empty-art" aria-hidden="true">✦</div><strong>{title}</strong>{hint && <p>{hint}</p>}</div>; }
