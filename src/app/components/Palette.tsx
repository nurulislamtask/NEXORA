import { useEffect, useState } from 'react';
import { globalSearch, highlightParts, pushRecent, type SearchHit } from '../../core/data/search.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { updateSettings, useSettings } from '../store.ts';

export type PaletteTarget = { page: 'tasks' | 'notes' | 'habits' | 'clipboard' | 'home' | 'settings'; openId?: string } | { command: 'new-task' | 'new-note' };
export function Palette({ onPick, onClose }: { onPick(t: PaletteTarget): void; onClose(): void }) {
  const t = useT(); const { ctx } = useRuntime(); const s = useSettings(); const [q, setQ] = useState(''); const [hits, setHits] = useState<SearchHit[]>([]); const [sel, setSel] = useState(0);
  useEffect(() => { let live = true; const h = setTimeout(() => { void globalSearch(ctx, q, { includeClipboard: s.clipboard.enabled }).then((r) => { if (live) { setHits(r); setSel(0); } }); }, 120); return () => { live = false; clearTimeout(h); }; }, [ctx, q, s.clipboard.enabled]);
  const cmds: { label: string; target: PaletteTarget }[] = [{ label: t('palette.newTask'), target: { command: 'new-task' } }, { label: t('palette.newNote'), target: { command: 'new-note' } },
    ...(['home', 'tasks', 'notes', 'habits', 'clipboard', 'settings'] as const).map((p) => ({ label: t(`nav.${p}`), target: { page: p } as PaletteTarget }))];
  const filtered = q.trim() ? cmds.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())) : cmds;
  const items: { key: string; label: string; sub: string; target: PaletteTarget; hit?: boolean }[] = [
    ...hits.map((h) => ({ key: h.kind + h.id, label: h.title || t('notes.untitled'), sub: t(`palette.kind.${h.kind}`), hit: true, target: (h.kind === 'task' ? { page: 'tasks', openId: h.id } : h.kind === 'note' ? { page: 'notes', openId: h.id } : h.kind === 'habit' ? { page: 'habits' } : h.kind === 'clip' ? { page: 'clipboard' } : { page: 'tasks' }) as PaletteTarget })),
    ...filtered.map((c) => ({ key: 'c' + c.label, label: c.label, sub: t('palette.commands'), target: c.target }))];
  const pick = (i: number) => { const it = items[i]; if (!it) return; if (q.trim()) updateSettings({ recentSearches: pushRecent(s.recentSearches, q) }); onPick(it.target); };
  return (<div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
      <input autoFocus className="palette-input" value={q} placeholder={t('palette.placeholder')} aria-label={t('palette.title')} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(items.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); } else if (e.key === 'Enter') pick(sel); }} />
      {!q.trim() && s.recentSearches.length > 0 && <div className="row wrap palette-recent"><small>{t('palette.recent')}</small>{s.recentSearches.map((r) => <button key={r} className="chip" onClick={() => setQ(r)}>{r}</button>)}</div>}
      <ul className="list palette-list" role="listbox">{items.length === 0 ? <li className="empty">{t('palette.noResults')}</li> : items.map((it, i) => (
        <li key={it.key} role="option" aria-selected={i === sel}><button className={`palette-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
          <span>{it.hit ? highlightParts(it.label, q).map((p, j) => (p.hit ? <mark key={j}>{p.text}</mark> : <span key={j}>{p.text}</span>)) : it.label}</span><small>{it.sub}</small></button></li>))}</ul></div></div>);
}
