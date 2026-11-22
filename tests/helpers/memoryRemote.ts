import type { Row } from '../../src/core/db/types.ts';
import type { EntityDef } from '../../src/core/sync/entities.ts';
import type { PushResult, RemoteApi } from '../../src/core/sync/types.ts';
import { SyncError } from '../../src/core/sync/types.ts';

/** Test double for the server: enforces version CAS, bumps version/updated_at like the SQL trigger. TEST ONLY. */
export class MemoryRemote implements RemoteApi {
  tables = new Map<string, Map<string, Row>>(); clock = 1_800_000_000_000; online = true; failNext: SyncError | null = null; pushCalls = 0;
  private t(def: EntityDef) { let m = this.tables.get(def.name); if (!m) { m = new Map(); this.tables.set(def.name, m); } return m; }
  private id(def: EntityDef, r: Row) { return def.keys.map((k) => String(r[k])).join('|'); }
  private guard() { if (!this.online) throw new SyncError('network down', true); if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } }
  private stamp() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  async push(def: EntityDef, row: Row, base: number): Promise<PushResult> {
    this.guard(); this.pushCalls++; const m = this.t(def); const id = this.id(def, row); const cur = m.get(id);
    const data: Row = {}; for (const c of def.cols) data[c] = row[c] ?? null;
    if (base === 0) { if (cur) return { kind: 'conflict', remote: { ...cur } }; const n = { ...data, version: 1, updated_at: this.stamp() }; m.set(id, n); return { kind: 'ok', version: 1, updated_at: n.updated_at as string }; }
    if (!cur || Number(cur['version']) !== base) return { kind: 'conflict', remote: cur ? { ...cur } : null };
    const n = { ...data, version: base + 1, updated_at: this.stamp() }; m.set(id, n); return { kind: 'ok', version: base + 1, updated_at: n.updated_at as string };
  }
  async pull(def: EntityDef, since: string | null, limit: number): Promise<Row[]> {
    this.guard(); return [...this.t(def).values()].filter((r) => !since || (r['updated_at'] as string) >= since).sort((a, b) => ((a['updated_at'] as string) < (b['updated_at'] as string) ? -1 : 1)).slice(0, limit).map((r) => ({ ...r }));
  }
  async fetchOne(def: EntityDef, keys: Row): Promise<Row | null> { this.guard(); const r = this.t(def).get(this.id(def, keys)); return r ? { ...r } : null; }
  /** Simulate another device editing a record directly on the server. */
  serverEdit(def: EntityDef, id: string, patch: Row): void { const m = this.t(def); const cur = m.get(id)!; m.set(id, { ...cur, ...patch, version: Number(cur['version']) + 1, updated_at: this.stamp() }); }
  get(def: EntityDef, id: string): Row | undefined { return this.t(def).get(id); }
}
