import type { Ctx } from './ctx.ts';
import { getRow, putLocal } from './mutate.ts';
import { createNote } from './notes.ts';
import { NOTES } from '../sync/entities.ts';

export interface StickyState { x: number | null; y: number | null; w: number; h: number; alwaysOnTop: boolean }
export const DEFAULT_STICKY: StickyState = { x: null, y: null, w: 300, h: 320, alwaysOnTop: true };
export function normalizeSticky(v: unknown): StickyState {
  const o = (typeof v === 'string' ? (() => { try { return JSON.parse(v) as unknown; } catch { return {}; } })() : v) as Record<string, unknown> | null ?? {};
  const num = (x: unknown, d: number | null, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
  return { x: num(o['x'], null, -10000, 20000), y: num(o['y'], null, -10000, 20000), w: num(o['w'], 300, 160, 2000)!, h: num(o['h'], 320, 120, 2000)!, alwaysOnTop: typeof o['alwaysOnTop'] === 'boolean' ? o['alwaysOnTop'] : true };
}
/** A sticky note is a note with kind='sticky' plus remembered window geometry; it syncs like any note. */
export async function createSticky(ctx: Ctx, wsId: string, color = '#fef3c7') {
  const n = await createNote(ctx, wsId, { color }); const row = (await getRow(ctx, NOTES, { id: n.id }))!;
  await putLocal(ctx, NOTES, { ...row, kind: 'sticky', sticky_state: JSON.stringify(DEFAULT_STICKY) }); return n;
}
export async function getStickyState(ctx: Ctx, id: string): Promise<StickyState> { const r = await getRow(ctx, NOTES, { id }); return normalizeSticky(r?.['sticky_state']); }
export async function saveStickyState(ctx: Ctx, id: string, patch: Partial<StickyState>): Promise<void> {
  const r = await getRow(ctx, NOTES, { id }); if (!r) return; const next = normalizeSticky({ ...normalizeSticky(r['sticky_state']), ...patch });
  if (JSON.stringify(next) !== JSON.stringify(normalizeSticky(r['sticky_state']))) await putLocal(ctx, NOTES, { ...r, sticky_state: JSON.stringify(next) }, { silent: true });
}
export const isStickyId = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
