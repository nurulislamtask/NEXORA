import type { Ctx } from './ctx.ts';
import type { Param, Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { searchIds } from './searchIndex.ts';
import { labelsFor, setLinks, type Tag } from './tags.ts';
import { nextOccurrence } from './recurrence.ts';
import { REMINDERS, SUBTASKS, TASKS, TASK_TAGS } from '../sync/entities.ts';

export interface Task {
  id: string; workspace_id: string; title: string; description: string | null; priority: number; status: string;
  due_at: string | null; completed_at: string | null; recurrence_rule: string | null; is_favorite: boolean; is_my_day_date: string | null;
  archived_at: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}
export interface TaskView extends Task { labels: Tag[]; subtasksTotal: number; subtasksDone: number }
export interface TaskInput { title: string; description?: string | null; priority?: number; due_at?: string | null; recurrence_rule?: string | null; is_favorite?: boolean; is_my_day_date?: string | null; labels?: string[] }

const fromDb = (r: Row): Task => ({ ...(r as unknown as Task), is_favorite: Number(r['is_favorite']) === 1 });
function validate(i: Partial<TaskInput>): void {
  if (i.title !== undefined) { const t = i.title.trim(); if (t.length < 1 || t.length > 500) throw new Error('Title must be 1-500 characters'); }
  if (i.priority !== undefined && (!Number.isInteger(i.priority) || i.priority < 0 || i.priority > 4)) throw new Error('Priority must be 0-4');
  if (i.due_at && Number.isNaN(Date.parse(i.due_at))) throw new Error('Invalid due date');
  if (i.recurrence_rule) { void nextOccurrence(i.recurrence_rule, new Date()); }
}

export async function getTask(ctx: Ctx, id: string): Promise<Task | null> { const r = await getRow(ctx, TASKS, { id }); return r ? fromDb(r) : null; }

export async function createTask(ctx: Ctx, workspaceId: string, input: TaskInput): Promise<Task> {
  validate(input);
  const row: Row = { id: ctx.uuid(), workspace_id: workspaceId, project_id: null, parent_task_id: null, title: input.title.trim(), description: input.description ?? null,
    priority: input.priority ?? 0, status: 'not_started', due_at: input.due_at ?? null, completed_at: null, recurrence_rule: input.recurrence_rule ?? null,
    is_favorite: input.is_favorite ?? false, is_my_day_date: input.is_my_day_date ?? null, sort_order: Date.now(), archived_at: null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, TASKS, row);
  if (input.labels?.length) await setLinks(ctx, { def: TASK_TAGS, ownerKey: 'task_id' }, String(row['id']), input.labels);
  return fromDb(row);
}

export async function updateTask(ctx: Ctx, id: string, patch: Partial<TaskInput>): Promise<Task> {
  validate(patch);
  const cur = await getRow(ctx, TASKS, { id }); if (!cur) throw new Error('Task not found');
  const { labels, ...rest } = patch;
  const next = { ...cur, ...rest, ...(rest.title !== undefined ? { title: rest.title.trim() } : {}) };
  await putLocal(ctx, TASKS, next);
  if (labels) await setLinks(ctx, { def: TASK_TAGS, ownerKey: 'task_id' }, id, labels);
  return fromDb(next);
}

/** Completing a recurring task schedules the next occurrence (labels carried over, subtasks reset). */
export async function setTaskCompleted(ctx: Ctx, id: string, done: boolean): Promise<{ task: Task; next: Task | null }> {
  const cur = await getRow(ctx, TASKS, { id }); if (!cur) throw new Error('Task not found');
  const already = cur['status'] === 'completed';
  const row = await putLocal(ctx, TASKS, { ...cur, status: done ? 'completed' : 'not_started', completed_at: done ? ctx.now() : null });
  let next: Task | null = null;
  if (done && !already && cur['recurrence_rule'] && cur['due_at']) {
    const n = nextOccurrence(String(cur['recurrence_rule']), new Date(String(cur['due_at'])));
    if (n) {
      const labels = (await labelsFor(ctx, 'task_tags', 'task_id', [id])).get(id) ?? [];
      next = await createTask(ctx, String(cur['workspace_id']), { title: String(cur['title']), description: cur['description'] as string | null, priority: Number(cur['priority']), due_at: n.toISOString(), recurrence_rule: String(cur['recurrence_rule']), labels: labels.map((l) => l.name) });
      for (const s of await listSubtasks(ctx, id)) await addSubtask(ctx, next.id, s.title);
    }
  }
  return { task: fromDb(row), next };
}
export const archiveTask = async (ctx: Ctx, id: string, on = true): Promise<void> => { const c = await getRow(ctx, TASKS, { id }); if (c) await putLocal(ctx, TASKS, { ...c, archived_at: on ? ctx.now() : null }); };
export const trashTask = async (ctx: Ctx, id: string, on = true): Promise<void> => { const c = await getRow(ctx, TASKS, { id }); if (c) await putLocal(ctx, TASKS, { ...c, deleted_at: on ? ctx.now() : null }); };

// ---- subtasks / checklist ----
export interface Subtask { id: string; task_id: string; title: string; is_done: boolean; sort_order: number }
export async function listSubtasks(ctx: Ctx, taskId: string): Promise<Subtask[]> {
  const r = await ctx.db.all('SELECT * FROM subtasks WHERE task_id=? AND deleted_at IS NULL ORDER BY sort_order, created_at', [taskId]);
  return r.map((x) => ({ id: String(x['id']), task_id: taskId, title: String(x['title']), is_done: Number(x['is_done']) === 1, sort_order: Number(x['sort_order']) }));
}
export async function addSubtask(ctx: Ctx, taskId: string, title: string): Promise<Subtask> {
  const t = title.trim(); if (!t || t.length > 500) throw new Error('Subtask title must be 1-500 characters');
  const row: Row = { id: ctx.uuid(), task_id: taskId, title: t, is_done: false, sort_order: Date.now(), created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, SUBTASKS, row);
  return { id: String(row['id']), task_id: taskId, title: t, is_done: false, sort_order: Number(row['sort_order']) };
}
export async function toggleSubtask(ctx: Ctx, id: string, done: boolean): Promise<void> { const c = await getRow(ctx, SUBTASKS, { id }); if (c) await putLocal(ctx, SUBTASKS, { ...c, is_done: done }); }
export async function removeSubtask(ctx: Ctx, id: string): Promise<void> { const c = await getRow(ctx, SUBTASKS, { id }); if (c) await putLocal(ctx, SUBTASKS, { ...c, deleted_at: ctx.now() }); }

// ---- reminders ----
export async function setTaskReminder(ctx: Ctx, taskId: string, remindAt: string | null): Promise<void> {
  if (remindAt && Number.isNaN(Date.parse(remindAt))) throw new Error('Invalid reminder time');
  const task = await getRow(ctx, TASKS, { id: taskId }); if (!task) throw new Error('Task not found');
  for (const r of await ctx.db.all('SELECT * FROM reminders WHERE target_type=? AND target_id=? AND deleted_at IS NULL', ['task', taskId])) await putLocal(ctx, REMINDERS, { ...r, deleted_at: ctx.now() });
  if (remindAt) await putLocal(ctx, REMINDERS, { id: ctx.uuid(), target_type: 'task', target_id: taskId, title: task['title'], remind_at: remindAt, repeat_rule: null, snoozed_until: null, fired_at: null, created_at: ctx.now(), deleted_at: null, version: 0 });
}
export async function getTaskReminder(ctx: Ctx, taskId: string): Promise<string | null> {
  return (await ctx.db.all<{ remind_at: string }>('SELECT remind_at FROM reminders WHERE target_type=? AND target_id=? AND deleted_at IS NULL AND fired_at IS NULL LIMIT 1', ['task', taskId]))[0]?.remind_at ?? null;
}
export interface DueReminder { id: string; target_id: string | null; title: string }
export async function dueReminders(ctx: Ctx, nowIso: string): Promise<DueReminder[]> {
  return ctx.db.all<DueReminder>(`SELECT r.id, r.target_id, COALESCE(t.title, r.title, '') AS title FROM reminders r LEFT JOIN tasks t ON t.id=r.target_id
    WHERE r.deleted_at IS NULL AND r.fired_at IS NULL AND r.remind_at<=? AND (r.snoozed_until IS NULL OR r.snoozed_until<=?) AND (t.id IS NULL OR (t.deleted_at IS NULL AND t.status<>'completed')) ORDER BY r.remind_at`, [nowIso, nowIso]);
}
export async function markReminderFired(ctx: Ctx, id: string): Promise<void> { const r = await getRow(ctx, REMINDERS, { id }); if (r) await putLocal(ctx, REMINDERS, { ...r, fired_at: ctx.now() }); }
export async function snoozeReminder(ctx: Ctx, id: string, untilIso: string): Promise<void> { const r = await getRow(ctx, REMINDERS, { id }); if (r) await putLocal(ctx, REMINDERS, { ...r, snoozed_until: untilIso }); }

// ---- queries ----
export type TaskViewName = 'all' | 'my-day' | 'overdue' | 'upcoming' | 'important' | 'completed' | 'archived' | 'trash';
export interface TaskQuery { view: TaskViewName; nowIso: string; today: string; dayStartIso: string; dayEndIso: string; priority?: number; tagId?: string; search?: string; sort?: 'due' | 'priority' | 'created' | 'manual' }

export async function listTasks(ctx: Ctx, q: TaskQuery): Promise<TaskView[]> {
  const w: string[] = []; const p: Param[] = [];
  const open = "status NOT IN ('completed','cancelled')";
  switch (q.view) {
    case 'trash': w.push('deleted_at IS NOT NULL'); break;
    case 'archived': w.push('deleted_at IS NULL', 'archived_at IS NOT NULL'); break;
    case 'completed': w.push('deleted_at IS NULL', 'archived_at IS NULL', "status='completed'"); break;
    case 'overdue': w.push('deleted_at IS NULL', 'archived_at IS NULL', open, 'due_at IS NOT NULL', 'due_at < ?'); p.push(q.nowIso); break;
    case 'upcoming': w.push('deleted_at IS NULL', 'archived_at IS NULL', open, 'due_at >= ?'); p.push(q.dayEndIso); break;
    case 'important': w.push('deleted_at IS NULL', 'archived_at IS NULL', open, 'is_favorite=1'); break;
    case 'my-day': w.push('deleted_at IS NULL', 'archived_at IS NULL', open, '(is_my_day_date = ? OR (due_at >= ? AND due_at < ?))'); p.push(q.today, q.dayStartIso, q.dayEndIso); break;
    default: w.push('deleted_at IS NULL', 'archived_at IS NULL', open);
  }
  if (q.priority !== undefined) { w.push('priority=?'); p.push(q.priority); }
  if (q.tagId) { w.push('id IN (SELECT task_id FROM task_tags WHERE tag_id=? AND deleted_at IS NULL)'); p.push(q.tagId); }
  if (q.search?.trim()) {
    const ids = await searchIds(ctx, 'task', q.search);
    if (!ids.length) return [];
    w.push(`id IN (${ids.map(() => '?').join(',')})`); p.push(...ids);
  }
  const order = { due: 'due_at IS NULL, due_at', priority: 'priority DESC, due_at IS NULL, due_at', created: 'created_at DESC', manual: 'sort_order DESC' }[q.sort ?? 'due'];
  const tasks = (await ctx.db.all(`SELECT * FROM tasks WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT 1000`, p)).map(fromDb);
  const ids = tasks.map((t) => t.id);
  const labels = await labelsFor(ctx, 'task_tags', 'task_id', ids);
  const counts = new Map<string, { total: number; done: number }>();
  if (ids.length) for (const r of await ctx.db.all<{ task_id: string; total: number; done: number }>(`SELECT task_id, COUNT(*) AS total, SUM(is_done) AS done FROM subtasks WHERE deleted_at IS NULL AND task_id IN (${ids.map(() => '?').join(',')}) GROUP BY task_id`, ids)) counts.set(r.task_id, { total: r.total, done: Number(r.done) });
  return tasks.map((t) => ({ ...t, labels: labels.get(t.id) ?? [], subtasksTotal: counts.get(t.id)?.total ?? 0, subtasksDone: counts.get(t.id)?.done ?? 0 }));
}
