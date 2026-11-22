import Database from '@tauri-apps/plugin-sql';
import type { Param, Row, SqlDb } from './types.ts';

const toDollar = (sql: string): string => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

/** Production adapter. Migrations are applied by the Rust side (see src-tauri/src/main.rs).
 *  NOTE: plugin-sql uses a connection pool, so BEGIN/COMMIT across calls is not guaranteed to hit one connection;
 *  transaction() therefore runs statements sequentially without BEGIN. Writes are ordered so a crash leaves
 *  `dirty=1` rows (re-pushed later) rather than lost data. UNTESTED on a real device. */
export async function openTauriDb(): Promise<SqlDb> {
  const db = await Database.load('sqlite:nexora.db');
  await db.execute('PRAGMA foreign_keys = ON');
  return {
    async run(sql: string, params: Param[] = []) { await db.execute(toDollar(sql), params); },
    async all<T = Row>(sql: string, params: Param[] = []) { return db.select<T[]>(toDollar(sql), params); },
    async transaction<T>(fn: () => Promise<T>) { return fn(); },
  };
}
