import type { Ctx } from './ctx.ts';
import type { Param } from '../db/types.ts';
import { createNote } from './notes.ts';
import { createTask } from './tasks.ts';

export interface ClipSettings { enabled: boolean; paused: boolean; maxItems: number; skipSensitive: boolean }
export const DEFAULT_CLIP_SETTINGS: ClipSettings = { enabled: false, paused: false, maxItems: 200, skipSensitive: true };
export interface ClipItem { id: string; text: string; category: string; is_pinned: boolean; created_at: string; last_used_at: string }
export type AddResult = 'added' | 'bumped' | 'disabled' | 'paused' | 'empty' | 'too-large' | 'sensitive';

const luhn = (digits: string): boolean => { let sum = 0; let alt = false; for (let i = digits.length - 1; i >= 0; i--) { let n = Number(digits[i]); if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; };
/** Best-effort detection of secrets. Heuristic: it reduces accidental capture, it is not a guarantee. */
export function looksSensitive(text: string): boolean {
  const t = text.trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) return true;
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(t)) return true;                 // JWT
  if (/\b(AKIA|ASIA)[0-9A-Z]{16}\b/.test(t) || /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(t) || /\bsk-[A-Za-z0-9_-]{20,}\b/.test(t) || /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/.test(t)) return true;
  if (/(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*\S{4,}/i.test(t)) return true;
  const cc = t.replace(/[\s-]/g, ''); if (/^\d{13,19}$/.test(cc) && luhn(cc)) return true;
  if (!/\s/.test(t) && t.length >= 24 && t.length <= 200 && /[a-z]/.test(t) && /[A-Z]/.test(t) && /\d/.test(t) && /^[A-Za-z0-9+/=_-]+$/.test(t)) return true; // long opaque token
  return false;
}
export function categorize(text: string): string {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return 'link'; if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email'; if (/^[+\d][\d\s().-]{6,}$/.test(t)) return 'number';
  if (/[{};]|=>|\bfunction\b|\bconst\b|<\/?\w+>/.test(t) && t.includes('\n')) return 'code'; return 'text';
}
async function sha256(s: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }

/** Stores a clipboard snapshot ONLY when the user has explicitly enabled the feature. Local-only; never synced. */
export async function addClip(ctx: Ctx, text: string, s: ClipSettings): Promise<AddResult> {
  if (!s.enabled) return 'disabled'; if (s.paused) return 'paused';
  if (!text.trim()) return 'empty'; if (text.length > 100_000) return 'too-large';
  if (s.skipSensitive && looksSensitive(text)) return 'sensitive';
  const hash = await sha256(text); const now = ctx.now();
  const hit = await ctx.db.all('SELECT id FROM clipboard_items WHERE content_hash=?', [hash]);
  if (hit.length) { await ctx.db.run('UPDATE clipboard_items SET last_used_at=? WHERE content_hash=?', [now, hash]); ctx.events.emit(); return 'bumped'; }
  await ctx.db.run('INSERT INTO clipboard_items (id,text,category,is_pinned,content_hash,created_at,last_used_at) VALUES (?,?,?,0,?,?,?)', [ctx.uuid(), text, categorize(text), hash, now, now]);
  await ctx.db.run('DELETE FROM clipboard_items WHERE is_pinned=0 AND id NOT IN (SELECT id FROM clipboard_items WHERE is_pinned=0 ORDER BY last_used_at DESC, rowid DESC LIMIT ?)', [Math.max(1, s.maxItems)]);
  ctx.events.emit(); return 'added';
}
const rows = (r: Record<string, unknown>[]): ClipItem[] => r.map((x) => ({ id: String(x['id']), text: String(x['text']), category: String(x['category'] ?? 'text'), is_pinned: Number(x['is_pinned']) === 1, created_at: String(x['created_at']), last_used_at: String(x['last_used_at'] ?? x['created_at']) }));
export async function listClips(ctx: Ctx, q: { search?: string; category?: string } = {}): Promise<ClipItem[]> {
  const w: string[] = []; const p: Param[] = [];
  if (q.search?.trim()) { w.push("text LIKE ? ESCAPE '\\'"); p.push(`%${q.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`); }
  if (q.category) { w.push('category=?'); p.push(q.category); }
  return rows(await ctx.db.all(`SELECT * FROM clipboard_items ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY is_pinned DESC, last_used_at DESC, rowid DESC LIMIT 500`, p));
}
export async function pinClip(ctx: Ctx, id: string, on: boolean): Promise<void> { await ctx.db.run('UPDATE clipboard_items SET is_pinned=? WHERE id=?', [on ? 1 : 0, id]); ctx.events.emit(); }
export async function deleteClip(ctx: Ctx, id: string): Promise<void> { await ctx.db.run('DELETE FROM clipboard_items WHERE id=?', [id]); ctx.events.emit(); }
export async function clearClips(ctx: Ctx, keepPinned = false): Promise<void> { await ctx.db.run(`DELETE FROM clipboard_items ${keepPinned ? 'WHERE is_pinned=0' : ''}`); ctx.events.emit(); }
export async function touchClip(ctx: Ctx, id: string): Promise<void> { await ctx.db.run('UPDATE clipboard_items SET last_used_at=? WHERE id=?', [ctx.now(), id]); ctx.events.emit(); }
export async function clipToNote(ctx: Ctx, wsId: string, id: string) { const c = (await ctx.db.all('SELECT text FROM clipboard_items WHERE id=?', [id]))[0]; if (!c) throw new Error('Clip not found'); const esc = String(c['text']).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return createNote(ctx, wsId, { html: esc.split('\n').map((l) => `<p>${l}</p>`).join('') }); }
export async function clipToTask(ctx: Ctx, wsId: string, id: string) { const c = (await ctx.db.all('SELECT text FROM clipboard_items WHERE id=?', [id]))[0]; if (!c) throw new Error('Clip not found'); const t = String(c['text']).trim(); const first = t.split('\n')[0]!.slice(0, 200); return createTask(ctx, wsId, { title: first, description: t.length > first.length ? t.slice(0, 5000) : null }); }
