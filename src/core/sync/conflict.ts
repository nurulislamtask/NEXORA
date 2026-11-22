import type { Row } from '../db/types.ts';
import type { EntityDef } from './entities.ts';

export type Resolution = 'push-local' | 'take-remote' | 'noop' | 'keep-both-remote-wins' | 'resurrect-local';
export interface LocalState { baseVersion: number; dirty: boolean; deleted: boolean; contentKey: string }
export interface RemoteState { version: number; deleted: boolean; contentKey: string }

/** Pure decision table. Never silently discards an edit: differing concurrent edits are both kept. */
export function resolve(l: LocalState, r: RemoteState): Resolution {
  const remoteChanged = r.version > l.baseVersion;
  if (!l.dirty) return remoteChanged ? 'take-remote' : 'noop';
  if (!remoteChanged) return 'push-local';
  if (r.deleted && !l.deleted) return 'resurrect-local';   // our edit beats their delete
  if (l.deleted) return 'take-remote';                      // their edit beats our delete
  if (l.contentKey === r.contentKey) return 'take-remote';  // converged: no duplicate
  return 'keep-both-remote-wins';
}

const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v);
const isTime = (c: string): boolean => /(_at|_until)$/.test(c);
export const normTime = (v: unknown): unknown => { if (typeof v !== 'string') return v ?? null; const t = Date.parse(v); return Number.isNaN(t) ? v : new Date(t).toISOString(); };

/** Stable fingerprint of user-visible content (ignores ids, timestamps, versions). Works on local or remote-shaped rows. */
export function contentKey(def: EntityDef, row: Row): string {
  const parts = def.cols.filter((c) => !def.keys.includes(c) && c !== 'created_at').map((c) => {
    let v = row[c];
    if (def.json.includes(c)) { if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep */ } } v = canon(v ?? null); }
    else if (def.bool.includes(c)) v = v ? 1 : 0;
    else if (isTime(c)) v = normTime(v);
    return [c, v ?? null];
  });
  return JSON.stringify(parts);
}
