import type { SqlDb } from '../db/types.ts';
import { Emitter } from './events.ts';

export interface Ctx { db: SqlDb; now(): string; uuid(): string; events: Emitter }
export function makeCtx(db: SqlDb, o: Partial<Pick<Ctx, 'now' | 'uuid'>> = {}): Ctx {
  return { db, events: new Emitter(), now: o.now ?? (() => new Date().toISOString()), uuid: o.uuid ?? (() => crypto.randomUUID()) };
}
