import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { deterministicId } from './workspace.ts';
import { HABITS, HABIT_ENTRIES } from '../sync/entities.ts';
import { localDate } from './dates.ts';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const parseDate = (s: string): Date => { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
const addDays = (s: string, n: number): string => { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); };
/** FREQ=DAILY, or FREQ=WEEKLY;BYDAY=MO,WE,FR (weekly without BYDAY means "any day" and is treated as daily for streaks). */
export function scheduledOn(rule: string, date: string): boolean {
  const kv = new Map(rule.split(';').map((p) => p.split('=') as [string, string]));
  const by = (kv.get('BYDAY') ?? '').split(',').filter(Boolean);
  return by.length === 0 ? true : by.includes(DAYS[parseDate(date).getDay()]!);
}
/** Consecutive scheduled days completed, ending today (or yesterday if today is still open). Unscheduled days neither break nor extend it. */
export function currentStreak(rule: string, done: ReadonlySet<string>, today: string): number {
  let d = today; let n = 0;
  if (scheduledOn(rule, d) && !done.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 4000; i++) { if (scheduledOn(rule, d)) { if (!done.has(d)) break; n++; } d = addDays(d, -1); }
  return n;
}
export function longestStreak(rule: string, done: ReadonlySet<string>): number {
  if (done.size === 0) return 0; const days = [...done].sort(); let best = 0; let run = 0; let d = days[0]!; const end = days[days.length - 1]!;
  for (let i = 0; i < 20000 && d <= end; i++) { if (scheduledOn(rule, d)) { if (done.has(d)) { run++; best = Math.max(best, run); } else run = 0; } d = addDays(d, 1); }
  return best;
}

export interface Habit { id: string; name: string; description: string | null; category: string | null; frequency_rule: string; archived_at: string | null }
export interface HabitView extends Habit { doneToday: boolean; scheduledToday: boolean; streak: number; longest: number; completions30: number; history: string[] }
export interface HabitInput { name: string; description?: string | null; category?: string | null; frequency_rule?: string; reminder_time?: string | null }
function validate(i: Partial<HabitInput>): void {
  if (i.name !== undefined && (i.name.trim().length < 1 || i.name.length > 120)) throw new Error('Habit name must be 1-120 characters');
  if (i.frequency_rule !== undefined && !/^FREQ=(DAILY|WEEKLY)(;BYDAY=(SU|MO|TU|WE|TH|FR|SA)(,(SU|MO|TU|WE|TH|FR|SA))*)?$/.test(i.frequency_rule)) throw new Error('Unsupported habit frequency');
  if (i.reminder_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.reminder_time)) throw new Error('Invalid reminder time');
}
export async function createHabit(ctx: Ctx, input: HabitInput): Promise<Habit> {
  validate(input);
  const row: Row = { id: ctx.uuid(), name: input.name.trim(), description: input.description ?? null, category: input.category ?? null, color: null, icon: null, frequency_rule: input.frequency_rule ?? 'FREQ=DAILY', reminder_time: input.reminder_time ?? null, archived_at: null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, HABITS, row); return row as unknown as Habit;
}
export async function updateHabit(ctx: Ctx, id: string, patch: Partial<HabitInput>): Promise<void> {
  validate(patch); const cur = await getRow(ctx, HABITS, { id }); if (!cur) throw new Error('Habit not found');
  await putLocal(ctx, HABITS, { ...cur, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) });
}
export const archiveHabit = async (ctx: Ctx, id: string, on = true): Promise<void> => { const c = await getRow(ctx, HABITS, { id }); if (c) await putLocal(ctx, HABITS, { ...c, archived_at: on ? ctx.now() : null }); };
export const deleteHabit = async (ctx: Ctx, id: string): Promise<void> => { const c = await getRow(ctx, HABITS, { id }); if (c) await putLocal(ctx, HABITS, { ...c, deleted_at: ctx.now() }); };

/** Idempotent: one row per (habit, day); un-checking soft-deletes it so the change syncs. */
export async function setHabitDone(ctx: Ctx, habitId: string, date: string, done: boolean): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  const id = await deterministicId(`habit-entry:${habitId}:${date}`); const cur = await getRow(ctx, HABIT_ENTRIES, { id });
  if (cur) { if (done !== !cur['deleted_at']) await putLocal(ctx, HABIT_ENTRIES, { ...cur, deleted_at: done ? null : ctx.now() }); }
  else if (done) await putLocal(ctx, HABIT_ENTRIES, { id, habit_id: habitId, entry_date: date, value: 1, created_at: ctx.now(), deleted_at: null, version: 0 });
}
export async function listHabits(ctx: Ctx, today: string, includeArchived = false): Promise<HabitView[]> {
  const habits = await ctx.db.all(`SELECT * FROM habits WHERE deleted_at IS NULL ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY created_at`);
  const entries = await ctx.db.all<{ habit_id: string; entry_date: string }>('SELECT habit_id, entry_date FROM habit_entries WHERE deleted_at IS NULL');
  const by = new Map<string, Set<string>>(); for (const e of entries) { const s = by.get(e.habit_id) ?? new Set<string>(); s.add(e.entry_date); by.set(e.habit_id, s); }
  const from30 = addDays(today, -29);
  return habits.map((h) => { const rule = String(h['frequency_rule']); const done = by.get(String(h['id'])) ?? new Set<string>();
    return { id: String(h['id']), name: String(h['name']), description: (h['description'] as string | null) ?? null, category: (h['category'] as string | null) ?? null, frequency_rule: rule, archived_at: (h['archived_at'] as string | null) ?? null,
      doneToday: done.has(today), scheduledToday: scheduledOn(rule, today), streak: currentStreak(rule, done, today), longest: longestStreak(rule, done), completions30: [...done].filter((d) => d >= from30 && d <= today).length,
      history: Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).filter((d) => done.has(d)) }; });
}
