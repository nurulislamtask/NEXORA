import { useState, type FormEvent } from 'react';
import { calendarItems, createEvent, deleteEvent, monthGrid, type CalItem } from '../../core/data/calendar.ts';
import { fromLocalInput, localDate } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { useSettings } from '../store.ts';
import { Dialog, Empty, useToast } from '../components/ui.tsx';

export function CalendarPage({ openTask }: { openTask?: (id: string) => void }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast(); const { locale } = useSettings();
  const now = new Date(); const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() }); const [sel, setSel] = useState(localDate(now));
  const [adding, setAdding] = useState(false); const [f, setF] = useState({ title: '', start: '', end: '', allDay: false, rule: '' });
  const grid = monthGrid(ym.y, ym.m, 0); const tag = locale === 'bn' ? 'bn-BD' : 'en-US';
  const q = useQuery(ctx, () => calendarItems(ctx, grid[0]!, grid[41]!), [ym.y, ym.m]);
  const items = q.data ?? new Map<string, CalItem[]>(); const today = localDate(now);
  const shift = (n: number) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err');
  async function save(e: FormEvent) { e.preventDefault(); try {
    const s = f.allDay ? new Date(`${sel}T00:00`).toISOString() : fromLocalInput(f.start); if (!s) throw new Error(t('calendar.needStart'));
    await createEvent(ctx, workspaceId, { title: f.title, starts_at: s, ends_at: f.allDay ? null : fromLocalInput(f.end), all_day: f.allDay, recurrence_rule: f.rule || null });
    setAdding(false); setF({ title: '', start: '', end: '', allDay: false, rule: '' }); } catch (err) { fail(err); } }
  const day = items.get(sel) ?? [];
  const wd = (i: number) => new Date(2024, 0, 7 + i).toLocaleDateString(tag, { weekday: 'short' });
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.calendar')}</h1>
      <div className="row"><button className="icon-btn" aria-label={t('calendar.prev')} onClick={() => shift(-1)}>‹</button><strong aria-live="polite">{new Date(ym.y, ym.m, 1).toLocaleDateString(tag, { month: 'long', year: 'numeric' })}</strong><button className="icon-btn" aria-label={t('calendar.next')} onClick={() => shift(1)}>›</button>
        <button className="btn" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSel(today); }}>{t('calendar.today')}</button>
        <button className="btn primary" onClick={() => { setF({ ...f, start: `${sel}T09:00`, end: `${sel}T10:00` }); setAdding(true); }}>{t('calendar.newEvent')}</button></div></div>
    <div className="cal" role="grid" aria-label={t('nav.calendar')}>
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="cal-h" role="columnheader">{wd(i)}</div>)}
      {grid.map((d) => { const its = items.get(d) ?? []; const other = Number(d.slice(5, 7)) - 1 !== ym.m;
        return <button key={d} role="gridcell" className={`cal-d${d === sel ? ' sel' : ''}${d === today ? ' today' : ''}${other ? ' other' : ''}`} aria-selected={d === sel} aria-label={`${d}${its.length ? `, ${its.length}` : ''}`} onClick={() => setSel(d)}>
          <span>{Number(d.slice(8))}</span>{its.slice(0, 2).map((i) => <small key={i.key} className={i.kind === 'task' ? 'tk' : 'ev'}>{i.title}</small>)}{its.length > 2 && <small>+{its.length - 2}</small>}</button>; })}</div>
    <section className="card stack"><h2>{new Date(`${sel}T00:00`).toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      {day.length === 0 ? <Empty title={t('calendar.nothing')} /> : <ul className="list">{day.map((i) => <li key={i.key} className="row between"><span>{i.allDay ? t('calendar.allDay') : new Date(i.startsAt).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })} · <span className={i.done ? 'done' : ''}>{i.title}</span> <span className="chip">{t(`calendar.kind.${i.kind}`)}</span></span>
        {i.kind === 'event' ? <button className="link" onClick={() => { void deleteEvent(ctx, i.id).catch(fail); }}>{t('common.delete')}</button> : openTask && <button className="link" onClick={() => openTask(i.id)}>{t('calendar.open')}</button>}</li>)}</ul>}</section>
    {adding && <Dialog title={t('calendar.newEvent')} onClose={() => setAdding(false)}><form className="stack" onSubmit={(e) => { void save(e); }}>
      <input autoFocus value={f.title} maxLength={500} placeholder={t('calendar.title')} aria-label={t('calendar.title')} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label className="inline"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />{t('calendar.allDay')}</label>
      {!f.allDay && <div className="row wrap"><label>{t('calendar.starts')}<input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label><label>{t('calendar.ends')}<input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label></div>}
      <label>{t('calendar.repeat')}<select value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value })}>{['', 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'].map((r) => <option key={r} value={r}>{t(`calendar.rule.${r.replace('FREQ=', '') || 'NONE'}`)}</option>)}</select></label>
      <div className="row"><button className="btn primary" disabled={!f.title.trim()}>{t('common.save')}</button><button type="button" className="btn" onClick={() => setAdding(false)}>{t('common.cancel')}</button></div></form></Dialog>}
  </div>);
}
