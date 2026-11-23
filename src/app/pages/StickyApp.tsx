import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { makeCtx, type Ctx } from '../../core/data/ctx.ts';
import { openTauriDb } from '../../core/db/tauriDb.ts';
import { NOTE_COLORS, createAutosaver, getNote, updateNote, type Note } from '../../core/data/notes.ts';
import { getStickyState, saveStickyState } from '../../core/data/sticky.ts';
import { RichEditor } from '../components/RichEditor.tsx';
import { I18nProvider, useT } from '../i18n.tsx';
import { applyCurrentTheme } from '../store.ts';

/** Content of an independent always-on-top sticky window (opened with ?sticky=<note id>). UNVERIFIED in a real Tauri window. */
function Sticky({ id }: { id: string }) {
  const t = useT(); const [ctx, setCtx] = useState<Ctx | null>(null); const [note, setNote] = useState<Note | null>(null); const [top, setTop] = useState(true); const latest = useRef('');
  useEffect(() => { void (async () => { const c = makeCtx(await openTauriDb()); setCtx(c); const n = await getNote(c, id); if (n) { setNote(n); latest.current = n.html; } setTop((await getStickyState(c, id)).alwaysOnTop);
    const w = getCurrentWindow(); let tm: ReturnType<typeof setTimeout> | null = null;
    const persist = () => { if (tm) clearTimeout(tm); tm = setTimeout(() => { void (async () => { const p = await w.outerPosition(); const s = await w.innerSize(); await saveStickyState(c, id, { x: p.x, y: p.y, w: s.width, h: s.height }); })(); }, 500); };
    await w.onMoved(persist); await w.onResized(persist); })(); }, [id]);
  const saver = useMemo(() => (ctx ? createAutosaver(async (html: string) => { await updateNote(ctx, id, { html }); await emit('nexora:data-changed'); }, 600) : null), [ctx, id]);
  useEffect(() => () => { void saver?.flush(); }, [saver]);
  if (!ctx || !note) return <div className="center" role="status">{t('common.loading')}</div>;
  return (<div className="sticky" style={{ background: note.color ?? NOTE_COLORS[0], color: '#1c1917' }}>
    <div className="row between sticky-bar"><div className="swatches">{NOTE_COLORS.map((c) => <button key={c} className={`sw${note.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => { void updateNote(ctx, id, { color: c }).then(setNote).then(() => emit('nexora:data-changed')); }} />)}</div>
      <label className="inline"><input type="checkbox" checked={top} onChange={(e) => { const v = e.target.checked; setTop(v); void getCurrentWindow().setAlwaysOnTop(v); void saveStickyState(ctx, id, { alwaysOnTop: v }); }} />{t('sticky.alwaysOnTop')}</label></div>
    <RichEditor html={note.html} onChange={(h) => { latest.current = h; saver?.schedule(h); }} onBlur={() => { void saver?.flush(); }} /></div>);
}
export function StickyApp({ id }: { id: string }) { applyCurrentTheme(); return <I18nProvider><Sticky id={id} /></I18nProvider>; }
