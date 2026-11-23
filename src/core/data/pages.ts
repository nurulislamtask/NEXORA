import type { Ctx } from './ctx.ts';
import type { Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { PAGES, PAGE_BLOCKS } from '../sync/entities.ts';
import { sanitizeHtml } from './sanitize.ts';

export const BLOCK_TYPES = ['paragraph', 'heading', 'todo', 'bullet', 'quote', 'code', 'divider'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export interface Page { id: string; workspace_id: string; parent_page_id: string | null; title: string; icon: string | null; sort_order: number }
export interface Block { id: string; page_id: string; type: BlockType; text: string; checked: boolean; sort_order: number }
export interface PageNode extends Page { children: PageNode[]; depth: number }
const MAX_DEPTH = 8;
const parseData = (d: unknown): { text: string; checked: boolean } => { try { const o = typeof d === 'string' ? JSON.parse(d) : d; return { text: String((o as { text?: unknown })?.text ?? ''), checked: (o as { checked?: unknown })?.checked === true }; } catch { return { text: '', checked: false }; } };
const toBlock = (r: Row): Block => ({ id: String(r['id']), page_id: String(r['page_id']), type: r['type'] as BlockType, ...parseData(r['data']), sort_order: Number(r['sort_order']) });

async function depthOf(ctx: Ctx, id: string | null): Promise<number> {
  let d = 0; let cur = id; const seen = new Set<string>();
  while (cur) { if (seen.has(cur)) throw new Error('Page tree contains a cycle'); seen.add(cur); const r = await getRow(ctx, PAGES, { id: cur }); cur = (r?.['parent_page_id'] as string | null) ?? null; d++; }
  return d;
}
async function nextOrder(ctx: Ctx, table: 'pages' | 'page_blocks', where: string, arg: string | null): Promise<number> {
  const r = await ctx.db.all<{ m: number | null }>(`SELECT MAX(sort_order) m FROM ${table} WHERE deleted_at IS NULL AND ${where}`, [arg]);
  return (r[0]?.m ?? 0) + 1;
}
export async function createPage(ctx: Ctx, workspaceId: string, title = '', parentId: string | null = null): Promise<Page> {
  if (title.length > 300) throw new Error('Page title is too long');
  if (parentId) { const p = await getRow(ctx, PAGES, { id: parentId }); if (!p || p['deleted_at']) throw new Error('Parent page not found'); if ((await depthOf(ctx, parentId)) >= MAX_DEPTH) throw new Error('Pages are nested too deeply'); }
  const row: Row = { id: ctx.uuid(), workspace_id: workspaceId, parent_page_id: parentId, title: title.trim(), icon: null, cover_path: null, sort_order: await nextOrder(ctx, 'pages', 'parent_page_id IS ?', parentId), created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, PAGES, row); return row as unknown as Page;
}
export async function renamePage(ctx: Ctx, id: string, title: string, icon?: string | null): Promise<void> {
  if (title.length > 300) throw new Error('Page title is too long');
  const cur = await getRow(ctx, PAGES, { id }); if (!cur) throw new Error('Page not found');
  await putLocal(ctx, PAGES, { ...cur, title: title.trim(), ...(icon !== undefined ? { icon } : {}) });
}
/** Re-parent a page. Refuses to move a page into itself or its own descendants (would orphan the subtree into a cycle). */
export async function movePage(ctx: Ctx, id: string, newParentId: string | null): Promise<void> {
  const cur = await getRow(ctx, PAGES, { id }); if (!cur) throw new Error('Page not found');
  for (let a: string | null = newParentId; a; ) { if (a === id) throw new Error('Cannot move a page into itself or its sub-pages'); const r = await getRow(ctx, PAGES, { id: a }); a = (r?.['parent_page_id'] as string | null) ?? null; }
  if (newParentId && (await getRow(ctx, PAGES, { id: newParentId }))?.['deleted_at']) throw new Error('Parent page not found');
  if (newParentId && (await depthOf(ctx, newParentId)) + (await subtreeHeight(ctx, id)) > MAX_DEPTH) throw new Error('Pages are nested too deeply');
  await putLocal(ctx, PAGES, { ...cur, parent_page_id: newParentId, sort_order: await nextOrder(ctx, 'pages', 'parent_page_id IS ?', newParentId) });
}
async function subtreeHeight(ctx: Ctx, id: string): Promise<number> {
  const kids = await ctx.db.all<{ id: string }>('SELECT id FROM pages WHERE parent_page_id=? AND deleted_at IS NULL', [id]);
  let h = 0; for (const k of kids) h = Math.max(h, await subtreeHeight(ctx, k.id)); return h + 1;
}
/** Soft-deletes the page and its whole subtree, including blocks. */
export async function deletePage(ctx: Ctx, id: string): Promise<void> {
  const cur = await getRow(ctx, PAGES, { id }); if (!cur || cur['deleted_at']) return;
  for (const k of await ctx.db.all<{ id: string }>('SELECT id FROM pages WHERE parent_page_id=? AND deleted_at IS NULL', [id])) await deletePage(ctx, k.id);
  for (const b of await ctx.db.all('SELECT * FROM page_blocks WHERE page_id=? AND deleted_at IS NULL', [id])) await putLocal(ctx, PAGE_BLOCKS, { ...b, deleted_at: ctx.now() }, { silent: true });
  await putLocal(ctx, PAGES, { ...cur, deleted_at: ctx.now() });
}
export async function pageTree(ctx: Ctx): Promise<PageNode[]> {
  const rows = (await ctx.db.all<Page>('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY sort_order, created_at')).map((p) => ({ ...p, children: [] as PageNode[], depth: 0 }));
  const by = new Map(rows.map((r) => [r.id, r])); const roots: PageNode[] = [];
  for (const r of rows) { const par = r.parent_page_id ? by.get(r.parent_page_id) : undefined; if (par) par.children.push(r); else roots.push(r); } // orphans (parent deleted/not yet synced) surface at top level
  const walk = (n: PageNode[], d: number): void => { for (const x of n) { x.depth = d; walk(x.children, d + 1); } }; walk(roots, 0); return roots;
}
export async function getPage(ctx: Ctx, id: string): Promise<Page | null> { const r = await getRow(ctx, PAGES, { id }); return r && !r['deleted_at'] ? (r as unknown as Page) : null; }
export async function listBlocks(ctx: Ctx, pageId: string): Promise<Block[]> { return (await ctx.db.all('SELECT * FROM page_blocks WHERE page_id=? AND deleted_at IS NULL ORDER BY sort_order, created_at', [pageId])).map(toBlock); }
function cleanText(type: BlockType, text: string): string { if (text.length > 20000) throw new Error('Block is too long'); return type === 'code' ? text : sanitizeHtml(text); }
export async function addBlock(ctx: Ctx, pageId: string, type: BlockType, text = '', afterId: string | null = null): Promise<Block> {
  if (!BLOCK_TYPES.includes(type)) throw new Error('Unknown block type'); if (!(await getPage(ctx, pageId))) throw new Error('Page not found');
  const blocks = await listBlocks(ctx, pageId); let order: number;
  if (!afterId) order = (blocks.at(-1)?.sort_order ?? 0) + 1;
  else { const i = blocks.findIndex((b) => b.id === afterId); if (i < 0) throw new Error('Block not found'); const a = blocks[i]!.sort_order; const n = blocks[i + 1]?.sort_order; order = n === undefined ? a + 1 : (a + n) / 2; }
  const row: Row = { id: ctx.uuid(), page_id: pageId, type, data: JSON.stringify({ text: cleanText(type, text), checked: false }), sort_order: order, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, PAGE_BLOCKS, row); return toBlock(row);
}
export async function updateBlock(ctx: Ctx, id: string, patch: { text?: string; checked?: boolean; type?: BlockType }): Promise<void> {
  const cur = await getRow(ctx, PAGE_BLOCKS, { id }); if (!cur) throw new Error('Block not found');
  const type = (patch.type ?? cur['type']) as BlockType; if (!BLOCK_TYPES.includes(type)) throw new Error('Unknown block type');
  const d = parseData(cur['data']);
  await putLocal(ctx, PAGE_BLOCKS, { ...cur, type, data: JSON.stringify({ text: patch.text !== undefined ? cleanText(type, patch.text) : d.text, checked: patch.checked ?? d.checked }) });
}
export async function deleteBlock(ctx: Ctx, id: string): Promise<void> { const c = await getRow(ctx, PAGE_BLOCKS, { id }); if (c) await putLocal(ctx, PAGE_BLOCKS, { ...c, deleted_at: ctx.now() }); }
export async function moveBlock(ctx: Ctx, id: string, toIndex: number): Promise<void> {
  const cur = await getRow(ctx, PAGE_BLOCKS, { id }); if (!cur) throw new Error('Block not found');
  const others = (await listBlocks(ctx, String(cur['page_id']))).filter((b) => b.id !== id); const i = Math.max(0, Math.min(toIndex, others.length));
  const lo = others[i - 1]?.sort_order; const hi = others[i]?.sort_order;
  const order = lo === undefined ? (hi === undefined ? 1 : hi - 1) : hi === undefined ? lo + 1 : (lo + hi) / 2;
  await putLocal(ctx, PAGE_BLOCKS, { ...cur, sort_order: order });
}
