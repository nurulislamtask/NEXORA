import { useState, type FormEvent } from 'react';
import { createTask, listTasks, setTaskCompleted } from '../../core/data/tasks.ts';
import { listNotes } from '../../core/data/notes.ts';
import { dayBounds, greetingKey } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { useSettings } from '../store.ts';
import { Empty, Icon, Skeleton, useToast } from '../components/ui.tsx';

function Ring({ pct }: { pct: number }) {
  const r = 44; const c = 2 * Math.PI * r;
  return <svg className="ring" width="112" height="112" viewBox="0 0 112 112" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><defs><linearGradient id="nx-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--nx-primary)" /><stop offset="1" stopColor="var(--nx-accent)" /></linearGradient></defs>
    <circle cx="56" cy="56" r={r} className="ring-bg" /><circle cx="56" cy="56" r={r} className="ring-fg" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 56 56)" /><text x="56" y="62" textAnchor="middle" className="ring-t">{pct}%</text></svg>;
}
export function Dashboard({ go }: { go(p: 'tasks' | 'notes'): void }) {
  const t = useT(); const { locale } = useSettings(); const { ctx, workspaceId, user } = useRuntime(); const toast = useToast(); const [quick, setQuick] = useState('');
  const b = dayBounds(new Date());
  const q = useQuery(ctx, async () => {
    const base = { ...b, sort: 'due' as const };
    const [today, overdue, upcoming, done, notes] = await Promise.all([listTasks(ctx, { ...base, view: 'my-day' }), listTasks(ctx, { ...base, view: 'overdue' }), listTasks(ctx, { ...base, view: 'upcoming' }), listTasks(ctx, { ...base, view: 'completed', sort: 'created' }), listNotes(ctx, { view: 'active' })]);
    return { today, overdue, upcoming, doneToday: done.filter((x) => x.completed_at && x.completed_at >= b.dayStartIso && x.completed_at < b.dayEndIso).length, notes: notes.slice(0, 4) };
  }, [b.today]);
  async function add(e: FormEvent) { e.preventDefault(); if (!quick.trim()) return; try { await createTask(ctx, workspaceId, { title: quick, is_my_day_date: b.today }); setQuick(''); } catch (err) { toast(err instanceof Error ? err.message : String(err), 'err'); } }
  const d = q.data; const total = d ? d.today.length + d.doneToday : 0; const pct = total ? Math.round((d!.doneToday / total) * 100) : 0;
  return (<div className="stack">
    <section className="hero">
      <div className="hero-main stack">
        <p className="eyebrow">{new Date().toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{t(greetingKey(new Date().getHours()))}{user?.name ? `, ${user.name}` : ''}</h1>
        {d && <p className="sub">{t('home.summary', { n: d.today.length, done: d.doneToday })}</p>}
        <form className="quick" onSubmit={(e) => { void add(e); }}><Icon name="plus" /><input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('home.quickAdd')} aria-label={t('home.quickAdd')} maxLength={500} /><button className="btn primary" disabled={!quick.trim()}>{t('common.add')}</button></form></div>
      {d && <Ring pct={pct} />}</section>
    {!d ? <Skeleton /> : (<>
      <div className="grid stats">
        <div className="card stat"><span className="stat-ic tone-1"><Icon name="sun" /></span><span>{t('home.today')}</span><strong>{d.today.length}</strong></div>
        <div className="card stat"><span className="stat-ic tone-bad"><Icon name="alert" /></span><span>{t('home.overdue')}</span><strong className={d.overdue.length ? 'bad' : ''}>{d.overdue.length}</strong></div>
        <div className="card stat"><span className="stat-ic tone-2"><Icon name="calendar" /></span><span>{t('home.upcoming')}</span><strong>{d.upcoming.length}</strong></div>
        <div className="card stat"><span className="stat-ic tone-ok"><Icon name="check" /></span><span>{t('home.doneToday')}</span><strong>{d.doneToday}</strong></div></div>
      <section className="card"><div className="row between"><h2>{t('home.todaysTasks')}</h2><button className="link" onClick={() => go('tasks')}>{t('common.viewAll')}</button></div>
        {d.today.length === 0 ? <Empty title={t('home.nothingToday')} hint={t('home.nothingTodayHint')} /> :
          d.today.slice(0, 6).map((k) => <label key={k.id} className="check-row"><input type="checkbox" className="cb" onChange={() => { void setTaskCompleted(ctx, k.id, true); }} /><span>{k.title}</span></label>)}</section>
      <section className="card"><div className="row between"><h2>{t('home.recentNotes')}</h2><button className="link" onClick={() => go('notes')}>{t('common.viewAll')}</button></div>
        {d.notes.length === 0 ? <Empty title={t('notes.empty')} /> : <div className="grid notes-grid">{d.notes.map((n) => <div key={n.id} className="note-mini" style={n.color ? { background: n.color, color: '#1c1917' } : undefined}><strong>{n.title || t('notes.untitled')}</strong><p>{n.body_text.slice(0, 80)}</p></div>)}</div>}</section></>)}
  </div>);
}
