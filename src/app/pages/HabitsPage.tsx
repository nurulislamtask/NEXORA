import { useState, type FormEvent } from 'react';
import { archiveHabit, createHabit, deleteHabit, listHabits, setHabitDone } from '../../core/data/habits.ts';
import { localDate } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { useSettings } from '../store.ts';
import { Empty, Skeleton, useToast } from '../components/ui.tsx';

const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function HabitsPage() {
  const t = useT(); const { ctx } = useRuntime(); const toast = useToast(); const { locale } = useSettings();
  const [name, setName] = useState(''); const [freq, setFreq] = useState<'daily' | 'weekdays' | 'weekends' | 'custom'>('daily'); const [days, setDays] = useState<number[]>([1, 3, 5]);
  const today = localDate(new Date()); const q = useQuery(ctx, () => listHabits(ctx, today), [today]);
  const weekday = (i: number) => new Date(2024, 0, 7 + i).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short' });
  const rule = freq === 'daily' ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${(freq === 'weekdays' ? [1, 2, 3, 4, 5] : freq === 'weekends' ? [0, 6] : [...days].sort()).map((d) => DAY[d]).join(',')}`;
  async function add(e: FormEvent) { e.preventDefault(); try { if (freq === 'custom' && !days.length) throw new Error(t('habits.pickDays')); await createHabit(ctx, { name, frequency_rule: rule }); setName(''); } catch (err) { toast(err instanceof Error ? err.message : String(err), 'err'); } }
  const list = q.data ?? []; const sched = list.filter((h) => h.scheduledToday); const doneN = sched.filter((h) => h.doneToday).length;
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.habits')}</h1>{sched.length > 0 && <span className="chip">{t('habits.todayProgress', { done: doneN, total: sched.length })}</span>}</div>
    <form className="card stack" onSubmit={(e) => { void add(e); }}><h2>{t('habits.new')}</h2>
      <div className="row wrap"><input className="grow" value={name} maxLength={120} placeholder={t('habits.name')} aria-label={t('habits.name')} onChange={(e) => setName(e.target.value)} />
        <select value={freq} aria-label={t('habits.repeats')} onChange={(e) => setFreq(e.target.value as typeof freq)}>{(['daily', 'weekdays', 'weekends', 'custom'] as const).map((f) => <option key={f} value={f}>{t(`habits.freq.${f}`)}</option>)}</select><button className="btn primary" disabled={!name.trim()}>{t('common.add')}</button></div>
      {freq === 'custom' && <div className="row wrap" role="group" aria-label={t('habits.days')}>{DAY.map((_, i) => <label key={i} className="inline"><input type="checkbox" checked={days.includes(i)} onChange={(e) => setDays(e.target.checked ? [...days, i] : days.filter((d) => d !== i))} />{weekday(i)}</label>)}</div>}</form>
    {q.loading && !q.data ? <Skeleton /> : list.length === 0 ? <Empty title={t('habits.empty')} hint={t('habits.emptyHint')} /> :
      <ul className="list">{list.map((h) => (
        <li key={h.id} className="card habit"><div className="row between"><label className="inline"><input type="checkbox" className="cb" checked={h.doneToday} disabled={!h.scheduledToday} aria-label={h.name} onChange={(e) => { void setHabitDone(ctx, h.id, today, e.target.checked); }} /><strong>{h.name}</strong></label>
          <span className="row"><button className="link" onClick={() => { void archiveHabit(ctx, h.id); }}>{t('tasks.archive')}</button><button className="link" onClick={() => { void deleteHabit(ctx, h.id); }}>{t('common.delete')}</button></span></div>
          <div className="meta"><span>{t('habits.streak', { n: h.streak })}</span><span>{t('habits.longest', { n: h.longest })}</span><span>{t('habits.last30', { n: h.completions30 })}</span>{!h.scheduledToday && <span className="chip">{t('habits.restDay')}</span>}</div>
          <div className="strip" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return <i key={i} className={h.history.includes(localDate(d)) ? 'on' : ''} />; })}</div></li>))}</ul>}
  </div>);
}
