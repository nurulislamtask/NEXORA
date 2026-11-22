import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Param, Row, SqlDb } from '../../src/core/db/types.ts';

export const MIGRATIONS_DIR = new URL('../../src-tauri/migrations/', import.meta.url);
/** Real SQLite with the real migration files applied in order. */
export function openTestDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
  let depth = 0;
  return {
    raw,
    async run(sql: string, params: Param[] = []) { raw.prepare(sql).run(...params); },
    async all<T = Row>(sql: string, params: Param[] = []) { return raw.prepare(sql).all(...params) as T[]; },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth++ > 0) { try { return await fn(); } finally { depth--; } }
      raw.exec('BEGIN');
      try { const r = await fn(); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
  };
}
