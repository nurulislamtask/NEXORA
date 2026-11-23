import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { TAGS } from '../sync/entities.ts';

export interface Tag { id: string; name: string; color: string | null }
export const normalizeLabel = (s: string): string => s.trim().replace(/\s+/g, ' ');

/** Case-insensitive get-or-create (matches the cloud unique index on lower(name)). Revives a trashed tag. */
export async function ensureTag(ctx: Ctx, rawName: string): Promise<Tag> {
  const name = normalizeLabel(rawName);
  if (!name || name.length > 60) throw new Error('Label must be 1-60 characters');
  const hit = (await ctx.db.all('SELECT * FROM tags WHERE lower(name)=lower(?) ORDER BY deleted_at IS NOT NULL LIMIT 1', [name]))[0];
  if (hit) {
    if (hit['deleted_at']) await putLocal(ctx, TAGS, { ...hit, deleted_at: null });
    return { id: String(hit['id']), name: String(hit['name']), color: (hit['color'] as string | null) ?? null };
  }
  const row: Row = { id: ctx.uuid(), name, color: null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, TAGS, row);
  return { id: String(row['id']), name, color: null };
}
export async function listTags(ctx: Ctx): Promise<Tag[]> {
  return ctx.db.all<Tag>('SELECT id, name, color FROM tags WHERE deleted_at IS NULL ORDER BY lower(name)');
}

/** Replace the label set of an entity through its join table (soft-deleting removed links so deletions sync). */
export async function setLinks(ctx: Ctx, link: { def: import('../sync/entities.ts').EntityDef; ownerKey: 'task_id' | 'note_id' }, ownerId: string, names: string[]): Promise<void> {
  const wanted = new Map<string, Tag>();
  for (const n of names) { const t = await ensureTag(ctx, n); wanted.set(t.id, t); }
  const existing = await ctx.db.all(`SELECT * FROM ${link.def.table} WHERE ${link.ownerKey}=?`, [ownerId]);
  for (const row of existing) {
    const tagId = String(row['tag_id']); const live = !row['deleted_at']; const want = wanted.has(tagId);
    if (live && !want) await putLocal(ctx, link.def, { ...row, deleted_at: ctx.now() });
    else if (!live && want) await putLocal(ctx, link.def, { ...row, deleted_at: null });
    wanted.delete(tagId);
  }
  for (const t of wanted.values()) await putLocal(ctx, link.def, { [link.ownerKey]: ownerId, tag_id: t.id, created_at: ctx.now(), deleted_at: null, version: 0 });
}
export async function labelsFor(ctx: Ctx, def: 'task_tags' | 'note_tags', ownerKey: string, ids: string[]): Promise<Map<string, Tag[]>> {
  const out = new Map<string, Tag[]>();
  if (!ids.length) return out;
  const rows = await ctx.db.all<{ owner: string; id: string; name: string; color: string | null }>(
    `SELECT l.${ownerKey} AS owner, t.id, t.name, t.color FROM ${def} l JOIN tags t ON t.id=l.tag_id WHERE l.deleted_at IS NULL AND t.deleted_at IS NULL AND l.${ownerKey} IN (${ids.map(() => '?').join(',')}) ORDER BY lower(t.name)`, ids);
  for (const r of rows) { const a = out.get(r.owner) ?? []; a.push({ id: r.id, name: r.name, color: r.color }); out.set(r.owner, a); }
  return out;
}
