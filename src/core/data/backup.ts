import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { SYNC_ORDER } from '../sync/entities.ts';
import { contentKey } from '../sync/conflict.ts';

export interface Backup { app: 'NEXORA'; format: 2; created_at: string; tables: Record<string, Row[]>; checksum: string }
const MAX_BYTES = 100 * 1024 * 1024;
const sha = async (s: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Independent snapshot of all synced user data (including soft-deleted rows, so a restore is faithful). Not the clipboard. */
export async function createBackup(ctx: Ctx): Promise<string> {
  const tables: Record<string, Row[]> = {};
  for (const def of SYNC_ORDER) tables[def.name] = await ctx.db.all(`SELECT ${def.cols.join(',')} FROM ${def.table} ORDER BY created_at, ${def.keys.join(',')}`);
  const b: Backup = { app: 'NEXORA', format: 2, created_at: ctx.now(), tables, checksum: await sha(JSON.stringify(tables)) };
  return JSON.stringify(b);
}
export type Validation = { ok: true; backup: Backup; counts: Record<string, number> } | { ok: false; error: string };

/** Validates structure, integrity (checksum) and references BEFORE anything is written. */
export async function validateBackup(ctx: Ctx, text: string): Promise<Validation> {
  if (text.length > MAX_BYTES) return { ok: false, error: 'file-too-large' };
  let b: Backup; try { b = JSON.parse(text) as Backup; } catch { return { ok: false, error: 'not-json' }; }
  if (!b || b.app !== 'NEXORA' || typeof b.tables !== 'object' || b.tables === null) return { ok: false, error: 'not-a-backup' };
  if (b.format !== 2) return { ok: false, error: 'unsupported-format' };
  if (b.checksum !== (await sha(JSON.stringify(b.tables)))) return { ok: false, error: 'checksum-mismatch' };
  const counts: Record<string, number> = {};
  for (const def of SYNC_ORDER) {
    const rows = b.tables[def.name] ?? []; if (!Array.isArray(rows)) return { ok: false, error: `bad-table:${def.name}` };
    for (const r of rows) {
      if (typeof r !== 'object' || r === null) return { ok: false, error: `bad-row:${def.name}` };
      for (const k of def.keys) if (typeof (r as Row)[k] !== 'string' || !(r as Row)[k]) return { ok: false, error: `bad-key:${def.name}.${k}` };
      if (typeof (r as Row)['created_at'] !== 'string') return { ok: false, error: `bad-row:${def.name}` };
    }
    counts[def.name] = rows.length;
  }
  const ws = new Set<string>([...(b.tables['workspaces'] ?? []).map((r) => String(r['id'])), ...(await ctx.db.all<{ id: string }>('SELECT id FROM workspaces')).map((r) => r.id)]);
  for (const t of ['tasks', 'notes']) for (const r of b.tables[t] ?? []) if (!ws.has(String(r['workspace_id']))) return { ok: false, error: `missing-workspace:${t}` };
  return { ok: true, backup: b, counts };
}
export interface RestoreResult { inserted: number; updated: number; removed: number }

/** merge: add only what is missing, never touch existing rows. replace: make local data equal the backup (extra live rows are soft-deleted so the removal syncs).
 *  Requires `confirmed: true` — callers must show a confirmation first and offer a safety backup. */
export async function restoreBackup(ctx: Ctx, backup: Backup, o: { mode: 'merge' | 'replace'; confirmed: boolean }): Promise<RestoreResult> {
  if (!o.confirmed) throw new Error('Restore requires explicit confirmation');
  const res: RestoreResult = { inserted: 0, updated: 0, removed: 0 };
  await ctx.db.transaction(async () => {
    for (const def of SYNC_ORDER) {
      const keep = new Set<string>();
      for (const r of backup.tables[def.name] ?? []) {
        keep.add(def.keys.map((k) => String(r[k])).join('|'));
        const row: Row = {}; for (const c of def.cols) row[c] = r[c] ?? null;
        const cur = await getRow(ctx, def, row);
        if (!cur) { await putLocal(ctx, def, { ...row, version: 0 }, { silent: true }); res.inserted++; }
        else if (o.mode === 'replace' && contentKey(def, cur) !== contentKey(def, row)) { await putLocal(ctx, def, { ...row, version: cur['version'] }, { silent: true }); res.updated++; }
      }
      if (o.mode === 'replace') for (const cur of await ctx.db.all(`SELECT * FROM ${def.table} WHERE deleted_at IS NULL`))
        if (!keep.has(def.keys.map((k) => String(cur[k])).join('|'))) { await putLocal(ctx, def, { ...cur, deleted_at: ctx.now() }, { silent: true }); res.removed++; }
    }
  });
  ctx.events.emit(); return res;
}
