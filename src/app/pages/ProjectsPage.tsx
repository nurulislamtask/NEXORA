import { useState, type FormEvent } from 'react';
import { PROJECT_STATUSES, createProject, deleteProject, listProjects, updateProject, type ProjectStatus } from '../../core/data/projects.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Empty, Skeleton, useToast } from '../components/ui.tsx';

export function ProjectsPage({ openTasks }: { openTasks?: () => void }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast();
  const [title, setTitle] = useState(''); const [deadline, setDeadline] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const q = useQuery(ctx, () => listProjects(ctx, new Date().toISOString(), showArchived), [showArchived]);
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err');
  async function add(e: FormEvent) { e.preventDefault(); try { await createProject(ctx, workspaceId, { title, deadline: deadline || null }); setTitle(''); setDeadline(''); } catch (err) { fail(err); } }
  const list = q.data ?? [];
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.projects')}</h1><label className="inline"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />{t('projects.showArchived')}</label></div>
    <form className="card row wrap" onSubmit={(e) => { void add(e); }}>
      <input className="grow" value={title} maxLength={200} placeholder={t('projects.name')} aria-label={t('projects.name')} onChange={(e) => setTitle(e.target.value)} />
      <label className="inline">{t('projects.deadline')}<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <button className="btn primary" disabled={!title.trim()}>{t('common.add')}</button></form>
    {q.loading && !q.data ? <Skeleton /> : list.length === 0 ? <Empty title={t('projects.empty')} hint={t('projects.emptyHint')} /> :
      <ul className="list">{list.map((p) => (<li key={p.id} className="card stack">
        <div className="row between"><strong>{p.title}</strong>
          <select value={p.status} aria-label={t('projects.status')} onChange={(e) => { void updateProject(ctx, p.id, { status: e.target.value as ProjectStatus }).catch(fail); }}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{t(`projects.status.${s}`)}</option>)}</select></div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-label={p.title}><i style={{ width: `${p.percent}%` }} /></div>
        <div className="meta"><span>{t('projects.progress', { done: p.done, total: p.total })}</span>{p.overdue > 0 && <span className="chip err">{t('projects.overdue', { n: p.overdue })}</span>}{p.deadline && <span>{t('projects.due', { date: p.deadline })}</span>}</div>
        <div className="row">{openTasks && <button className="link" onClick={openTasks}>{t('nav.tasks')}</button>}<button className="link" onClick={() => { if (window.confirm(t('projects.confirmDelete'))) void deleteProject(ctx, p.id).catch(fail); }}>{t('common.delete')}</button></div></li>))}</ul>}
  </div>);
}
