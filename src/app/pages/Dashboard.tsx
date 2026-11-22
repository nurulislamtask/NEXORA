import { useState, type FormEvent } from 'react';
import { createTask, listTasks, setTaskCompleted } from '../../core/data/tasks.ts';
import { listNotes } from '../../core/data/notes.ts';
import { dayBounds, greetingKey } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Empty, Skeleton, useToast } from '../components/ui.tsx';

export function Dashboard({ go }: { go(p: 'tasks' | 'notes'): void }) {
  const t = useT(); const { ctx, workspaceId, user } = useRuntime(); const toast = useToast(); const [quick, setQuick] = useState('');
  const b = dayBounds(new Date());
  const q = useQuery(ctx, async () => {
    const base = { ...b, sort: 'due' as const };
    const [today, overdue, upcoming, done, notes] = await Promise.all([listTasks(ctx, { ...base, view: 'my-day' }), listTasks(ctx, { ...base, view: 'overdue' }), listTasks(ctx, { ...base, view: 'upcoming' }), listTasks(ctx, { ...base, view: 'completed', sort: 'created' }), listNotes(ctx, { view: 'active' })]);
    return { today, overdue, upcoming, doneToday: done.filter((x) => x.completed_at && x.completed_at >= b.dayStartIso && x.completed_at < b.dayEndIso).length, notes: notes.slice(0, 4) };
  }, [b.today]);
  async function add(e: FormEvent) { e.preventDefault(); if (!quick.trim()) return; try { await createTask(ctx, workspaceId, { title: quick, is_my_day_date: b.today }); setQuick(''); } catch (err) { toast(err instanceof Error ? err.message : String(err), 'err'); } }
  const d = q.data; const total = d ? d.today.length + d.doneToday : 0; const pct = total ? Math.round((d!.doneToday / total) * 100) : 0;
  return (<div className="stack">
    <h1>{t(greetingKey(new Date().getHours()))}{user?.name ? `, ${user.name}` : ''}</h1>
    <form className="row" onSubmit={(e) => { void add(e); }}><input className="grow" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('home.quickAdd')} aria-label={t('home.quickAdd')} maxLength={500} /><button className="btn primary">{t('common.add')}</button></form>
    {!d ? <Skeleton /> : (<>
      <div className="grid stats">
        <div className="card stat"><span>{t('home.today')}</span><strong>{d.today.length}</strong></div>
        <div className="card stat"><span>{t('home.overdue')}</span><strong className={d.overdue.length ? 'bad' : ''}>{d.overdue.length}</strong></div>
        <div className="card stat"><span>{t('home.upcoming')}</span><strong>{d.upcoming.length}</strong></div>
        <div className="card stat"><span>{t('home.progress')}</span><strong>{pct}%</strong><div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div></div></div>
      <section className="card"><div className="row between"><h2>{t('home.todaysTasks')}</h2><button className="link" onClick={() => go('tasks')}>{t('common.viewAll')}</button></div>
        {d.today.length === 0 ? <Empty title={t('home.nothingToday')} hint={t('home.nothingTodayHint')} /> :
          d.today.slice(0, 6).map((k) => <label key={k.id} className="check-row"><input type="checkbox" onChange={() => { void setTaskCompleted(ctx, k.id, true); }} /><span>{k.title}</span></label>)}</section>
      <section className="card"><div className="row between"><h2>{t('home.recentNotes')}</h2><button className="link" onClick={() => go('notes')}>{t('common.viewAll')}</button></div>
        {d.notes.length === 0 ? <Empty title={t('notes.empty')} /> : <div className="grid notes-grid">{d.notes.map((n) => <div key={n.id} className="note-mini" style={n.color ? { background: n.color, color: '#1c1917' } : undefined}><strong>{n.title || t('notes.untitled')}</strong><p>{n.body_text.slice(0, 80)}</p></div>)}</div>}</section></>)}
  </div>);
}
