/** Minimal RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY; INTERVAL; BYDAY (weekly); BYMONTHDAY (monthly); UNTIL.
 *  Uses LOCAL calendar arithmetic so wall-clock time is preserved across DST. */
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export interface Rule { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number; byDay: number[]; byMonthDay: number | null; until: Date | null }

export function parseRule(rule: string): Rule {
  const kv = new Map(rule.split(';').map((p) => p.split('=') as [string, string]));
  const freq = kv.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') throw new Error(`Unsupported recurrence: ${rule}`);
  const interval = Number(kv.get('INTERVAL') ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) throw new Error('Invalid INTERVAL');
  const byDay = (kv.get('BYDAY') ?? '').split(',').filter(Boolean).map((d) => { const i = DAYS.indexOf(d); if (i < 0) throw new Error(`Invalid BYDAY ${d}`); return i; });
  const bmd = kv.get('BYMONTHDAY'); const byMonthDay = bmd ? Number(bmd) : null;
  if (byMonthDay !== null && !(byMonthDay >= 1 && byMonthDay <= 31)) throw new Error('Invalid BYMONTHDAY');
  const u = kv.get('UNTIL');
  return { freq, interval, byDay, byMonthDay, until: u ? new Date(u) : null };
}

function addMonths(d: Date, n: number, day: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last)); return r;
}

/** Next occurrence strictly after `from`, or null when UNTIL is passed. */
export function nextOccurrence(ruleStr: string, from: Date): Date | null {
  const r = parseRule(ruleStr); let n: Date;
  if (r.freq === 'DAILY') { n = new Date(from); n.setDate(n.getDate() + r.interval); }
  else if (r.freq === 'WEEKLY') {
    n = new Date(from);
    if (r.byDay.length === 0) n.setDate(n.getDate() + 7 * r.interval);
    else {
      const days = [...r.byDay].sort((a, b) => a - b); const cur = n.getDay();
      const later = days.find((d) => d > cur);
      if (later !== undefined) n.setDate(n.getDate() + (later - cur));
      else n.setDate(n.getDate() + 7 * r.interval - cur + days[0]!);
    }
  } else if (r.freq === 'MONTHLY') n = addMonths(from, r.interval, r.byMonthDay ?? from.getDate());
  else n = addMonths(from, 12 * r.interval, from.getDate());
  return r.until && n > r.until ? null : n;
}
