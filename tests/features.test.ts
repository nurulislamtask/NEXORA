import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './helpers/nodeDb.ts';
import { MemoryRemote } from './helpers/memoryRemote.ts';
import { makeCtx, type Ctx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { createTask, listTasks, trashTask, setTaskReminder, dueReminders, snoozeReminder } from '../src/core/data/tasks.ts';
import { createNote, listNotes, trashNote } from '../src/core/data/notes.ts';
import { archiveHabit, createHabit, currentStreak, listHabits, longestStreak, scheduledOn, setHabitDone } from '../src/core/data/habits.ts';
import { createBackup, restoreBackup, validateBackup } from '../src/core/data/backup.ts';
import { DEFAULT_CLIP_SETTINGS, addClip, categorize, clearClips, clipToNote, clipToTask, deleteClip, listClips, looksSensitive, pinClip } from '../src/core/data/clipboard.ts';
import { globalSearch, highlightParts, pushRecent } from '../src/core/data/search.ts';
import { createSticky, getStickyState, isStickyId, normalizeSticky, saveStickyState } from '../src/core/data/sticky.ts';
import { syncOnce, pendingCount } from '../src/core/sync/engine.ts';

async function dev(): Promise<{ ctx: Ctx; ws: string }> { const ctx = makeCtx(openTestDb()); return { ctx, ws: await ensureDefaultWorkspace(ctx, 'u1') }; }
const Q = { nowIso: '2026-06-15T12:00:00.000Z', today: '2026-06-15', dayStartIso: '2026-06-15T00:00:00.000Z', dayEndIso: '2026-06-16T00:00:00.000Z' };

test('habit streak maths: daily, today-open grace, gaps, weekly BYDAY skipping', () => {
  const d = new Set(['2026-06-13', '2026-06-14', '2026-06-15']);
  assert.equal(currentStreak('FREQ=DAILY', d, '2026-06-15'), 3);
  assert.equal(currentStreak('FREQ=DAILY', new Set(['2026-06-13', '2026-06-14']), '2026-06-15'), 2, 'today still open keeps streak');
  assert.equal(currentStreak('FREQ=DAILY', new Set(['2026-06-12', '2026-06-14', '2026-06-15']), '2026-06-15'), 2, 'gap breaks it');
  assert.equal(currentStreak('FREQ=DAILY', new Set(), '2026-06-15'), 0);
  // 2026-06-15 is a Monday. MO,WE,FR: Fri 12th + Wed 10th + Mon 15th done => streak 3 although Tue/Thu are skipped
  assert.ok(scheduledOn('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-06-15') && !scheduledOn('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-06-16'));
  assert.equal(currentStreak('FREQ=WEEKLY;BYDAY=MO,WE,FR', new Set(['2026-06-10', '2026-06-12', '2026-06-15']), '2026-06-15'), 3);
  assert.equal(longestStreak('FREQ=DAILY', new Set(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-06'])), 3);
});
test('habits: create/toggle idempotent/uncheck/archive; validation', async () => {
  const { ctx } = await dev(); const h = await createHabit(ctx, { name: 'Read', frequency_rule: 'FREQ=DAILY' });
  await setHabitDone(ctx, h.id, '2026-06-14', true); await setHabitDone(ctx, h.id, '2026-06-15', true); await setHabitDone(ctx, h.id, '2026-06-15', true);
  assert.equal(Number((await ctx.db.all('SELECT COUNT(*) n FROM habit_entries'))[0]!['n']), 2, 'no duplicate day rows');
  let v = (await listHabits(ctx, '2026-06-15'))[0]!; assert.equal(v.streak, 2); assert.ok(v.doneToday); assert.equal(v.completions30, 2);
  await setHabitDone(ctx, h.id, '2026-06-15', false); v = (await listHabits(ctx, '2026-06-15'))[0]!; assert.ok(!v.doneToday); assert.equal(v.streak, 1);
  await setHabitDone(ctx, h.id, '2026-06-15', true); assert.equal((await listHabits(ctx, '2026-06-15'))[0]!.streak, 2, 'recheck revives same row');
  await archiveHabit(ctx, h.id); assert.equal((await listHabits(ctx, '2026-06-15')).length, 0); assert.equal((await listHabits(ctx, '2026-06-15', true)).length, 1);
  await assert.rejects(createHabit(ctx, { name: ' ' })); await assert.rejects(createHabit(ctx, { name: 'x', frequency_rule: 'FREQ=HOURLY' })); await assert.rejects(setHabitDone(ctx, h.id, 'tomorrow', true));
});
test('habits sync: two devices tick the same day offline -> one entry, no blocked records', async () => {
  const a = await dev(); const b = await dev(); const remote = new MemoryRemote();
  const h = await createHabit(a.ctx, { name: 'Walk' }); await syncOnce(a.ctx, remote); await syncOnce(b.ctx, remote);
  await setHabitDone(a.ctx, h.id, '2026-06-15', true); await setHabitDone(b.ctx, h.id, '2026-06-15', true);
  await syncOnce(a.ctx, remote); const rb = await syncOnce(b.ctx, remote); await syncOnce(a.ctx, remote);
  assert.equal(rb.error, null); assert.equal(rb.blocked, 0); assert.equal(remote.tables.get('habit_entries')!.size, 1);
  assert.equal((await listHabits(b.ctx, '2026-06-15'))[0]!.streak, 1); assert.equal(await pendingCount(b.ctx), 0);
});
test('backup: round-trip into a fresh device, checksum + validation errors', async () => {
  const a = await dev(); const t = await createTask(a.ctx, a.ws, { title: 'বাংলা', labels: ['x'] }); await createNote(a.ctx, a.ws, { title: 'N', html: '<p>hello <b>w</b></p>' }); await createHabit(a.ctx, { name: 'H' });
  const json = await createBackup(a.ctx); const b = await dev(); const v = await validateBackup(b.ctx, json); assert.ok(v.ok);
  const r = await restoreBackup(b.ctx, (v as Extract<typeof v, { ok: true }>).backup, { mode: 'merge', confirmed: true }); assert.ok(r.inserted >= 5);
  assert.equal((await listTasks(b.ctx, { view: 'all', ...Q }))[0]!.title, 'বাংলা'); assert.equal((await listTasks(b.ctx, { view: 'all', ...Q, search: 'বাংলা' })).length, 1, 'search index rebuilt');
  assert.equal((await listNotes(b.ctx, { view: 'active' }))[0]!.html, '<p>hello <b>w</b></p>'); assert.ok((await pendingCount(b.ctx)) > 0, 'restored data is queued for sync'); void t;
  assert.deepEqual(await validateBackup(b.ctx, 'nope'), { ok: false, error: 'not-json' }); assert.deepEqual(await validateBackup(b.ctx, '{"app":"X"}'), { ok: false, error: 'not-a-backup' });
  const tampered = json.replace('"title":"N"', '"title":"Z"'); assert.deepEqual(await validateBackup(b.ctx, tampered), { ok: false, error: 'checksum-mismatch' });
  const bad = JSON.parse(json); bad.format = 1; assert.deepEqual(await validateBackup(b.ctx, JSON.stringify(bad)), { ok: false, error: 'unsupported-format' });
});
test('restore: requires confirmation; merge never overwrites; replace restores + removes extras (syncable)', async () => {
  const { ctx, ws } = await dev(); const keep = await createTask(ctx, ws, { title: 'keep original' }); const gone = await createTask(ctx, ws, { title: 'will be trashed' });
  const json = await createBackup(ctx); const v = await validateBackup(ctx, json); assert.ok(v.ok); const bk = (v as Extract<typeof v, { ok: true }>).backup;
  await trashTask(ctx, gone.id); await (await import('../src/core/data/tasks.ts')).updateTask(ctx, keep.id, { title: 'edited after backup' }); const extra = await createTask(ctx, ws, { title: 'created after backup' });
  await assert.rejects(restoreBackup(ctx, bk, { mode: 'replace', confirmed: false }), /confirmation/);
  const m = await restoreBackup(ctx, bk, { mode: 'merge', confirmed: true }); assert.equal(m.inserted, 0);
  assert.equal((await listTasks(ctx, { view: 'all', ...Q })).find((x) => x.id === keep.id)!.title, 'edited after backup', 'merge leaves existing rows alone');
  const r = await restoreBackup(ctx, bk, { mode: 'replace', confirmed: true }); assert.ok(r.updated >= 2); assert.equal(r.removed, 1);
  const titles = (await listTasks(ctx, { view: 'all', ...Q })).map((x) => x.title).sort(); assert.deepEqual(titles, ['keep original', 'will be trashed']);
  assert.ok((await ctx.db.all('SELECT deleted_at FROM tasks WHERE id=?', [extra.id]))[0]!['deleted_at'], 'extra is soft-deleted, not hard-deleted');
});
test('restore rejects dangling workspace references before writing', async () => {
  const { ctx, ws } = await dev(); await createTask(ctx, ws, { title: 't' }); const b = JSON.parse(await createBackup(ctx)); b.tables.workspaces = [];
  const other = await dev(); const text = JSON.stringify(b);
  // fix checksum so only the reference problem remains
  const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join(''); b.checksum = await sha(JSON.stringify(b.tables));
  const fresh = makeCtx(openTestDb()); assert.deepEqual(await validateBackup(fresh, JSON.stringify(b)), { ok: false, error: 'missing-workspace:tasks' }); void text;
});
test('clipboard: disabled by default, dedupe/bump, sensitive skipped, limits keep pinned, search, convert, clear', async () => {
  const { ctx, ws } = await dev(); const on = { ...DEFAULT_CLIP_SETTINGS, enabled: true };
  assert.equal(await addClip(ctx, 'hello', DEFAULT_CLIP_SETTINGS), 'disabled'); assert.equal((await listClips(ctx)).length, 0, 'nothing captured without opt-in');
  assert.equal(await addClip(ctx, 'hello', { ...on, paused: true }), 'paused'); assert.equal(await addClip(ctx, '   ', on), 'empty');
  assert.equal(await addClip(ctx, 'hello world', on), 'added'); assert.equal(await addClip(ctx, 'hello world', on), 'bumped'); assert.equal((await listClips(ctx)).length, 1);
  for (const s of ['4111 1111 1111 1111', 'password: hunter2hunter2', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij', 'AKIAIOSFODNN7EXAMPLE', '-----BEGIN RSA PRIVATE KEY-----\nabc', 'ghp_' + 'a'.repeat(36)]) assert.equal(await addClip(ctx, s, on), 'sensitive', s);
  assert.equal(await addClip(ctx, '4111 1111 1111 1112', on), 'added', 'non-Luhn number is not a card'); assert.ok(!looksSensitive('just a normal sentence about passwords'));
  assert.equal(await addClip(ctx, 'x'.repeat(100001), on), 'too-large');
  await clearClips(ctx); const small = { ...on, maxItems: 2 }; await addClip(ctx, 'a one', small); await addClip(ctx, 'b two', small); const items = await listClips(ctx); await pinClip(ctx, items.find((x) => x.text === 'a one')!.id, true);
  await addClip(ctx, 'c three', small); await addClip(ctx, 'd four', small); const texts = (await listClips(ctx)).map((x) => x.text); assert.ok(texts.includes('a one'), 'pinned survives limit'); assert.equal(texts.length, 3, 'pinned + 2 newest unpinned'); assert.ok(!texts.includes('b two'));
  assert.equal((await listClips(ctx, { search: 'FOUR' })).length, 1); assert.equal((await listClips(ctx, { search: '50%_' })).length, 0, 'wildcards escaped');
  const four = (await listClips(ctx, { search: 'four' }))[0]!; const n = await clipToNote(ctx, ws, four.id); assert.ok(n.body_text.includes('d four')); const t = await clipToTask(ctx, ws, four.id); assert.equal(t.title, 'd four');
  await deleteClip(ctx, four.id); assert.equal((await listClips(ctx, { search: 'four' })).length, 0); await clearClips(ctx, true); assert.deepEqual((await listClips(ctx)).map((x) => x.text), ['a one']); await clearClips(ctx); assert.equal((await listClips(ctx)).length, 0);
  assert.deepEqual(['https://a.com', 'a@b.co', '+880 1711-123456', 'plain', 'if (x) {\n  y();\n}'].map(categorize), ['link', 'email', 'number', 'text', 'code']);
});
test('clipboard is never synced or exported in backups', async () => {
  const { ctx } = await dev(); await addClip(ctx, 'private clip', { ...DEFAULT_CLIP_SETTINGS, enabled: true }); const remote = new MemoryRemote(); await syncOnce(ctx, remote);
  assert.ok(![...remote.tables.keys()].some((k) => k.includes('clip'))); assert.ok(!(await createBackup(ctx)).includes('private clip'));
});
test('global search across kinds; clipboard opt-in; highlight; recents', async () => {
  const { ctx, ws } = await dev(); await createTask(ctx, ws, { title: 'বাজার list', labels: ['বাজার-tag'] }); await createNote(ctx, ws, { title: 'Meeting', html: '<p>বাজার budget</p>' }); await createHabit(ctx, { name: 'বাজার habit' }); await addClip(ctx, 'বাজার clip', { ...DEFAULT_CLIP_SETTINGS, enabled: true });
  const kinds = (h: { kind: string }[]) => [...new Set(h.map((x) => x.kind))].sort();
  assert.deepEqual(kinds(await globalSearch(ctx, 'বাজার')), ['habit', 'note', 'tag', 'task']); assert.deepEqual(kinds(await globalSearch(ctx, 'বাজার', { includeClipboard: true })), ['clip', 'habit', 'note', 'tag', 'task']);
  assert.deepEqual(await globalSearch(ctx, '   '), []); assert.deepEqual(await globalSearch(ctx, '%_\\"'), []);
  const n = (await listNotes(ctx, { view: 'active' }))[0]!; await trashNote(ctx, n.id); assert.ok(!(await globalSearch(ctx, 'budget')).some((h) => h.kind === 'note'));
  assert.deepEqual(highlightParts('Hello World', 'world'), [{ text: 'Hello ', hit: false }, { text: 'World', hit: true }]); assert.deepEqual(highlightParts('abc', ''), [{ text: 'abc', hit: false }]);
  assert.deepEqual(pushRecent(['a', 'b'], 'B'), ['B', 'a']); assert.equal(pushRecent(Array.from({ length: 8 }, (_, i) => String(i)), 'new').length, 8); assert.deepEqual(pushRecent(['a'], '  '), ['a']);
});
test('sticky notes: state persisted/clamped/synced; id validation', async () => {
  const { ctx, ws } = await dev(); const s = await createSticky(ctx, ws); assert.deepEqual(await getStickyState(ctx, s.id), { x: null, y: null, w: 300, h: 320, alwaysOnTop: true });
  await saveStickyState(ctx, s.id, { x: 100, y: 50, w: 99999, h: 10, alwaysOnTop: false }); assert.deepEqual(await getStickyState(ctx, s.id), { x: 100, y: 50, w: 2000, h: 120, alwaysOnTop: false });
  assert.equal(normalizeSticky('garbage{').w, 300); assert.equal(normalizeSticky({ x: 'a', alwaysOnTop: 'yes' }).alwaysOnTop, true);
  assert.ok(isStickyId(s.id)); assert.ok(!isStickyId('../etc/passwd')); const remote = new MemoryRemote(); await syncOnce(ctx, remote);
  assert.equal(JSON.parse(String(remote.get((await import('../src/core/sync/entities.ts')).NOTES, s.id)!['sticky_state'])).w, 2000);
});
test('snooze hides a due reminder until the snooze time', async () => {
  const { ctx, ws } = await dev(); const t = await createTask(ctx, ws, { title: 'call' }); await setTaskReminder(ctx, t.id, '2026-06-15T08:00:00.000Z');
  const r = (await dueReminders(ctx, '2026-06-15T08:05:00.000Z'))[0]!; await snoozeReminder(ctx, r.id, '2026-06-15T08:15:00.000Z');
  assert.equal((await dueReminders(ctx, '2026-06-15T08:10:00.000Z')).length, 0); assert.equal((await dueReminders(ctx, '2026-06-15T08:15:00.000Z')).length, 1);
});

import { shortcutAction } from '../src/core/shortcuts.ts';
test('keyboard shortcuts follow platform conventions', () => {
  const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
  assert.equal(shortcutAction(k('k', { ctrlKey: true }), false), 'palette'); assert.equal(shortcutAction(k('K', { metaKey: true }), true), 'palette');
  assert.equal(shortcutAction(k('k', { ctrlKey: true }), true), null, 'Ctrl is not the Mac modifier'); assert.equal(shortcutAction(k('p', { ctrlKey: true }), false), 'palette');
  assert.equal(shortcutAction(k('n', { ctrlKey: true }), false), 'new-note'); assert.equal(shortcutAction(k('N', { ctrlKey: true, shiftKey: true }), false), 'new-task');
  assert.equal(shortcutAction(k('n'), false), null); assert.equal(shortcutAction(k('n', { ctrlKey: true, altKey: true }), false), null);
});
