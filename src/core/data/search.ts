import type { Ctx } from './ctx.ts';
import { searchIds } from './searchIndex.ts';

export interface SearchHit { kind: 'task' | 'note' | 'habit' | 'tag' | 'clip'; id: string; title: string; snippet: string }
const like = (q: string): string => `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Unified search. Clipboard history is only searched when the caller opts in (privacy). */
export async function globalSearch(ctx: Ctx, text: string, o: { includeClipboard?: boolean; perKind?: number } = {}): Promise<SearchHit[]> {
  const q = text.trim(); if (!q) return []; const lim = o.perKind ?? 6; const out: SearchHit[] = [];
  for (const [kind, table, snippetCol] of [['task', 'tasks', 'description'], ['note', 'notes', 'body_text']] as const) {
    const ids = (await searchIds(ctx, kind, q)).slice(0, 200);
    for (const part of chunk(ids, 100)) for (const r of await ctx.db.all(`SELECT id, title, ${snippetCol} AS s FROM ${table} WHERE deleted_at IS NULL AND id IN (${part.map(() => '?').join(',')}) LIMIT ?`, [...part, lim]))
      if (out.filter((h) => h.kind === kind).length < lim) out.push({ kind, id: String(r['id']), title: String(r['title'] ?? ''), snippet: String(r['s'] ?? '').slice(0, 120) });
  }
  for (const r of await ctx.db.all("SELECT id, name, description FROM habits WHERE deleted_at IS NULL AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') LIMIT ?", [like(q), like(q), lim])) out.push({ kind: 'habit', id: String(r['id']), title: String(r['name']), snippet: String(r['description'] ?? '') });
  for (const r of await ctx.db.all("SELECT id, name FROM tags WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\' LIMIT ?", [like(q), lim])) out.push({ kind: 'tag', id: String(r['id']), title: String(r['name']), snippet: '' });
  if (o.includeClipboard) for (const r of await ctx.db.all("SELECT id, text FROM clipboard_items WHERE text LIKE ? ESCAPE '\\' ORDER BY last_used_at DESC, rowid DESC LIMIT ?", [like(q), lim])) out.push({ kind: 'clip', id: String(r['id']), title: String(r['text']).slice(0, 80), snippet: '' });
  return out;
}
export function pushRecent(list: readonly string[], q: string, max = 8): string[] { const t = q.trim(); return t ? [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, max) : [...list]; }
/** Splits text into segments for highlighting query matches (case-insensitive, Unicode-safe). */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const toks = (query.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); if (!toks.length) return [{ text, hit: false }];
  const re = new RegExp(`(${toks.join('|')})`, 'giu'); return text.split(re).filter((x) => x !== '').map((x) => ({ text: x, hit: re.test(x) && (re.lastIndex = 0, true) }));
}
