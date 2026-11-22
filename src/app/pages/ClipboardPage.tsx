import { useState } from 'react';
import { addClip, clearClips, clipToNote, clipToTask, deleteClip, listClips, pinClip, touchClip, type AddResult } from '../../core/data/clipboard.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { updateSettings, useSettings } from '../store.ts';
import { Empty, Icon, Skeleton, useToast } from '../components/ui.tsx';

export function ClipboardPage() {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast(); const { clipboard: c } = useSettings();
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const q = useQuery(ctx, () => listClips(ctx, { search, ...(category ? { category } : {}) }), [search, category]);
  const set = (p: Partial<typeof c>) => updateSettings({ clipboard: { ...c, ...p } });
  async function capture() {
    try { const text = await navigator.clipboard.readText(); const r: AddResult = await addClip(ctx, text, c); toast(t(`clip.result.${r}`), r === 'added' || r === 'bumped' ? 'ok' : 'err'); } catch { toast(t('clip.readFailed'), 'err'); }
  }
  const run = (fn: () => Promise<unknown>) => { void fn().catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err')); };
  return (<div className="stack">
    <h1>{t('nav.clipboard')}</h1>
    <section className="card stack"><h2>{t('clip.privacyTitle')}</h2><p>{t('clip.privacyBody')}</p>
      <label className="inline"><input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />{t('clip.enable')}</label>
      {c.enabled && <><label className="inline"><input type="checkbox" checked={c.paused} onChange={(e) => set({ paused: e.target.checked })} />{t('clip.pause')}</label>
        <label className="inline"><input type="checkbox" checked={c.skipSensitive} onChange={(e) => set({ skipSensitive: e.target.checked })} />{t('clip.skipSensitive')}</label>
        <label>{t('clip.max')}<select value={c.maxItems} onChange={(e) => set({ maxItems: Number(e.target.value) })}>{[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <div className="row wrap"><button className="btn" onClick={() => { void capture(); }}>{t('clip.capture')}</button></div></>}</section>
    <div className="row wrap"><div className="search grow"><Icon name="search" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} /></div>
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('clip.category')}><option value="">{t('clip.anyCategory')}</option>{['text', 'link', 'email', 'number', 'code'].map((k) => <option key={k} value={k}>{t(`clip.cat.${k}`)}</option>)}</select>
      <button className="btn" onClick={() => { if (window.confirm(t('clip.confirmClear'))) run(() => clearClips(ctx, true)); }}>{t('clip.clearUnpinned')}</button>
      <button className="btn danger" onClick={() => { if (window.confirm(t('clip.confirmClear'))) run(() => clearClips(ctx)); }}>{t('clip.clearAll')}</button></div>
    {q.loading && !q.data ? <Skeleton /> : !q.data?.length ? <Empty title={t('clip.empty')} hint={t('clip.emptyHint')} /> :
      <ul className="list">{q.data.map((k) => (<li key={k.id} className="card clip"><pre className="clip-text">{k.text.slice(0, 400)}</pre>
        <div className="row wrap between"><span className="meta"><span className="chip">{t(`clip.cat.${k.category}`)}</span>{new Date(k.last_used_at).toLocaleString()}</span>
          <span className="row wrap"><button className="link" onClick={() => run(async () => { await navigator.clipboard.writeText(k.text); await touchClip(ctx, k.id); toast(t('clip.copied')); })}>{t('clip.copy')}</button>
            <button className="link" onClick={() => run(() => clipToNote(ctx, workspaceId, k.id))}>{t('clip.toNote')}</button><button className="link" onClick={() => run(() => clipToTask(ctx, workspaceId, k.id))}>{t('clip.toTask')}</button>
            <button className="link" aria-pressed={k.is_pinned} onClick={() => run(() => pinClip(ctx, k.id, !k.is_pinned))}>{t('clip.pin')}{k.is_pinned ? ' ✓' : ''}</button><button className="link" onClick={() => run(() => deleteClip(ctx, k.id))}>{t('common.delete')}</button></span></div></li>))}</ul>}
  </div>);
}
