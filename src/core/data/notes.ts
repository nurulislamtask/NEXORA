import type { Ctx } from './ctx.ts';
import type { Param, Row } from '../db/types.ts';
import { getRow, putLocal } from './mutate.ts';
import { searchIds } from './searchIndex.ts';
import { labelsFor, setLinks, type Tag } from './tags.ts';
import { htmlToText, sanitizeHtml } from './sanitize.ts';
import { NOTES, NOTE_TAGS } from '../sync/entities.ts';

export interface Note { id: string; workspace_id: string; title: string; html: string; body_text: string; color: string | null; is_pinned: boolean; archived_at: string | null; deleted_at: string | null; created_at: string; updated_at: string }
export interface NoteView extends Note { labels: Tag[] }
export const NOTE_COLORS = ['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#ede9fe', '#ffedd5', '#e5e7eb'] as const;

function htmlOf(content: unknown): string {
  if (typeof content !== 'string') return '';
  try { const c = JSON.parse(content) as { html?: unknown }; return typeof c.html === 'string' ? sanitizeHtml(c.html) : ''; } catch { return ''; }
}
const fromDb = (r: Row): Note => ({ id: String(r['id']), workspace_id: String(r['workspace_id']), title: String(r['title']), html: htmlOf(r['content']), body_text: String(r['body_text']),
  color: (r['color'] as string | null) ?? null, is_pinned: Number(r['is_pinned']) === 1, archived_at: (r['archived_at'] as string | null) ?? null, deleted_at: (r['deleted_at'] as string | null) ?? null,
  created_at: String(r['created_at']), updated_at: String(r['updated_at']) });
const contentOf = (html: string): { json: string; text: string } => { const clean = sanitizeHtml(html); return { json: JSON.stringify({ format: 'html', html: clean }), text: htmlToText(clean) }; };

export interface NoteInput { title?: string; html?: string; color?: string | null; is_pinned?: boolean; labels?: string[] }
function validate(i: NoteInput): void {
  if (i.title !== undefined && i.title.length > 300) throw new Error('Title too long (max 300)');
  if (i.html !== undefined && i.html.length > 2_000_000) throw new Error('Note too large');
  if (i.color && !/^#[0-9a-f]{6}$/i.test(i.color)) throw new Error('Invalid color');
}

export async function createNote(ctx: Ctx, workspaceId: string, input: NoteInput = {}): Promise<Note> {
  validate(input); const c = contentOf(input.html ?? '');
  const row: Row = { id: ctx.uuid(), workspace_id: workspaceId, kind: 'rich', title: input.title ?? '', body_text: c.text, content: c.json, color: input.color ?? null, is_pinned: input.is_pinned ?? false,
    is_favorite: false, archived_at: null, sticky_state: null, conflict_of: null, created_at: ctx.now(), deleted_at: null, version: 0 };
  await putLocal(ctx, NOTES, row);
  if (input.labels?.length) await setLinks(ctx, { def: NOTE_TAGS, ownerKey: 'note_id' }, String(row['id']), input.labels);
  return fromDb(row);
}
export async function getNote(ctx: Ctx, id: string): Promise<Note | null> { const r = await getRow(ctx, NOTES, { id }); return r ? fromDb(r) : null; }
export async function updateNote(ctx: Ctx, id: string, patch: NoteInput): Promise<Note> {
  validate(patch); const cur = await getRow(ctx, NOTES, { id }); if (!cur) throw new Error('Note not found');
  const next: Row = { ...cur };
  if (patch.title !== undefined) next['title'] = patch.title;
  if (patch.html !== undefined) { const c = contentOf(patch.html); next['content'] = c.json; next['body_text'] = c.text; }
  if (patch.color !== undefined) next['color'] = patch.color;
  if (patch.is_pinned !== undefined) next['is_pinned'] = patch.is_pinned;
  const saved = await putLocal(ctx, NOTES, next);
  if (patch.labels) await setLinks(ctx, { def: NOTE_TAGS, ownerKey: 'note_id' }, id, patch.labels);
  return fromDb(saved);
}
export const archiveNote = async (ctx: Ctx, id: string, on = true): Promise<void> => { const c = await getRow(ctx, NOTES, { id }); if (c) await putLocal(ctx, NOTES, { ...c, archived_at: on ? ctx.now() : null }); };
export const trashNote = async (ctx: Ctx, id: string, on = true): Promise<void> => { const c = await getRow(ctx, NOTES, { id }); if (c) await putLocal(ctx, NOTES, { ...c, deleted_at: on ? ctx.now() : null }); };

export interface NoteQuery { view: 'active' | 'archived' | 'trash'; color?: string; tagId?: string; search?: string }
export async function listNotes(ctx: Ctx, q: NoteQuery): Promise<NoteView[]> {
  const w: string[] = []; const p: Param[] = [];
  if (q.view === 'trash') w.push('deleted_at IS NOT NULL'); else { w.push('deleted_at IS NULL'); w.push(q.view === 'archived' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'); }
  if (q.color) { w.push('color=?'); p.push(q.color); }
  if (q.tagId) { w.push('id IN (SELECT note_id FROM note_tags WHERE tag_id=? AND deleted_at IS NULL)'); p.push(q.tagId); }
  if (q.search?.trim()) { const ids = await searchIds(ctx, 'note', q.search); if (!ids.length) return []; w.push(`id IN (${ids.map(() => '?').join(',')})`); p.push(...ids); }
  const notes = (await ctx.db.all(`SELECT * FROM notes WHERE ${w.join(' AND ')} ORDER BY is_pinned DESC, updated_at DESC LIMIT 1000`, p)).map(fromDb);
  const labels = await labelsFor(ctx, 'note_tags', 'note_id', notes.map((n) => n.id));
  return notes.map((n) => ({ ...n, labels: labels.get(n.id) ?? [] }));
}

export const wordCount = (text: string): number => (text.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).length;

export interface Timers { set(f: () => void, ms: number): unknown; clear(h: unknown): void }
/** Debounced auto-save. flush() must be called on blur/unmount so no edit is lost. */
export function createAutosaver<T>(save: (v: T) => Promise<void>, delayMs = 800, timers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }) {
  let handle: unknown = null; let pending: { v: T } | null = null; let chain: Promise<void> = Promise.resolve();
  const run = (): Promise<void> => { const job = pending; pending = null; handle = null; if (!job) return chain; chain = chain.then(() => save(job.v)); return chain; };
  return {
    schedule(v: T): void { pending = { v }; if (handle !== null) timers.clear(handle); handle = timers.set(() => { void run(); }, delayMs); },
    async flush(): Promise<void> { if (handle !== null) timers.clear(handle); await run(); },
    cancel(): void { if (handle !== null) timers.clear(handle); handle = null; pending = null; },
  };
}
