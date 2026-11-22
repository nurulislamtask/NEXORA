import type { Ctx } from '../data/ctx.ts';
import type { Row } from '../db/types.ts';
import { entityId, getRow, putLocal, putRemote } from '../data/mutate.ts';
import { SYNC_ORDER, entityByName, type EntityDef } from './entities.ts';
import { contentKey, normTime, resolve } from './conflict.ts';
import { SyncError, type RemoteApi, type SyncReport } from './types.ts';

interface OutboxItem { seq: number; entity: string; entity_id: string; op: string; base_version: number; attempts: number }
const keyVals = (def: EntityDef, id: string): Row => Object.fromEntries(def.keys.map((k, i) => [k, id.split('|')[i]]));
const whereKeys = (def: EntityDef): string => def.keys.map((k) => `${k}=?`).join(' AND ');
const TIME = /(_at|_until)$/;

/** Server row -> local shape (the adapter already converted types; here we normalise timestamps). */
function normaliseRemote(def: EntityDef, r: Row): Row {
  const o: Row = {}; for (const c of [...def.cols, 'version', 'updated_at']) o[c] = TIME.test(c) ? normTime(r[c]) : (r[c] ?? null);
  return o;
}
async function getState(ctx: Ctx, key: string): Promise<string | null> { return (await ctx.db.all<{ value: string }>('SELECT value FROM sync_state WHERE key=?', [key]))[0]?.value ?? null; }
export async function setState(ctx: Ctx, key: string, value: string): Promise<void> { await ctx.db.run('INSERT INTO sync_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]); }
export { getState };

async function dropOutbox(ctx: Ctx, def: EntityDef, row: Row): Promise<void> { await ctx.db.run('DELETE FROM sync_outbox WHERE entity=? AND entity_id=?', [def.name, entityId(def, row)]); }

/** Saves the user's local version as a separate record so neither side's edit is lost. */
async function makeConflictCopy(ctx: Ctx, def: EntityDef, local: Row, remoteId: string): Promise<void> {
  const copy: Row = { ...local, id: ctx.uuid(), version: 0, created_at: ctx.now() };
  if ('title' in copy && typeof copy['title'] === 'string') copy['title'] = `${copy['title'] || ''} (conflict copy)`.trim();
  if (def.name === 'notes') copy['conflict_of'] = remoteId;
  if (def.name === 'tasks') copy['parent_task_id'] = null;
  await putLocal(ctx, def, copy);
}

/** Shared by push-time (CAS failed) and pull-time (remote moved while local is dirty). Returns true if a conflict copy was made / data re-queued. */
async function resolveConflict(ctx: Ctx, def: EntityDef, local: Row, remoteRaw: Row, baseVersion: number): Promise<{ conflict: boolean; requeue: boolean }> {
  const remote = normaliseRemote(def, remoteRaw);
  const lDeleted = !!local['deleted_at']; const rDeleted = !!remote['deleted_at'];
  let decision = resolve({ baseVersion, dirty: true, deleted: lDeleted, contentKey: contentKey(def, local) }, { version: Number(remote['version']), deleted: rDeleted, contentKey: contentKey(def, remote) });
  if (def.conflict === 'prefer-live' && decision === 'keep-both-remote-wins') decision = 'take-remote';
  if (def.conflict === 'prefer-live' && decision === 'take-remote' && !lDeleted && rDeleted) decision = 'resurrect-local';
  switch (decision) {
    case 'take-remote': await putRemote(ctx, def, remote); await dropOutbox(ctx, def, local); return { conflict: false, requeue: false };
    case 'resurrect-local': {
      await ctx.db.run(`UPDATE ${def.table} SET version=? WHERE ${whereKeys(def)}`, [Number(remote['version']), ...def.keys.map((k) => String(local[k]))]);
      await ctx.db.run('UPDATE sync_outbox SET base_version=?, attempts=0, last_error=NULL WHERE entity=? AND entity_id=?', [Number(remote['version']), def.name, entityId(def, local)]);
      return { conflict: false, requeue: true };
    }
    case 'keep-both-remote-wins': await makeConflictCopy(ctx, def, local, String(remote['id'])); await putRemote(ctx, def, remote); await dropOutbox(ctx, def, local); return { conflict: true, requeue: true };
    default: return { conflict: false, requeue: false };
  }
}

async function pushPhase(ctx: Ctx, remote: RemoteApi, rep: SyncReport): Promise<boolean> {
  let requeue = false;
  const items = await ctx.db.all<OutboxItem>('SELECT * FROM sync_outbox WHERE attempts < 8 ORDER BY seq');
  items.sort((a, b) => SYNC_ORDER.indexOf(entityByName(a.entity)) - SYNC_ORDER.indexOf(entityByName(b.entity)) || a.seq - b.seq);
  for (const it of items) {
    const def = entityByName(it.entity); const row = await getRow(ctx, def, keyVals(def, it.entity_id));
    if (!row) { await ctx.db.run('DELETE FROM sync_outbox WHERE seq=?', [it.seq]); continue; }
    try {
      const res = await remote.push(def, row, it.base_version);
      if (res.kind === 'ok') {
        const fresh = await getRow(ctx, def, keyVals(def, it.entity_id));
        const edited = !!fresh && fresh['updated_at'] !== row['updated_at'];   // user edited while the request was in flight
        await ctx.db.run(`UPDATE ${def.table} SET version=?, dirty=? WHERE ${whereKeys(def)}`, [res.version, edited ? 1 : 0, ...def.keys.map((k) => String(row[k]))]);
        if (edited) await ctx.db.run('UPDATE sync_outbox SET base_version=?, attempts=0, last_error=NULL WHERE seq=?', [res.version, it.seq]);
        else await ctx.db.run('DELETE FROM sync_outbox WHERE seq=?', [it.seq]);
        rep.pushed++;
      } else {
        const r = res.remote ?? (await remote.fetchOne(def, keyVals(def, it.entity_id)));
        if (!r) throw new SyncError(`Server rejected ${def.name} ${it.entity_id} and no remote copy exists`, false);
        const out = await resolveConflict(ctx, def, row, r, it.base_version);
        if (out.conflict) rep.conflicts++; if (out.requeue) requeue = true;
      }
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError(e instanceof Error ? e.message : String(e), true);
      await ctx.db.run('UPDATE sync_outbox SET attempts=attempts+1, last_error=? WHERE seq=?', [err.message.slice(0, 500), it.seq]);
      if (err.retryable) { rep.error = err.message; return false; }     // offline/transient: stop, keep order, retry later
      await ctx.db.run('UPDATE sync_outbox SET attempts=99 WHERE seq=?', [it.seq]); rep.blocked++;  // poison record: park it, keep syncing the rest
    }
  }
  return requeue;
}

async function pullPhase(ctx: Ctx, remote: RemoteApi, rep: SyncReport, limit: number): Promise<void> {
  for (const def of SYNC_ORDER) {
    let cursor = await getState(ctx, `cursor:${def.name}`);
    for (;;) {
      const rows = await remote.pull(def, cursor, limit);
      for (const raw of rows) {
        const r = normaliseRemote(def, raw); const local = await getRow(ctx, def, r);
        const rv = Number(r['version']);
        if (!local) await putRemote(ctx, def, r);
        else if (Number(local['dirty']) === 0) { if (rv >= Number(local['version'])) await putRemote(ctx, def, r); }
        else if (rv > Number(local['version'])) {
          const ob = (await ctx.db.all<OutboxItem>('SELECT * FROM sync_outbox WHERE entity=? AND entity_id=?', [def.name, entityId(def, r)]))[0];
          const out = await resolveConflict(ctx, def, local, r, ob?.base_version ?? Number(local['version']));
          if (out.conflict) rep.conflicts++;
        }
        rep.pulled++;
      }
      const next = rows.reduce<string | null>((m, r) => { const u = normTime(r['updated_at']) as string; return m === null || u > m ? u : m; }, cursor);
      if (next && next !== cursor) await setState(ctx, `cursor:${def.name}`, next);
      if (rows.length < limit || next === cursor) break;
      cursor = next;
    }
  }
}

/** One full sync pass: push local changes (ordered, CAS-versioned), then pull remote changes. Safe to call repeatedly (idempotent). */
export async function syncOnce(ctx: Ctx, remote: RemoteApi, opts: { pullLimit?: number } = {}): Promise<SyncReport> {
  const rep: SyncReport = { pushed: 0, pulled: 0, conflicts: 0, blocked: 0, error: null };
  try {
    for (let pass = 0; pass < 3; pass++) if (!(await pushPhase(ctx, remote, rep))) break;
    if (!rep.error) await pullPhase(ctx, remote, rep, opts.pullLimit ?? 500);
    for (let pass = 0; pass < 2 && !rep.error; pass++) { const left = await ctx.db.all('SELECT seq FROM sync_outbox WHERE attempts < 8 LIMIT 1'); if (!left.length) break; await pushPhase(ctx, remote, rep); }
    if (!rep.error) await setState(ctx, 'last_sync_at', ctx.now());
  } catch (e) { rep.error = e instanceof Error ? e.message : String(e); }
  if (rep.pulled || rep.pushed || rep.conflicts) ctx.events.emit();
  return rep;
}
export async function pendingCount(ctx: Ctx): Promise<number> { return Number((await ctx.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox')) [0]?.n ?? 0); }
