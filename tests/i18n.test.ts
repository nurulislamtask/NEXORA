import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { en } from '../src/core/i18n/en.ts';
import { bn } from '../src/core/i18n/bn.ts';
import { translate } from '../src/core/i18n/index.ts';

const files = (d: URL): URL[] => readdirSync(d).flatMap((n) => { const u = new URL(n + (statSync(new URL(n, d)).isDirectory() ? '/' : ''), d); return n.endsWith('.tsx') || n.endsWith('.ts') ? [u] : statSync(u).isDirectory() ? files(u) : []; });
const src = files(new URL('../src/app/', import.meta.url)).map((u) => readFileSync(u, 'utf8')).join('\n');
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

test('en and bn define identical keys, none empty, same placeholders', () => {
  assert.deepEqual(Object.keys(bn).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en) as (keyof typeof en)[]) { assert.ok(bn[k].trim() && en[k].trim(), k); assert.equal(ph(bn[k]), ph(en[k]), `placeholders ${k}`); }
});
test('every key used in the UI exists (static + dynamic families)', () => {
  const used = new Set([...src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.=-]+)'/g)].map((m) => m[1]!));
  const fam: Record<string, string[]> = { 'auth.': ['login', 'register', 'reset', 'loginSubmit', 'registerSubmit', 'resetSubmit'], 'nav.': ['home', 'my-day', 'tasks', 'notes', 'projects', 'calendar', 'pages', 'habits', 'clipboard', 'settings'], 'notes.view.': ['active', 'archived', 'trash'],
    'priority.': ['0', '1', '2', '3', '4'], 'repeat.': ['none', 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'], 'sort.': ['due', 'priority', 'created', 'manual'], 'sync.': ['idle', 'syncing', 'synced', 'offline', 'failed', 'local'],
    'view.': ['my-day', 'all', 'overdue', 'upcoming', 'important', 'completed', 'archived', 'trash'], 'home.': ['goodMorning', 'goodAfternoon', 'goodEvening'], 'projects.status.': ['active', 'on_hold', 'completed', 'archived'], 'calendar.kind.': ['event', 'task'], 'calendar.rule.': ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], 'theme.token.': ['background', 'sidebar', 'card', 'text', 'textMuted', 'border', 'primary', 'accent'], 'theme.err.': ['name', 'tokens', 'contrast'], 'theme.pair.': ['text/background', 'text/card', 'text/sidebar', 'muted text/background', 'primary/background', 'accent/background'], 'pages.block.': ['paragraph', 'heading', 'todo', 'bullet', 'quote', 'code', 'divider'], 'habits.freq.': ['daily', 'weekdays', 'weekends', 'custom'], 'clip.result.': ['added', 'bumped', 'disabled', 'paused', 'empty', 'too-large', 'sensitive'], 'clip.cat.': ['text', 'link', 'email', 'number', 'code'], 'palette.kind.': ['task', 'note', 'habit', 'tag', 'clip'], 'backup.err.': ['not-json', 'not-a-backup', 'unsupported-format', 'checksum-mismatch', 'file-too-large', 'bad-table', 'bad-row', 'bad-key', 'missing-workspace'] };
  for (const [p, xs] of Object.entries(fam)) for (const x of xs) used.add(p + x);
  for (const k of ['auth.invalidCredentials', 'auth.emailNotConfirmed', 'auth.userExists', 'auth.passwordWeak', 'auth.passwordShort', 'auth.passwordLong', 'auth.rateLimited', 'auth.network', 'auth.emailInvalid', 'auth.generic', 'profile.nameInvalid']) used.add(k);
  const missing = [...used].filter((k) => !(k in en)); assert.deepEqual(missing, []);
  assert.ok(used.size > 120);
  for (const m of src.matchAll(/t\(`([^`$]*)\$\{/g)) assert.ok(Object.keys(fam).some((p) => m[1]!.startsWith(p) || p.startsWith(m[1]!)), `undeclared dynamic key family ${m[1]}`);
});
test('translate: interpolation, locale switch, fallback', () => {
  assert.equal(translate('en', 'notes.words', { n: 3 }), '3 words'); assert.equal(translate('bn', 'notes.words', { n: 3 }), '3টি শব্দ');
  assert.equal(translate('bn', 'nav.tasks'), 'কাজ'); assert.equal(translate('bn', 'no.such.key'), 'no.such.key');
});
