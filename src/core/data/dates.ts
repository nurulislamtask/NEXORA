const p2 = (n: number): string => String(n).padStart(2, '0');
export const localDate = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** Local-day boundaries as UTC ISO strings, plus the local calendar date (never derived from UTC). */
export function dayBounds(now: Date): { nowIso: string; today: string; dayStartIso: string; dayEndIso: string } {
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { nowIso: now.toISOString(), today: localDate(now), dayStartIso: s.toISOString(), dayEndIso: e.toISOString() };
}
/** ISO -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null): string { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${localDate(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export function fromLocalInput(v: string): string | null { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
export type Greeting = 'home.goodMorning' | 'home.goodAfternoon' | 'home.goodEvening';
export const greetingKey = (hour: number): Greeting => (hour < 12 ? 'home.goodMorning' : hour < 18 ? 'home.goodAfternoon' : 'home.goodEvening');
