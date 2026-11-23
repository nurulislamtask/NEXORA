import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './helpers/nodeDb.ts';
import { makeCtx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { addSubtask, archiveTask, createTask, dueReminders, listSubtasks, listTasks, markReminderFired, setTaskCompleted, setTaskReminder, toggleSubtask, trashTask, updateTask, type TaskQuery } from '../src/core/data/tasks.ts';
import { archiveNote, createAutosaver, createNote, listNotes, trashNote, updateNote, wordCount } from '../src/core/data/notes.ts';
import { sanitizeHtml, htmlToText } from '../src/core/data/sanitize.ts';
import { nextOccurrence } from '../src/core/data/recurrence.ts';
import { listTags } from '../src/core/data/tags.ts';

async function setup() { const db = openTestDb(); const ctx = makeCtx(db); const ws = await ensureDefaultWorkspace(ctx, 'u1'); return { db, ctx, ws }; }
const day = new Date(2026, 5, 15, 0, 0, 0);
const q = (view: TaskQuery['view'], extra: Partial<TaskQuery> = {}): TaskQuery => ({ view, today: '2026-06-15', nowIso: new Date(2026, 5, 15, 12).toISOString(), dayStartIso: day.toISOString(), dayEndIso: new Date(2026, 5, 16).toISOString(), ...extra });

test('migrations apply; default workspace id is deterministic', async () => {
  const { ctx, ws } = await setup(); assert.equal(await ensureDefaultWorkspace(ctx, 'u1'), ws);
  assert.equal((await ctx.db.all('SELECT * FROM workspaces')).length, 1);
});
test('task CRUD, validation, outbox coalescing', async () => {
  const { ctx, ws, db } = await setup();
  const t = await createTask(ctx, ws, { title: '  Buy milk ', priority: 2 });
  assert.equal(t.title, 'Buy milk');
  await updateTask(ctx, t.id, { title: 'Buy oat milk', priority: 4 });
  assert.equal((await db.all("SELECT * FROM sync_outbox WHERE entity='tasks'")).length, 1, 'one coalesced pending entry');
  await assert.rejects(createTask(ctx, ws, { title: '   ' }));
  await assert.rejects(createTask(ctx, ws, { title: 'x', priority: 9 }));
  await assert.rejects(createTask(ctx, ws, { title: 'x', due_at: 'nope' }));
  assert.equal((await listTasks(ctx, q('all'))).length, 1);
});
test('views: overdue, upcoming, my-day, important, completed, archived, trash', async () => {
  const { ctx, ws } = await setup();
  const od = await createTask(ctx, ws, { title: 'overdue', due_at: new Date(2026, 5, 14, 9).toISOString() });
  const today = await createTask(ctx, ws, { title: 'today', due_at: new Date(2026, 5, 15, 18).toISOString() });
  const up = await createTask(ctx, ws, { title: 'upcoming', due_at: new Date(2026, 5, 20).toISOString() });
  const imp = await createTask(ctx, ws, { title: 'important', is_favorite: true });
  const md = await createTask(ctx, ws, { title: 'manual myday', is_my_day_date: '2026-06-15' });
  const ids = async (v: TaskQuery['view']) => (await listTasks(ctx, q(v))).map((t) => t.title).sort();
  assert.deepEqual(await ids('overdue'), ['overdue']);
  assert.deepEqual(await ids('upcoming'), ['upcoming']);
  assert.deepEqual(await ids('my-day'), ['manual myday', 'today']);
  assert.deepEqual(await ids('important'), ['important']);
  await setTaskCompleted(ctx, today.id, true); await archiveTask(ctx, up.id); await trashTask(ctx, od.id);
  assert.deepEqual(await ids('completed'), ['today']); assert.deepEqual(await ids('archived'), ['upcoming']); assert.deepEqual(await ids('trash'), ['overdue']);
  assert.ok(!(await ids('all')).includes('today')); void imp; void md;
  await trashTask(ctx, od.id, false); assert.deepEqual(await ids('trash'), []);
});
test('labels, priority filter, search (incl. Bangla and prefix)', async () => {
  const { ctx, ws } = await setup();
  const a = await createTask(ctx, ws, { title: 'বাজার করা', description: 'দুধ ডিম', labels: ['Home', 'urgent'], priority: 3 });
  await createTask(ctx, ws, { title: 'Write report', labels: ['work'] });
  assert.equal((await listTasks(ctx, q('all', { search: 'বাজার' }))).length, 1);
  assert.equal((await listTasks(ctx, q('all', { search: 'দুধ' }))).length, 1);
  assert.equal((await listTasks(ctx, q('all', { search: 'rep' }))).length, 1);
  assert.equal((await listTasks(ctx, q('all', { search: 'nothing-here' }))).length, 0);
  assert.equal((await listTasks(ctx, q('all', { search: '"; DROP TABLE tasks; --' }))).length, 0);
  const tags = await listTags(ctx); assert.deepEqual(tags.map((t) => t.name), ['Home', 'urgent', 'work']);
  assert.equal((await listTasks(ctx, q('all', { tagId: tags.find((t) => t.name === 'work')!.id }))).length, 1);
  assert.equal((await listTasks(ctx, q('all', { priority: 3 }))).length, 1);
  await updateTask(ctx, a.id, { labels: ['home'] }); // case-insensitive reuse, removes 'urgent'
  assert.deepEqual((await listTasks(ctx, q('all', { search: 'বাজার' })))[0]!.labels.map((l) => l.name), ['Home']);
  assert.equal((await listTags(ctx)).length, 3);
});
test('subtasks/checklist counts', async () => {
  const { ctx, ws } = await setup(); const t = await createTask(ctx, ws, { title: 'T' });
  const s1 = await addSubtask(ctx, t.id, 'one'); await addSubtask(ctx, t.id, 'two'); await toggleSubtask(ctx, s1.id, true);
  const v = (await listTasks(ctx, q('all')))[0]!; assert.equal(v.subtasksTotal, 2); assert.equal(v.subtasksDone, 1);
  assert.equal((await listSubtasks(ctx, t.id)).length, 2);
});
test('recurrence: completing creates next occurrence; rule math', async () => {
  const { ctx, ws } = await setup();
  const due = new Date(2026, 0, 31, 9, 0);
  const t = await createTask(ctx, ws, { title: 'rent', due_at: due.toISOString(), recurrence_rule: 'FREQ=MONTHLY', labels: ['bills'] });
  const { next } = await setTaskCompleted(ctx, t.id, true);
  assert.equal(next!.due_at, new Date(2026, 1, 28, 9, 0).toISOString(), 'clamped to month end');
  assert.equal((await listTasks(ctx, q('all')))[0]!.labels[0]!.name, 'bills');
  assert.equal((await setTaskCompleted(ctx, t.id, true)).next, null, 'no duplicate on repeat complete');
  assert.equal(nextOccurrence('FREQ=DAILY;INTERVAL=3', new Date(2026, 5, 1, 8))!.getDate(), 4);
  assert.equal(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE', new Date(2026, 5, 15, 8))!.getDay(), 3); // Mon -> Wed
  assert.equal(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE', new Date(2026, 5, 17, 8))!.getDay(), 1); // Wed -> next Mon
  assert.equal(nextOccurrence('FREQ=YEARLY', new Date(2026, 5, 15, 8))!.getFullYear(), 2027);
  assert.equal(nextOccurrence('FREQ=DAILY;UNTIL=2026-06-01T00:00:00Z', new Date(2026, 5, 15)), null);
  assert.throws(() => nextOccurrence('FREQ=HOURLY', new Date()));
});
test('reminders: due, fire once, skip completed tasks', async () => {
  const { ctx, ws } = await setup(); const t = await createTask(ctx, ws, { title: 'call' });
  await setTaskReminder(ctx, t.id, '2026-06-15T08:00:00.000Z');
  assert.equal((await dueReminders(ctx, '2026-06-15T07:59:00.000Z')).length, 0);
  const due = await dueReminders(ctx, '2026-06-15T08:00:00.000Z'); assert.equal(due[0]!.title, 'call');
  await markReminderFired(ctx, due[0]!.id); assert.equal((await dueReminders(ctx, '2026-06-16T00:00:00.000Z')).length, 0);
  await setTaskReminder(ctx, t.id, '2026-06-15T09:00:00.000Z'); await setTaskCompleted(ctx, t.id, true);
  assert.equal((await dueReminders(ctx, '2026-06-16T00:00:00.000Z')).length, 0);
});
test('notes: CRUD, rich text sanitized, search, pin order, colors, archive/trash', async () => {
  const { ctx, ws } = await setup();
  const n = await createNote(ctx, ws, { title: 'Plan', html: '<h1>Hello</h1><p>বাংলা <b>text</b><script>alert(1)</script></p>', labels: ['ideas'] });
  assert.ok(!n.html.includes('script')); assert.equal(wordCount(n.body_text), 3);
  const n2 = await createNote(ctx, ws, { title: 'Second', color: '#fef3c7' });
  await updateNote(ctx, n2.id, { is_pinned: true });
  assert.equal((await listNotes(ctx, { view: 'active' }))[0]!.id, n2.id, 'pinned first');
  assert.equal((await listNotes(ctx, { view: 'active', search: 'বাংলা' })).length, 1);
  assert.equal((await listNotes(ctx, { view: 'active', color: '#fef3c7' })).length, 1);
  assert.equal((await listNotes(ctx, { view: 'active' }))[1]!.labels[0]!.name, 'ideas');
  await assert.rejects(updateNote(ctx, n.id, { color: 'red' }));
  await updateNote(ctx, n.id, { html: '<p>changed body</p>' });
  assert.equal((await listNotes(ctx, { view: 'active', search: 'Hello' })).length, 0, 'search index follows edits');
  await archiveNote(ctx, n.id); assert.equal((await listNotes(ctx, { view: 'archived' })).length, 1);
  await trashNote(ctx, n2.id); assert.equal((await listNotes(ctx, { view: 'trash' })).length, 1);
  assert.equal((await listNotes(ctx, { view: 'trash', search: 'Second' })).length, 0, 'trashed notes leave the index (documented)');
});
test('sanitizer blocks XSS vectors; htmlToText', () => {
  const bad = '<img src=x onerror=alert(1)><a href="javascript:alert(1)" onclick="x()">l</a><iframe src=//e></iframe><p onmouseover="x">ok</p><svg/onload=alert(1)>';
  const out = sanitizeHtml(bad);
  assert.ok(!/onerror|onclick|onmouseover|javascript:|<img|<iframe|<svg/i.test(out), out);
  assert.equal(sanitizeHtml('<a href="https://a.com/?x=1&y=2">k</a>'), '<a href="https://a.com/?x=1&amp;y=2" rel="noopener noreferrer" target="_blank">k</a>');
  assert.equal(htmlToText('<p>a &amp; b</p><p>c</p>'), 'a & b\nc');
  assert.equal(sanitizeHtml('1 < 2'), '1 &lt; 2');
});
test('autosave debounces, flush saves latest, no lost edit', async () => {
  const saved: string[] = []; let fire: (() => void) | null = null;
  const timers = { set: (f: () => void) => { fire = f; return 1; }, clear: () => { fire = null; } };
  const a = createAutosaver(async (v: string) => { saved.push(v); }, 800, timers);
  a.schedule('a'); a.schedule('ab'); assert.deepEqual(saved, []); fire!(); await a.flush(); assert.deepEqual(saved, ['ab']);
  a.schedule('abc'); await a.flush(); assert.deepEqual(saved, ['ab', 'abc']);
});

import { dayBounds, fromLocalInput, greetingKey, toLocalInput } from '../src/core/data/dates.ts';
test('date helpers are local-time correct', () => {
  const b = dayBounds(new Date(2026, 5, 15, 23, 30)); assert.equal(b.today, '2026-06-15');
  assert.equal(new Date(b.dayStartIso).getHours(), 0); assert.equal(new Date(b.dayEndIso).getDate(), 16);
  assert.equal(toLocalInput(fromLocalInput('2026-06-15T08:05')), '2026-06-15T08:05'); assert.equal(fromLocalInput(''), null); assert.equal(toLocalInput('garbage'), '');
  assert.deepEqual([5, 12, 20].map(greetingKey), ['home.goodMorning', 'home.goodAfternoon', 'home.goodEvening']);
});
