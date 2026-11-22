import type { Ctx } from './ctx.ts';
import type { Param, Row } from '../db/types.ts';
import type { EntityDef } from '../sync/entities.ts';
import { indexEntity } from './searchIndex.ts';

export const entityId = (def: EntityDef, row: Row): string => def.keys.map((k) => String(row[k])).join('|');
const toParam = (v: unknown): Param => (v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' ? JSON.stringify(v) : (v as string | number));

export async function getRow(ctx: Ctx, def: EntityDef, keyVals: Row): Promise<Row | null> {
  const r = await ctx.db.all(`SELECT * FROM ${def.table} WHERE ${def.keys.map((k) => `${k}=?`).join(' AND ')}`, def.keys.map((k) => toParam(keyVals[k])));
  return r[0] ?? null;
}

async function upsert(ctx: Ctx, def: EntityDef, row: Row, dirty: 0 | 1): Promise<void> {
  const all = [...def.cols, 'updated_at', 'version', 'dirty'];
  const vals = all.map((c) => (c === 'dirty' ? dirty : toParam(row[c])));
  const upd = all.filter((c) => !def.keys.includes(c)).map((c) => (c === 'version' && dirty === 1 ? `version=MAX(${def.table}.version, excluded.version)` : `${c}=excluded.${c}`)).join(',');
  await ctx.db.run(`INSERT INTO ${def.table} (${all.join(',')}) VALUES (${all.map(() => '?').join(',')}) ON CONFLICT(${def.keys.join(',')}) DO UPDATE SET ${upd}`, vals);
  await indexEntity(ctx, def, row);
}

/** Local user edit: persist, mark dirty, and queue for sync (coalesced: one pending entry per record). */
export async function putLocal(ctx: Ctx, def: EntityDef, row: Row, opts: { silent?: boolean } = {}): Promise<Row> {
  const next: Row = { ...row, updated_at: ctx.now(), version: row['version'] ?? 0 };
  await ctx.db.transaction(async () => {
    await upsert(ctx, def, next, 1);
    const id = entityId(def, next);
    const pending = await ctx.db.all('SELECT seq FROM sync_outbox WHERE entity=? AND entity_id=?', [def.name, id]);
    if (pending.length === 0)
      await ctx.db.run('INSERT INTO sync_outbox (entity, entity_id, op, base_version, created_at) VALUES (?,?,?,?,?)', [def.name, id, 'upsert', Number(next['version']), ctx.now()]);
  });
  if (!opts.silent) ctx.events.emit();
  return next;
}

/** Applying server state: clean row, no outbox entry. */
export async function putRemote(ctx: Ctx, def: EntityDef, row: Row): Promise<void> {
  await ctx.db.transaction(() => upsert(ctx, def, row, 0));
}
