import type { Ctx } from './ctx.ts';
import { SYNC_ORDER } from '../sync/entities.ts';

/** Full personal-data export (JSON) of everything stored locally, excluding clipboard history and sync internals. */
export async function exportAllJson(ctx: Ctx): Promise<string> {
  const out: Record<string, unknown> = { app: 'NEXORA', format: 1, exported_at: ctx.now() };
  for (const def of SYNC_ORDER) out[def.table] = await ctx.db.all(`SELECT ${def.cols.join(',')}, version, updated_at FROM ${def.table} ORDER BY created_at`);
  return JSON.stringify(out, null, 2);
}
