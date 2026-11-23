import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { PROJECTS, TASKS } from '../sync/entities.ts';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'on_hold', 'completed', 'archived'];
export interface ProjectInput { title: string; description?: string | null; color?: string | null; start_date?: string | null; deadline?: string | null; status?: ProjectStatus }
export interface Project { id: string; workspace_id: string; title: string; description: string | null; color: string | null; start_date: string | null; deadline: string | null; status: ProjectStatus }
export interface ProjectView extends Project { total: number; done: number; open: number; overdue: number; percent: number }
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validate(i: Partial<ProjectInput>): void {
  if (i.title !== undefined && (i.title.trim().length < 1 || i.title.length > 200)) throw new Error('Project title must be 1-200 characters');
  for (const k of ['start_date', 'deadline'] as const) { const v = i[k]; if (v && (!DATE.test(v) || Number.isNaN(Date.parse(v)))) throw new Error('Invalid project date'); }
  if (i.start_date && i.deadline && i.deadline < i.start_date) throw new Error('Deadline is before the start date');
  if (i.status !== undefined && !PROJECT_STATUSES.includes(i.status)) throw new Error('Invalid project status');
}
export async function createProject(ctx: Ctx, workspaceId: string, input: ProjectInput): Promise<Project> {
  validate(input);
  const row: Row = { id: ctx.uuid(), workspace_id: workspaceId, title: input.title.trim(), description: input.description ?? null, cover_path: null, icon: null, color: input.color ?? null, start_date: input.start_date ?? null, deadline: input.deadline ?? null, status: input.status ?? 'active', archived_at: null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, PROJECTS, row); return row as unknown as Project;
}
export async function updateProject(ctx: Ctx, id: string, patch: Partial<ProjectInput>): Promise<void> {
  const cur = await getRow(ctx, PROJECTS, { id }); if (!cur) throw new Error('Project not found');
  validate({ start_date: cur['start_date'] as string | null, deadline: cur['deadline'] as string | null, ...patch });
  await putLocal(ctx, PROJECTS, { ...cur, ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(patch.status ? { archived_at: patch.status === 'archived' ? ctx.now() : null } : {}) });
}
/** Deleting a project keeps its tasks: they become project-less (same as the cloud's ON DELETE SET NULL, but done explicitly so it syncs). */
export async function deleteProject(ctx: Ctx, id: string): Promise<void> {
  const cur = await getRow(ctx, PROJECTS, { id }); if (!cur) return;
  for (const t of await ctx.db.all('SELECT * FROM tasks WHERE project_id=? AND deleted_at IS NULL', [id])) await putLocal(ctx, TASKS, { ...t, project_id: null }, { silent: true });
  await putLocal(ctx, PROJECTS, { ...cur, deleted_at: ctx.now() });
}
export async function setTaskProject(ctx: Ctx, taskId: string, projectId: string | null): Promise<void> {
  const t = await getRow(ctx, TASKS, { id: taskId }); if (!t) throw new Error('Task not found');
  if (projectId && !(await getRow(ctx, PROJECTS, { id: projectId }))) throw new Error('Project not found');
  await putLocal(ctx, TASKS, { ...t, project_id: projectId });
}
export async function listProjects(ctx: Ctx, nowIso: string, includeArchived = false): Promise<ProjectView[]> {
  const rows = await ctx.db.all<Project>(`SELECT * FROM projects WHERE deleted_at IS NULL ${includeArchived ? '' : "AND status<>'archived'"} ORDER BY (deadline IS NULL), deadline, created_at DESC`);
  const stats = await ctx.db.all<{ project_id: string; total: number; done: number; overdue: number }>(
    `SELECT project_id, COUNT(*) total, SUM(status='completed') done, SUM(status NOT IN ('completed','cancelled') AND due_at IS NOT NULL AND due_at<?) overdue FROM tasks WHERE deleted_at IS NULL AND archived_at IS NULL AND status<>'cancelled' AND project_id IS NOT NULL GROUP BY project_id`, [nowIso]);
  const m = new Map(stats.map((s) => [s.project_id, s]));
  return rows.map((p) => { const s = m.get(p.id); const total = s?.total ?? 0; const done = Number(s?.done ?? 0);
    return { ...p, total, done, open: total - done, overdue: Number(s?.overdue ?? 0), percent: total === 0 ? 0 : Math.round((done / total) * 100) }; });
}
