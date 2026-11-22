import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
const NODE_PATHS = ['/opt/npm-tools/node_modules'];
let pages: Record<string, (l: 'en' | 'bn') => string>;
const stub = fileURLToPath(new URL('./helpers/stubs/tauri.ts', import.meta.url));

before(async () => {
  const esbuild = (() => { try { return req('esbuild'); } catch { return createRequire('/opt/npm-tools/')('esbuild'); } })();
  const out = await esbuild.build({ entryPoints: [fileURLToPath(new URL('./helpers/smokeEntry.tsx', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', nodePaths: NODE_PATHS,
    loader: { '.css': 'empty' }, define: { 'import.meta.url': JSON.stringify(pathToFileURL(fileURLToPath(new URL('./helpers/nodeDb.ts', import.meta.url))).href), 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    alias: { '@tauri-apps/plugin-sql': stub, '@tauri-apps/api/core': stub, '@supabase/supabase-js': stub, '@tauri-apps/api/window': stub, '@tauri-apps/api/event': stub }, external: ['node:*'] });
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, req);
  pages = mod.exports['pages'] as typeof pages;
});

test('every page server-renders in English and Bangla without throwing', () => {
  for (const name of ['settings', 'tasks', 'notes', 'dashboard', 'editor', 'auth', 'app', 'habits', 'clipboard']) for (const l of ['en', 'bn'] as const) assert.ok(pages[name]!(l).length > 50, `${name}/${l}`);
});
test('settings: all 14 themes offered, language switch reflected', () => {
  const en = pages['settings']!('en'); assert.equal((en.match(/role="radio"/g) ?? []).length, 14); assert.ok(en.includes('Appearance') && en.includes('Local only') === false);
  const bn = pages['settings']!('bn'); assert.ok(bn.includes('চেহারা') && bn.includes('ভাষা'));
});
test('auth page: fields, labels, Bangla', () => {
  const en = pages['auth']!('en'); assert.ok(/type="email"/.test(en) && /type="password"/.test(en) && en.includes('Sign in') && en.includes('Forgot password?'));
  assert.ok(pages['auth']!('bn').includes('পাসওয়ার্ড ভুলে গেছেন?'));
});
test('editor toolbar exposes 14 labelled controls', () => { const h = pages['editor']!('en'); assert.equal((h.match(/class="tb"/g) ?? []).length, 14); assert.ok(h.includes('aria-label="Bold"') && h.includes('role="textbox"')); });
test('tasks/notes/dashboard render accessible chrome (tabs, search, headings)', () => {
  const t = pages['tasks']!('en'); assert.equal((t.match(/role="tab"/g) ?? []).length, 8); assert.ok(t.includes('aria-label="Search"'));
  assert.ok(pages['notes']!('bn').includes('নতুন নোট')); assert.ok(pages['dashboard']!('en').includes('Ann'));
});
test('app boots to a loading state first', () => assert.ok(pages['app']!('en').includes('Loading')));
test('new pages: clipboard shows privacy disclosure + opt-in, habits form, settings backup controls', () => {
  const c = pages['clipboard']!('en'); assert.ok(c.includes('OFF until you turn it on') && /type="checkbox"/.test(c) && !c.includes('Capture clipboard now'), 'capture controls hidden until enabled');
  assert.ok(pages['clipboard']!('bn').includes('ক্লিপবোর্ড')); const h = pages['habits']!('en'); assert.ok(h.includes('New habit') && h.includes('Every day'));
  const s = pages['settings']!('en'); assert.ok(s.includes('Create backup file') && s.includes('Restore from file') && s.includes('Snooze duration'));
});
