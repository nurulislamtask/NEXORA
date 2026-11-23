import type { Row } from '../db/types.ts';
import type { EntityDef } from './entities.ts';

export class SyncError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) { super(message); this.name = 'SyncError'; this.retryable = retryable; }
}
export type PushResult = { kind: 'ok'; version: number; updated_at: string } | { kind: 'conflict'; remote: Row | null };
/** Row shapes at this boundary are LOCAL shapes (bool=0/1, json=string); adapters convert to/from the server. */
export interface RemoteApi {
  push(def: EntityDef, row: Row, baseVersion: number): Promise<PushResult>;
  pull(def: EntityDef, since: string | null, limit: number): Promise<Row[]>;
  fetchOne(def: EntityDef, keys: Row): Promise<Row | null>;
}
export interface SyncReport { pushed: number; pulled: number; conflicts: number; blocked: number; error: string | null }
