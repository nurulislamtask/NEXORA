import { useState, type FormEvent } from 'react';
import { createTask, listTasks, setTaskCompleted, updateTask, type TaskViewName } from '../../core/data/tasks.ts';
import { listTags } from '../../core/data/tags.ts';
import { dayBounds } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Empty, Icon, Skeleton, useToast } from '../components/ui.tsx';
import { TaskDialog } from './TaskDialog.tsx';

const VIEWS: TaskViewName[] = ['my-day', 'all', 'overdue', 'upcoming', 'important', 'completed', 'archived', 'trash'];
export function TasksPage({ initialView }: { initialView: TaskViewName }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast();
  const [view, setView] = useState<TaskViewName>(initialView); const [search, setSearch] = useState(''); const [priority, setPriority] = useState(''); const [tagId, setTagId] = useState('');
  const [sort, setSort] = useState<'due' | 'priority' | 'created' | 'manual'>('due'); const [quick, setQuick] = useState(''); const [open, setOpen] = useState<string | null | undefined>(undefined);
  const tags = useQuery(ctx, () => listTags(ctx), []);
  const q = useQuery(ctx, () => listTasks(ctx, { view, ...dayBounds(new Date()), sort, ...(priority !== '' ? { priority: Number(priority) } : {}), ...(tagId ? { tagId } : {}), search }), [view, sort, priority, tagId, search]);
  async function add(e: FormEvent) { e.preventDefault(); if (!quick.trim()) return; try { await createTask(ctx, workspaceId, { title: quick, ...(view === 'my-day' ? { is_my_day_date: dayBounds(new Date()).today } : {}), ...(view === 'important' ? { is_favorite: true } : {}) }); setQuick(''); } catch (err) { toast(err instanceof Error ? err.message : String(err), 'err'); } }
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.tasks')}</h1><button className="btn primary" onClick={() => setOpen(null)}><Icon name="plus" /> {t('tasks.new')}</button></div>
    <div className="tabs" role="tablist" aria-label={t('tasks.views')}>{VIEWS.map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t(`view.${v}`)}</button>)}</div>
    <div className="row wrap">
      <div className="search grow"><Icon name="search" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} /></div>
      <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label={t('tasks.priority')}><option value="">{t('tasks.anyPriority')}</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select>
      <select value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label={t('tasks.labels')}><option value="">{t('tasks.anyLabel')}</option>{(tags.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('common.sort')}>{(['due', 'priority', 'created', 'manual'] as const).map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}</select></div>
    {(view === 'all' || view === 'my-day' || view === 'important') && <form className="row" onSubmit={(e) => { void add(e); }}><input className="grow" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('home.quickAdd')} aria-label={t('home.quickAdd')} maxLength={500} /><button className="btn">{t('common.add')}</button></form>}
    {q.loading && !q.data ? <Skeleton rows={4} /> : q.error ? <p className="note err" role="alert">{q.error}</p> : q.data!.length === 0 ? <Empty title={t('tasks.empty')} hint={search ? t('common.noResults') : t('tasks.emptyHint')} /> :
      <ul className="list">{q.data!.map((k) => (
        <li key={k.id} className={`task p${k.priority}${k.status === 'completed' ? ' is-done' : ''}`}>
          <input type="checkbox" className="cb" checked={k.status === 'completed'} aria-label={k.title} disabled={view === 'trash'} onChange={(e) => { void setTaskCompleted(ctx, k.id, e.target.checked); }} />
          <button className="task-main" onClick={() => setOpen(k.id)}><span className="task-title">{k.title}</span>
            <span className="meta">{k.due_at && <span className={k.status !== 'completed' && k.due_at < new Date().toISOString() ? 'bad' : ''}>{fmt(k.due_at)}</span>}{k.recurrence_rule && <span>↻</span>}{k.subtasksTotal > 0 && <span>{k.subtasksDone}/{k.subtasksTotal}</span>}{k.priority > 0 && <span className="prio">{t(`priority.${k.priority}`)}</span>}{k.labels.map((l) => <span key={l.id} className="chip">{l.name}</span>)}</span></button>
          <button className={`icon-btn${k.is_favorite ? ' on' : ''}`} aria-pressed={k.is_favorite} aria-label={t('tasks.important')} onClick={() => { void updateTask(ctx, k.id, { is_favorite: !k.is_favorite }); }}><Icon name="star" /></button>
        </li>))}</ul>}
    {open !== undefined && <TaskDialog taskId={open} onClose={() => setOpen(undefined)} />}
  </div>);
}
