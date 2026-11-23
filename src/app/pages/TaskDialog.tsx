import { listProjects } from '../../core/data/projects.ts';
import { useQuery } from '../hooks.ts';
import { useEffect, useState } from 'react';
import { addSubtask, archiveTask, createTask, getTask, getTaskReminder, listSubtasks, removeSubtask, setTaskReminder, toggleSubtask, trashTask, updateTask, type Subtask, type TaskInput } from '../../core/data/tasks.ts';
import { listTags } from '../../core/data/tags.ts';
import { fromLocalInput, localDate, toLocalInput } from '../../core/data/dates.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Dialog, useToast } from '../components/ui.tsx';

const RULES = ['', 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'] as const;
export function TaskDialog({ taskId, onClose }: { taskId: string | null; onClose(): void }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast();
  const projects = useQuery(ctx, () => listProjects(ctx, new Date().toISOString()), []);
  const [f, setF] = useState({ title: '', description: '', priority: 0, project: '', due: '', remind: '', rule: '', labels: '', fav: false, myDay: false, archived: false, trashed: false });
  const [subs, setSubs] = useState<Subtask[]>([]); const [newSub, setNewSub] = useState(''); const [known, setKnown] = useState<string[]>([]); const [id, setId] = useState(taskId);
  useEffect(() => { void (async () => {
    setKnown((await listTags(ctx)).map((x) => x.name)); if (!id) return;
    const k = await getTask(ctx, id); if (!k) return;
    const lbl = (await ctx.db.all<{ name: string }>('SELECT t.name FROM task_tags l JOIN tags t ON t.id=l.tag_id WHERE l.task_id=? AND l.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.name', [id])).map((x) => x.name).join(', ');
    setF({ title: k.title, description: k.description ?? '', priority: k.priority, project: k.project_id ?? '', due: toLocalInput(k.due_at), remind: toLocalInput(await getTaskReminder(ctx, id)), rule: k.recurrence_rule ?? '', labels: lbl, fav: k.is_favorite, myDay: k.is_my_day_date === localDate(new Date()), archived: !!k.archived_at, trashed: !!k.deleted_at });
    setSubs(await listSubtasks(ctx, id));
  })(); }, [ctx, id]);
  const refreshSubs = async (tid: string) => setSubs(await listSubtasks(ctx, tid));
  async function save() {
    try {
      const input: TaskInput = { title: f.title, description: f.description || null, priority: f.priority, project_id: f.project || null, due_at: fromLocalInput(f.due), recurrence_rule: f.rule || null, is_favorite: f.fav, is_my_day_date: f.myDay ? localDate(new Date()) : null, labels: f.labels.split(',').map((s) => s.trim()).filter(Boolean) };
      if (f.rule && !input.due_at) throw new Error(t('tasks.recurNeedsDue'));
      const saved = id ? await updateTask(ctx, id, input) : await createTask(ctx, workspaceId, input);
      await setTaskReminder(ctx, saved.id, fromLocalInput(f.remind));
      if (f.remind && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  }
  async function ensureSaved(): Promise<string | null> { if (id) return id; if (!f.title.trim()) { toast(t('tasks.titleFirst'), 'err'); return null; } const k = await createTask(ctx, workspaceId, { title: f.title }); setId(k.id); return k.id; }
  return (<Dialog title={id ? t('tasks.edit') : t('tasks.new')} onClose={onClose}>
    <div className="form">
      <label>{t('tasks.title')}<input autoFocus value={f.title} maxLength={500} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label>{t('tasks.description')}<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className="row wrap">
        <label>{t('projects.project')}<select value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">{t('projects.none')}</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <label>{t('tasks.priority')}<select value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select></label>
        <label>{t('tasks.due')}<input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        <label>{t('tasks.reminder')}<input type="datetime-local" value={f.remind} onChange={(e) => setF({ ...f, remind: e.target.value })} /></label>
        <label>{t('tasks.repeat')}<select value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value })}>{RULES.map((r) => <option key={r} value={r}>{t(`repeat.${r || 'none'}`)}</option>)}</select></label></div>
      <label>{t('tasks.labels')}<input list="known-labels" value={f.labels} placeholder={t('tasks.labelsHint')} onChange={(e) => setF({ ...f, labels: e.target.value })} /><datalist id="known-labels">{known.map((k) => <option key={k} value={k} />)}</datalist></label>
      <div className="row wrap"><label className="inline"><input type="checkbox" checked={f.myDay} onChange={(e) => setF({ ...f, myDay: e.target.checked })} />{t('tasks.addToMyDay')}</label><label className="inline"><input type="checkbox" checked={f.fav} onChange={(e) => setF({ ...f, fav: e.target.checked })} />{t('tasks.important')}</label></div>
      <fieldset><legend>{t('tasks.checklist')}</legend>
        {subs.map((s) => <div key={s.id} className="row"><label className="inline grow"><input type="checkbox" checked={s.is_done} onChange={(e) => { void toggleSubtask(ctx, s.id, e.target.checked).then(() => refreshSubs(s.task_id)); }} /><span className={s.is_done ? 'done' : ''}>{s.title}</span></label><button className="icon-btn" aria-label={t('common.delete')} onClick={() => { void removeSubtask(ctx, s.id).then(() => refreshSubs(s.task_id)); }}>×</button></div>)}
        <form className="row" onSubmit={(e) => { e.preventDefault(); void (async () => { const tid = await ensureSaved(); if (tid && newSub.trim()) { await addSubtask(ctx, tid, newSub); setNewSub(''); await refreshSubs(tid); } })(); }}><input className="grow" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={t('tasks.addSubtask')} /><button className="btn">{t('common.add')}</button></form></fieldset>
    </div>
    <footer className="dialog-f">
      {id && !f.trashed && <button className="btn" onClick={() => { void archiveTask(ctx, id, !f.archived).then(onClose); }}>{f.archived ? t('tasks.unarchive') : t('tasks.archive')}</button>}
      {id && <button className="btn danger" onClick={() => { void trashTask(ctx, id, !f.trashed).then(onClose); }}>{f.trashed ? t('tasks.restore') : t('tasks.trash')}</button>}
      <span className="grow" /><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={() => { void save(); }}>{t('common.save')}</button></footer>
  </Dialog>);
}
