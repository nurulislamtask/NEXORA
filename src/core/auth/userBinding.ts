import type { Ctx } from '../data/ctx.ts';
import { getState, setState } from '../sync/engine.ts';

export type BindResult = 'bound' | 'same' | 'wiped' | 'blocked-unsynced';
const TABLES = ['sync_outbox', 'sync_state', 'search_idx', 'reminders', 'note_tags', 'task_tags', 'subtasks', 'notes', 'tasks', 'tags', 'habit_entries', 'habits', 'projects', 'workspaces', 'clipboard_items'];

export async function wipeLocalData(ctx: Ctx): Promise<void> { await ctx.db.transaction(async () => { for (const t of TABLES) await ctx.db.run(`DELETE FROM ${t}`); }); ctx.events.emit(); }
export const boundUser = (ctx: Ctx): Promise<string | null> => getState(ctx, 'user_id');

/** One local database holds exactly one account. A different account may only take over once nothing unsynced would be lost. */
export async function bindLocalUser(ctx: Ctx, uid: string): Promise<BindResult> {
  const cur = await getState(ctx, 'user_id');
  if (cur === uid) return 'same';
  if (cur === null) { await setState(ctx, 'user_id', uid); return 'bound'; }
  const unsynced = Number((await ctx.db.all<{ n: number }>('SELECT (SELECT COUNT(*) FROM sync_outbox) AS n'))[0]?.n ?? 0);
  if (unsynced > 0) return 'blocked-unsynced';
  await wipeLocalData(ctx); await setState(ctx, 'user_id', uid); return 'wiped';
}
