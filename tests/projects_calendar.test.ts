import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './helpers/nodeDb.ts';
import { MemoryRemote } from './helpers/memoryRemote.ts';
import { makeCtx, type Ctx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { createTask, getTask, setTaskCompleted } from '../src/core/data/tasks.ts';
import { createProject, deleteProject, listProjects, setTaskProject, updateProject } from '../src/core/data/projects.ts';
import { calendarItems, createEvent, deleteEvent, monthGrid, updateEvent } from '../src/core/data/calendar.ts';
import { syncOnce } from '../src/core/sync/engine.ts';

async function dev(): Promise<{ ctx: Ctx; ws: string }> { const ctx = makeCtx(openTestDb()); return { ctx, ws: await ensureDefaultWorkspace(ctx, 'u1') }; }

test('projects: progress, overdue, validation, status, delete keeps tasks', async () => {
  const { ctx, ws } = await dev(); const p = await createProject(ctx, ws, { title: ' Launch ', deadline: '2026-07-01' });
  const a = await createTask(ctx, ws, { title: 'a', project_id: p.id, due_at: '2026-06-01T00:00:00.000Z' }); await createTask(ctx, ws, { title: 'b', project_id: p.id }); const c = await createTask(ctx, ws, { title: 'c' });
  await setTaskProject(ctx, c.id, p.id); await setTaskCompleted(ctx, c.id, true);
  let v = (await listProjects(ctx, '2026-06-15T00:00:00.000Z'))[0]!; assert.equal(v.title, 'Launch'); assert.deepEqual([v.total, v.done, v.open, v.overdue, v.percent], [3, 1, 2, 1, 33]);
  await setTaskCompleted(ctx, a.id, true); v = (await listProjects(ctx, '2026-06-15T00:00:00.000Z'))[0]!; assert.equal(v.overdue, 0);
  await assert.rejects(createProject(ctx, ws, { title: '' })); await assert.rejects(createProject(ctx, ws, { title: 'x', deadline: 'soon' }));
  await assert.rejects(createProject(ctx, ws, { title: 'x', start_date: '2026-02-02', deadline: '2026-01-01' })); await assert.rejects(setTaskProject(ctx, a.id, 'nope'));
  await updateProject(ctx, p.id, { status: 'archived' }); assert.equal((await listProjects(ctx, '2026-06-15T00:00:00.000Z')).length, 0); assert.equal((await listProjects(ctx, '2026-06-15T00:00:00.000Z', true)).length, 1);
  await deleteProject(ctx, p.id); assert.equal((await getTask(ctx, a.id))!.project_id, null, 'tasks survive'); assert.equal((await listProjects(ctx, '2026-06-15T00:00:00.000Z', true)).length, 0);
});
test('calendar: month grid, events + due tasks by day, multi-day, recurrence, validation', async () => {
  const g = monthGrid(2026, 5, 0); assert.equal(g.length, 42); assert.equal(g[0], '2026-05-31'); assert.ok(g.includes('2026-06-30')); assert.equal(monthGrid(2026, 5, 1)[0], '2026-06-01');
  const { ctx, ws } = await dev(); const L = (d: string, h = 10) => new Date(2026, Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h).toISOString();
  const e = await createEvent(ctx, ws, { title: 'Standup', starts_at: L('2026-06-15'), recurrence_rule: 'FREQ=WEEKLY' });
  await createEvent(ctx, ws, { title: 'Trip', starts_at: L('2026-06-10', 0), ends_at: L('2026-06-12', 18), all_day: true });
  await createTask(ctx, ws, { title: 'Due', due_at: L('2026-06-15', 14) });
  const m = await calendarItems(ctx, '2026-06-01', '2026-06-30');
  assert.deepEqual(['2026-06-15', '2026-06-22', '2026-06-29'], [...m.keys()].filter((k) => m.get(k)!.some((i) => i.title === 'Standup')).sort());
  assert.deepEqual(m.get('2026-06-15')!.map((i) => i.title), ['Standup', 'Due']);
  assert.deepEqual(['2026-06-10', '2026-06-11', '2026-06-12'], [...m.keys()].filter((k) => m.get(k)!.some((i) => i.title === 'Trip')).sort());
  assert.equal((await calendarItems(ctx, '2026-07-01', '2026-07-05')).size, 0, 'no events there');
  await updateEvent(ctx, e.id, { title: 'Sync' }); await assert.rejects(updateEvent(ctx, e.id, { ends_at: L('2026-06-01') })); await assert.rejects(createEvent(ctx, ws, { title: '', starts_at: L('2026-06-01') }));
  await assert.rejects(createEvent(ctx, ws, { title: 'x', starts_at: 'garbage' })); await deleteEvent(ctx, e.id);
  assert.ok(![...(await calendarItems(ctx, '2026-06-01', '2026-06-30')).values()].flat().some((i) => i.id === e.id));
});
test('projects + calendar sync between two devices', async () => {
  const remote = new MemoryRemote(); const a = await dev(); const b = { ctx: makeCtx(openTestDb()), ws: '' };
  const p = await createProject(a.ctx, a.ws, { title: 'Shared' }); await createTask(a.ctx, a.ws, { title: 't', project_id: p.id }); await createEvent(a.ctx, a.ws, { title: 'Meet', starts_at: '2026-06-15T10:00:00.000Z' });
  await syncOnce(a.ctx, remote); b.ws = await ensureDefaultWorkspace(b.ctx, 'u1'); await syncOnce(b.ctx, remote);
  assert.equal((await listProjects(b.ctx, '2026-06-15T00:00:00.000Z'))[0]?.total, 1); assert.ok((await calendarItems(b.ctx, '2026-06-15', '2026-06-15')).get('2026-06-15')?.some((i) => i.title === 'Meet'));
});
