import { useEffect, useState, type FormEvent } from 'react';
import { bulkApply, createTask, listTasks, reorderTask, setTaskCompleted, updateTask, type BulkAction, type TaskViewName } from '../../core/data/tasks.ts';
import { listProjects } from '../../core/data/projects.ts';
import { listTags } from '../../core/data/tags.ts';
import { dayBounds } from '../../core/data/dates.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Empty, Icon, Skeleton, useToast } from '../components/ui.tsx';
import { TaskDialog } from './TaskDialog.tsx';

const VIEWS: TaskViewName[] = ['my-day', 'all', 'overdue', 'upcoming', 'important', 'completed', 'archived', 'trash'];
export function TasksPage({ initialView, openId, newSignal }: { initialView: TaskViewName; openId?: string; newSignal?: number }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast();
  const [view, setView] = useState<TaskViewName>(initialView); const [search, setSearch] = useState(''); const [priority, setPriority] = useState(''); const [tagId, setTagId] = useState('');
  const [sort, setSort] = useState<'due' | 'priority' | 'created' | 'manual'>('due'); const [quick, setQuick] = useState(''); const [open, setOpen] = useState<string | null | undefined>(undefined);
  useEffect(() => { if (openId) setOpen(openId); }, [openId]);
  useEffect(() => { if (newSignal) setOpen(null); }, [newSignal]);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [dragId, setDragId] = useState<string | null>(null);
  const projects = useQuery(ctx, () => listProjects(ctx, new Date().toISOString()), []);
  const tags = useQuery(ctx, () => listTags(ctx), []);
  const q = useQuery(ctx, () => listTasks(ctx, { view, ...dayBounds(new Date()), sort, ...(priority !== '' ? { priority: Number(priority) } : {}), ...(tagId ? { tagId } : {}), search }), [view, sort, priority, tagId, search]);
  async function add(e: FormEvent) { e.preventDefault(); if (!quick.trim()) return; try { await createTask(ctx, workspaceId, { title: quick, ...(view === 'my-day' ? { is_my_day_date: dayBounds(new Date()).today } : {}), ...(view === 'important' ? { is_favorite: true } : {}) }); setQuick(''); } catch (err) { toast(err instanceof Error ? err.message : String(err), 'err'); } }
  const ids = (q.data ?? []).map((k) => k.id); const manual = sort === 'manual' && view !== 'trash';
  const toggle = (id: string) => setSel((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function bulk(a: BulkAction) { try { const r = await bulkApply(ctx, [...sel], a); setSel(new Set()); toast(r.failed.length ? t('bulk.partial', { ok: r.ok, failed: r.failed.length }) : t('bulk.done', { n: r.ok }), r.failed.length ? 'err' : 'ok'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); } }
  const move = (id: string, to: number) => { void reorderTask(ctx, ids, id, to).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err')); };
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
      <>{sel.size > 0 && <div className="card row wrap bulk" role="toolbar" aria-label={t('bulk.title')}><strong>{t('bulk.selected', { n: sel.size })}</strong>
        <button className="btn" onClick={() => { void bulk({ kind: 'complete', done: true }); }}>{t('bulk.complete')}</button>
        <select aria-label={t('tasks.priority')} value="" onChange={(e) => { if (e.target.value !== '') void bulk({ kind: 'priority', value: Number(e.target.value) }); }}><option value="">{t('bulk.priority')}</option>{[0, 1, 2, 3, 4].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select>
        <select aria-label={t('projects.project')} value="" onChange={(e) => { if (e.target.value !== '') void bulk({ kind: 'project', projectId: e.target.value === '-' ? null : e.target.value }); }}><option value="">{t('bulk.project')}</option><option value="-">{t('projects.none')}</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <button className="btn" onClick={() => { void bulk({ kind: 'archive' }); }}>{t('bulk.archive')}</button>
        <button className="btn danger" onClick={() => { if (window.confirm(t('bulk.confirmDelete', { n: sel.size }))) void bulk({ kind: 'delete' }); }}>{t('common.delete')}</button>
        <button className="link" onClick={() => setSel(new Set())}>{t('common.cancel')}</button></div>}
      <ul className="list">{q.data!.map((k, idx) => (
        <li key={k.id} draggable={manual} onDragStart={() => setDragId(k.id)} onDragOver={(e) => { if (manual && dragId) e.preventDefault(); }} onDrop={() => { if (manual && dragId && dragId !== k.id) move(dragId, idx); setDragId(null); }} onDragEnd={() => setDragId(null)}
          className={`task p${k.priority}${k.status === 'completed' ? ' is-done' : ''}${dragId === k.id ? ' dragging' : ''}`}>
          <input type="checkbox" className="cb sel" checked={sel.has(k.id)} aria-label={t('bulk.select', { title: k.title })} onChange={() => toggle(k.id)} />
          {manual && <span className="row"><button className="icon-btn" aria-label={t('tasks.moveUp')} disabled={idx === 0} onClick={() => move(k.id, idx - 1)}>↑</button><button className="icon-btn" aria-label={t('tasks.moveDown')} disabled={idx === ids.length - 1} onClick={() => move(k.id, idx + 1)}>↓</button></span>}
          <input type="checkbox" className="cb" checked={k.status === 'completed'} aria-label={k.title} disabled={view === 'trash'} onChange={(e) => { void setTaskCompleted(ctx, k.id, e.target.checked); }} />
          <button className="task-main" onClick={() => setOpen(k.id)}><span className="task-title">{k.title}</span>
            <span className="meta">{k.due_at && <span className={k.status !== 'completed' && k.due_at < new Date().toISOString() ? 'bad' : ''}>{fmt(k.due_at)}</span>}{k.recurrence_rule && <span>↻</span>}{k.subtasksTotal > 0 && <span>{k.subtasksDone}/{k.subtasksTotal}</span>}{k.priority > 0 && <span className="prio">{t(`priority.${k.priority}`)}</span>}{k.labels.map((l) => <span key={l.id} className="chip">{l.name}</span>)}</span></button>
          <button className={`icon-btn${k.is_favorite ? ' on' : ''}`} aria-pressed={k.is_favorite} aria-label={t('tasks.important')} onClick={() => { void updateTask(ctx, k.id, { is_favorite: !k.is_favorite }); }}><Icon name="star" /></button>
        </li>))}</ul></>}
    {open !== undefined && <TaskDialog taskId={open} onClose={() => setOpen(undefined)} />}
  </div>);
}
