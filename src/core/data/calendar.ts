import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { CALENDAR_EVENTS } from '../sync/entities.ts';
import { nextOccurrence } from './recurrence.ts';
import { localDate } from './dates.ts';

export interface EventInput { title: string; description?: string | null; color?: string | null; starts_at: string; ends_at?: string | null; all_day?: boolean; recurrence_rule?: string | null }
export interface CalEvent { id: string; workspace_id: string | null; title: string; description: string | null; color: string | null; starts_at: string; ends_at: string | null; all_day: boolean; recurrence_rule: string | null }
export interface CalItem { key: string; kind: 'event' | 'task'; id: string; title: string; date: string; startsAt: string; allDay: boolean; done?: boolean; color?: string | null }
const fromDb = (r: Row): CalEvent => ({ ...(r as unknown as CalEvent), all_day: Number(r['all_day']) === 1 });
const ok = (s: string): boolean => !Number.isNaN(Date.parse(s));
function validate(i: Partial<EventInput>): void {
  if (i.title !== undefined && (i.title.trim().length < 1 || i.title.length > 500)) throw new Error('Event title must be 1-500 characters');
  if (i.starts_at !== undefined && !ok(i.starts_at)) throw new Error('Invalid start time');
  if (i.ends_at && !ok(i.ends_at)) throw new Error('Invalid end time');
  if (i.starts_at && i.ends_at && Date.parse(i.ends_at) < Date.parse(i.starts_at)) throw new Error('The event ends before it starts');
  if (i.recurrence_rule) void nextOccurrence(i.recurrence_rule, new Date());
}
export async function createEvent(ctx: Ctx, workspaceId: string | null, input: EventInput): Promise<CalEvent> {
  validate(input);
  const row: Row = { id: ctx.uuid(), workspace_id: workspaceId, title: input.title.trim(), description: input.description ?? null, color: input.color ?? null, starts_at: input.starts_at, ends_at: input.ends_at ?? null, all_day: input.all_day ?? false, time_zone: null, recurrence_rule: input.recurrence_rule ?? null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, CALENDAR_EVENTS, row); return fromDb(row);
}
export async function updateEvent(ctx: Ctx, id: string, patch: Partial<EventInput>): Promise<void> {
  const cur = await getRow(ctx, CALENDAR_EVENTS, { id }); if (!cur) throw new Error('Event not found');
  validate({ starts_at: String(cur['starts_at']), ends_at: cur['ends_at'] as string | null, ...patch });
  await putLocal(ctx, CALENDAR_EVENTS, { ...cur, ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}) });
}
export async function deleteEvent(ctx: Ctx, id: string): Promise<void> { const c = await getRow(ctx, CALENDAR_EVENTS, { id }); if (c) await putLocal(ctx, CALENDAR_EVENTS, { ...c, deleted_at: ctx.now() }); }
export async function getEvent(ctx: Ctx, id: string): Promise<CalEvent | null> { const r = await getRow(ctx, CALENDAR_EVENTS, { id }); return r && !r['deleted_at'] ? fromDb(r) : null; }

/** 6x7 grid of local dates for a month, weeks start on `weekStart` (0=Sunday, 1=Monday). */
export function monthGrid(year: number, month0: number, weekStart: 0 | 1 = 0): string[] {
  const first = new Date(year, month0, 1); const lead = (first.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => localDate(new Date(year, month0, 1 - lead + i)));
}
const MAX_OCC = 400;
/** Events (with recurrence expanded) plus tasks due in [fromDate, toDate] inclusive, grouped by local date. */
export async function calendarItems(ctx: Ctx, fromDate: string, toDate: string): Promise<Map<string, CalItem[]>> {
  const [fy, fm, fd] = fromDate.split('-').map(Number) as [number, number, number]; const [ty, tm, td] = toDate.split('-').map(Number) as [number, number, number];
  const lo = new Date(fy, fm - 1, fd); const hi = new Date(ty, tm - 1, td + 1); const out = new Map<string, CalItem[]>();
  const push = (it: CalItem): void => { const l = out.get(it.date); if (l) l.push(it); else out.set(it.date, [it]); };
  const events = (await ctx.db.all("SELECT * FROM calendar_events WHERE deleted_at IS NULL AND (recurrence_rule IS NOT NULL OR (starts_at<? AND COALESCE(ends_at, starts_at)>=?))", [hi.toISOString(), lo.toISOString()])).map(fromDb);
  for (const e of events) {
    const start = new Date(e.starts_at); const span = e.ends_at ? Date.parse(e.ends_at) - start.getTime() : 0;
    const add = (d: Date, n: number): void => { // a multi-day event shows on each day it covers
      const last = new Date(d.getTime() + span);
      for (let day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); day <= last && day < hi; day.setDate(day.getDate() + 1)) if (day >= new Date(lo.getFullYear(), lo.getMonth(), lo.getDate())) push({ key: `e:${e.id}:${n}:${localDate(day)}`, kind: 'event', id: e.id, title: e.title, date: localDate(day), startsAt: d.toISOString(), allDay: e.all_day, color: e.color });
    };
    if (!e.recurrence_rule) { add(start, 0); continue; }
    let d: Date | null = start;
    for (let n = 0; d && d < hi && n < MAX_OCC; n++) { add(d, n); d = nextOccurrence(e.recurrence_rule, d); }
  }
  for (const t of await ctx.db.all<{ id: string; title: string; due_at: string; status: string }>("SELECT id, title, due_at, status FROM tasks WHERE deleted_at IS NULL AND archived_at IS NULL AND status<>'cancelled' AND due_at>=? AND due_at<?", [lo.toISOString(), hi.toISOString()]))
    push({ key: `t:${t.id}`, kind: 'task', id: t.id, title: t.title, date: localDate(new Date(t.due_at)), startsAt: t.due_at, allDay: false, done: t.status === 'completed' });
  for (const l of out.values()) l.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
  return out;
}
