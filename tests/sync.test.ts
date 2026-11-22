import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './helpers/nodeDb.ts';
import { MemoryRemote } from './helpers/memoryRemote.ts';
import { makeCtx, type Ctx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { createTask, listTasks, setTaskCompleted, updateTask } from '../src/core/data/tasks.ts';
import { createNote, listNotes, updateNote, getNote } from '../src/core/data/notes.ts';
import { syncOnce, pendingCount } from '../src/core/sync/engine.ts';
import { resolve } from '../src/core/sync/conflict.ts';
import { NOTES, TASKS } from '../src/core/sync/entities.ts';
import { SyncError } from '../src/core/sync/types.ts';
import { SyncController, backoffMs } from '../src/core/sync/controller.ts';
import { SupabaseRemote, type SbClient, type SbQuery } from '../src/core/sync/supabaseRemote.ts';
import type { Row } from '../src/core/db/types.ts';

async function device(user = 'u1'): Promise<{ ctx: Ctx; ws: string }> { const ctx = makeCtx(openTestDb()); return { ctx, ws: await ensureDefaultWorkspace(ctx, user) }; }
const Q = { nowIso: '2026-06-15T12:00:00.000Z', today: '2026-06-15', dayStartIso: '2026-06-15T00:00:00.000Z', dayEndIso: '2026-06-16T00:00:00.000Z' };
const all = (ctx: Ctx) => listTasks(ctx, { view: 'all', ...Q });

test('decision table', () => {
  const l = (o = {}) => ({ baseVersion: 3, dirty: true, deleted: false, contentKey: 'a', ...o }); const r = (o = {}) => ({ version: 3, deleted: false, contentKey: 'b', ...o });
  assert.equal(resolve(l({ dirty: false }), r()), 'noop'); assert.equal(resolve(l({ dirty: false }), r({ version: 4 })), 'take-remote');
  assert.equal(resolve(l(), r()), 'push-local'); assert.equal(resolve(l(), r({ version: 4 })), 'keep-both-remote-wins');
  assert.equal(resolve(l(), r({ version: 4, contentKey: 'a' })), 'take-remote'); assert.equal(resolve(l(), r({ version: 4, deleted: true })), 'resurrect-local');
  assert.equal(resolve(l({ deleted: true }), r({ version: 4 })), 'take-remote');
});
test('offline create then sync pushes everything, clears outbox, no duplicates on re-sync', async () => {
  const { ctx, ws } = await device(); const remote = new MemoryRemote();
  const t = await createTask(ctx, ws, { title: 'offline task', labels: ['x'] }); await createNote(ctx, ws, { title: 'offline note', html: '<p>hi</p>' });
  remote.online = false; const off = await syncOnce(ctx, remote); assert.ok(off.error); assert.ok((await pendingCount(ctx)) >= 5, 'nothing lost while offline');
  assert.equal((await all(ctx)).length, 1);
  remote.online = true; const ok = await syncOnce(ctx, remote); assert.equal(ok.error, null); assert.equal(await pendingCount(ctx), 0);
  assert.equal(remote.get(TASKS, t.id)!['version'], 1);
  const again = await syncOnce(ctx, remote); assert.equal(again.pushed, 0); assert.equal(remote.tables.get('tasks')!.size, 1);
  assert.equal(Number((await ctx.db.all("SELECT COUNT(*) n FROM tasks WHERE dirty=1"))[0]!['n']), 0);
});
test('second device receives data; edit round-trips with version bump', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  const t = await createTask(a.ctx, a.ws, { title: 'from A', labels: ['l1'] }); await syncOnce(a.ctx, remote);
  await syncOnce(b.ctx, remote); const got = await all(b.ctx); assert.equal(got.length, 1); assert.equal(got[0]!.labels[0]!.name, 'l1');
  await updateTask(b.ctx, t.id, { title: 'edited on B' }); await syncOnce(b.ctx, remote); await syncOnce(a.ctx, remote);
  assert.equal((await all(a.ctx))[0]!.title, 'edited on B'); assert.equal(remote.get(TASKS, t.id)!['version'], 2);
  assert.equal(a.ws, b.ws, 'default workspace converges across devices');
  assert.equal(remote.tables.get('workspaces')!.size, 1);
});
test('CONFLICT: concurrent edits keep both versions; nothing silently discarded', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  const t = await createTask(a.ctx, a.ws, { title: 'shared' }); await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  await updateTask(a.ctx, t.id, { title: 'A version' }); await updateTask(b.ctx, t.id, { title: 'B version' });
  await syncOnce(a.ctx, remote);                       // A wins the race
  const rep = await syncOnce(b.ctx, remote);           // B hits the conflict
  assert.equal(rep.conflicts, 1); assert.equal(rep.error, null);
  const titles = (await all(b.ctx)).map((x) => x.title).sort();
  assert.deepEqual(titles, ['A version', 'B version (conflict copy)']);
  await syncOnce(b.ctx, remote); await syncOnce(a.ctx, remote);
  assert.deepEqual((await all(a.ctx)).map((x) => x.title).sort(), titles, 'both devices converge on both versions');
  assert.equal(await pendingCount(b.ctx), 0);
});
test('CONFLICT: identical concurrent edits converge without a copy', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  const t = await createTask(a.ctx, a.ws, { title: 'x' }); await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  await updateTask(a.ctx, t.id, { priority: 3 }); await updateTask(b.ctx, t.id, { priority: 3 });
  await syncOnce(a.ctx, remote); const rep = await syncOnce(b.ctx, remote);
  assert.equal(rep.conflicts, 0); assert.equal((await all(b.ctx)).length, 1);
});
test('CONFLICT: remote deleted but local edited -> edit survives (resurrected)', async () => {
  const a = await device(); const remote = new MemoryRemote();
  const t = await createTask(a.ctx, a.ws, { title: 'keep me' }); await syncOnce(a.ctx, remote);
  remote.serverEdit(TASKS, t.id, { deleted_at: '2026-06-15T00:00:00.000Z' });
  await updateTask(a.ctx, t.id, { title: 'keep me, edited' });
  const rep = await syncOnce(a.ctx, remote); assert.equal(rep.error, null);
  assert.equal((await all(a.ctx))[0]!.title, 'keep me, edited'); assert.equal(remote.get(TASKS, t.id)!['deleted_at'], null);
});
test('notes conflict makes a copy linked via conflict_of; rich content survives', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  const n = await createNote(a.ctx, a.ws, { title: 'N', html: '<p>base</p>' }); await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  await updateNote(a.ctx, n.id, { html: '<p>from a</p>' }); await updateNote(b.ctx, n.id, { html: '<p>from b <b>bold</b></p>' });
  await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  const notes = await listNotes(b.ctx, { view: 'active' }); assert.equal(notes.length, 2);
  const copy = notes.find((x) => x.title.includes('conflict copy'))!; assert.ok(copy.html.includes('<b>bold</b>'));
  assert.equal((await b.ctx.db.all('SELECT conflict_of FROM notes WHERE id=?', [copy.id]))[0]!['conflict_of'], n.id);
  assert.equal((await getNote(b.ctx, n.id))!.html, '<p>from a</p>');
});
test('delete (soft) and recurrence sync; completed state syncs', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  const t = await createTask(a.ctx, a.ws, { title: 'r', due_at: new Date(2026, 5, 15, 9).toISOString(), recurrence_rule: 'FREQ=DAILY' });
  await setTaskCompleted(a.ctx, t.id, true); await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  assert.equal(remote.tables.get('tasks')!.size, 2); assert.equal((await all(b.ctx)).length, 1, 'only the next occurrence is open');
});
test('retryable failure keeps data + retries; non-retryable poison record is parked, others continue', async () => {
  const { ctx, ws } = await device(); const remote = new MemoryRemote();
  await createTask(ctx, ws, { title: 'one' }); remote.failNext = new SyncError('boom', true);
  assert.ok((await syncOnce(ctx, remote)).error); assert.ok((await pendingCount(ctx)) > 0);
  assert.equal((await syncOnce(ctx, remote)).error, null);
  await createTask(ctx, ws, { title: 'bad' }); await createTask(ctx, ws, { title: 'good' });
  remote.failNext = new SyncError('check constraint', false);
  const rep = await syncOnce(ctx, remote); assert.equal(rep.blocked, 1); assert.equal(rep.error, null);
  assert.equal((await ctx.db.all("SELECT * FROM sync_outbox WHERE attempts=99")).length, 1);
  assert.equal(remote.tables.get('tasks')!.size, 2);
});
test('edit made while a push is in flight is not lost', async () => {
  const { ctx, ws } = await device(); const remote = new MemoryRemote(); const t = await createTask(ctx, ws, { title: 'v1' });
  const orig = remote.push.bind(remote); let hooked = false;
  remote.push = async (d, r, b) => { const res = await orig(d, r, b); if (!hooked && d.name === 'tasks') { hooked = true; await updateTask(ctx, t.id, { title: 'v2 during push' }); } return res; };
  await syncOnce(ctx, remote);
  assert.equal(remote.get(TASKS, t.id)!['title'], 'v2 during push'); assert.equal(await pendingCount(ctx), 0);
});
test('pull pagination with small page size', async () => {
  const a = await device(); const b = await device(); const remote = new MemoryRemote();
  for (let i = 0; i < 7; i++) await createTask(a.ctx, a.ws, { title: `t${i}` });
  await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote, { pullLimit: 3 }); assert.equal((await all(b.ctx)).length, 7);
});
test('controller: single-flight, offline pause, backoff', async () => {
  let runs = 0; let online = true; const timers: { f: () => void; ms: number }[] = [];
  const c = new SyncController({ run: async () => { runs++; return { pushed: 0, pulled: 0, conflicts: 0, blocked: 0, error: runs === 1 ? 'net' : null }; }, isOnline: () => online, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimer: () => {} });
  await Promise.all([c.sync(), c.sync()]); assert.equal(runs, 2, 'second trigger coalesced into one rerun'); assert.equal(c.status, 'synced');
  online = false; await c.sync(); assert.equal(c.status, 'offline'); assert.equal(runs, 2);
  assert.deepEqual([1, 2, 3, 20].map(backoffMs), [2000, 4000, 8000, 300000]);
});
test('SupabaseRemote maps types, uses CAS on update, handles duplicate insert', async () => {
  const calls: { op: string; table: string; payload?: Row; eq: [string, unknown][] }[] = []; let result: { data: unknown; error: { code?: string; message: string } | null } = { data: [{ version: 1, updated_at: 't' }], error: null };
  const qb = (table: string): SbQuery => { const st = { op: 'select', table, payload: undefined as Row | undefined, eq: [] as [string, unknown][] }; calls.push(st);
    const q: SbQuery = { select() { return q; }, insert(v) { st.op = 'insert'; st.payload = v as Row; return q; }, update(v) { st.op = 'update'; st.payload = v as Row; return q; }, eq(c, v) { st.eq.push([c, v]); return q; }, gte() { return q; }, order() { return q; }, limit() { return q; }, maybeSingle() { return q; }, then: (a, b) => Promise.resolve(result).then(a, b) }; return q; };
  const sb: SbClient = { from: qb }; const r = new SupabaseRemote(sb, 'user-1');
  const row: Row = { id: 'n1', workspace_id: 'w', kind: 'rich', title: 'T', body_text: '', content: '{"a":1}', color: null, is_pinned: 1, is_favorite: 0, archived_at: null, sticky_state: null, conflict_of: null, created_at: 'c', deleted_at: null, version: 0, dirty: 1, updated_at: 'x' };
  await r.push(NOTES, row, 0); const ins = calls[0]!; assert.equal(ins.op, 'insert'); assert.equal(ins.payload!['user_id'], 'user-1'); assert.equal(ins.payload!['is_pinned'], true); assert.deepEqual(ins.payload!['content'], { a: 1 });
  assert.ok(!('version' in ins.payload!) && !('dirty' in ins.payload!) && !('updated_at' in ins.payload!));
  await r.push(NOTES, row, 4); const upd = calls[1]!; assert.equal(upd.op, 'update'); assert.deepEqual(upd.eq, [['id', 'n1'], ['version', 4]]); assert.ok(!('id' in upd.payload!) && !('user_id' in upd.payload!));
  result = { data: [], error: null }; assert.deepEqual(await r.push(NOTES, row, 4), { kind: 'conflict', remote: null });
  result = { data: null, error: { code: '23514', message: 'check' } }; await assert.rejects(r.push(NOTES, row, 4), (e: SyncError) => e.retryable === false);
  result = { data: null, error: { message: 'Failed to fetch' } }; await assert.rejects(r.push(NOTES, row, 4), (e: SyncError) => e.retryable === true);
});
