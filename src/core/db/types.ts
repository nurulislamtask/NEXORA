export type Param = string | number | null;
export type Row = Record<string, unknown>;
/** Minimal async SQL surface. Implemented by Tauri (plugin-sql) in the app and node:sqlite in tests. */
export interface SqlDb {
  run(sql: string, params?: Param[]): Promise<void>;
  all<T = Row>(sql: string, params?: Param[]): Promise<T[]>;
  /** Atomic on node:sqlite. On the Tauri pool adapter this is best-effort (see docs/ARCHITECTURE.md). */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
