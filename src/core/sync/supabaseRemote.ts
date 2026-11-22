import type { Row } from '../db/types.ts';
import type { EntityDef } from './entities.ts';
import { SyncError, type PushResult, type RemoteApi } from './types.ts';

export interface SbError { code?: string; message: string }
export interface SbQuery extends PromiseLike<{ data: unknown; error: SbError | null }> {
  select(cols?: string): SbQuery; insert(v: unknown): SbQuery; update(v: unknown): SbQuery; eq(c: string, v: unknown): SbQuery;
  gte(c: string, v: unknown): SbQuery; order(c: string, o?: { ascending: boolean }): SbQuery; limit(n: number): SbQuery; maybeSingle(): SbQuery;
}
/** The subset of supabase-js we use; the real client is cast to this in app code. */
export interface SbClient { from(table: string): SbQuery }

const toServer = (def: EntityDef, row: Row, userId: string): Row => {
  const o: Row = { user_id: userId };
  for (const c of def.cols) { let v = row[c] ?? null; if (def.bool.includes(c)) v = Number(v) === 1; else if (def.json.includes(c) && typeof v === 'string') v = JSON.parse(v); o[c] = v; }
  return o;
};
const toLocal = (def: EntityDef, r: Row): Row => {
  const o: Row = { ...r }; delete o['user_id'];
  for (const c of def.bool) if (c in o) o[c] = o[c] ? 1 : 0;
  for (const c of def.json) if (c in o && o[c] !== null && typeof o[c] !== 'string') o[c] = JSON.stringify(o[c]);
  return o;
};
const fail = (e: SbError): SyncError => new SyncError(e.message, !(e.code && /^(22|23|42|PGRST|PGRST\d+)/.test(e.code)));

export class SupabaseRemote implements RemoteApi {
  private sb: SbClient; private userId: string;
  constructor(sb: SbClient, userId: string) { this.sb = sb; this.userId = userId; }
  async push(def: EntityDef, row: Row, base: number): Promise<PushResult> {
    const payload = toServer(def, row, this.userId);
    if (base === 0) {
      const { data, error } = await this.sb.from(def.table).insert(payload).select('version,updated_at');
      if (error) {
        if (error.code === '23505') { const existing = await this.fetchOne(def, row); if (existing) return { kind: 'conflict', remote: existing }; throw new SyncError(`Duplicate ${def.name}: ${error.message}`, false); }
        throw fail(error);
      }
      const r = (data as Row[])[0]; if (!r) throw new SyncError('Insert returned no row', true);
      return { kind: 'ok', version: Number(r['version']), updated_at: String(r['updated_at']) };
    }
    let q = this.sb.from(def.table).update(Object.fromEntries(Object.entries(payload).filter(([k]) => !def.keys.includes(k) && k !== 'user_id')));
    for (const k of def.keys) q = q.eq(k, row[k]);
    const { data, error } = await q.eq('version', base).select('version,updated_at');   // compare-and-set on version
    if (error) throw fail(error);
    const r = (data as Row[])[0];
    return r ? { kind: 'ok', version: Number(r['version']), updated_at: String(r['updated_at']) } : { kind: 'conflict', remote: null };
  }
  async pull(def: EntityDef, since: string | null, limit: number): Promise<Row[]> {
    let q = this.sb.from(def.table).select('*'); if (since) q = q.gte('updated_at', since);
    const { data, error } = await q.order('updated_at', { ascending: true }).limit(limit);
    if (error) throw fail(error);
    return (data as Row[]).map((r) => toLocal(def, r));
  }
  async fetchOne(def: EntityDef, keys: Row): Promise<Row | null> {
    let q = this.sb.from(def.table).select('*'); for (const k of def.keys) q = q.eq(k, keys[k]);
    const { data, error } = await q.maybeSingle(); if (error) throw fail(error);
    return data ? toLocal(def, data as Row) : null;
  }
}
