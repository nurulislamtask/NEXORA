import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import type { EntityDef } from '../sync/entities.ts';

export async function indexEntity(ctx: Ctx, def: EntityDef, row: Row): Promise<void> {
  if (!def.searchKind) return;
  const id = String(row['id']);
  await ctx.db.run('DELETE FROM search_idx WHERE kind=? AND ref_id=?', [def.searchKind, id]);
  if (row['deleted_at']) return;
  await ctx.db.run('INSERT INTO search_idx (kind, ref_id, title, body) VALUES (?,?,?,?)',
    [def.searchKind, id, String(row['title'] ?? ''), String(def.searchKind === 'note' ? row['body_text'] ?? '' : row['description'] ?? '')]);
}

/** Turn free text into a safe FTS5 prefix query (Unicode-aware: works for Bangla). */
export function ftsQuery(text: string): string | null {
  const toks = text.match(/[\p{L}\p{N}\p{M}]+/gu);
  return toks && toks.length ? toks.map((t) => `"${t}"*`).join(' ') : null;
}

export async function searchIds(ctx: Ctx, kind: 'task' | 'note', text: string, limit = 500): Promise<string[]> {
  const q = ftsQuery(text);
  if (!q) return [];
  const rows = await ctx.db.all<{ ref_id: string }>('SELECT ref_id FROM search_idx WHERE search_idx MATCH ? AND kind=? LIMIT ?', [q, kind, limit]);
  return rows.map((r) => r.ref_id);
}
