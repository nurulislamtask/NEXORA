import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './helpers/nodeDb.ts';
import { MemoryRemote } from './helpers/memoryRemote.ts';
import { makeCtx, type Ctx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { bulkApply, createTask, getTask, reorderTask, listTasks } from '../src/core/data/tasks.ts';
import { addBlock, createPage, deleteBlock, deletePage, listBlocks, moveBlock, movePage, pageTree, renamePage, updateBlock } from '../src/core/data/pages.ts';
import { BUILT_IN_THEMES, makeCustomTheme, parseCustomThemes, themeIssues } from '../src/core/theme/themes.ts';
import { assetForPlatform, isNewer, pickLatestRelease } from '../src/core/update/github.ts';
import { syncOnce } from '../src/core/sync/engine.ts';

async function dev(): Promise<{ ctx: Ctx; ws: string }> { const ctx = makeCtx(openTestDb()); return { ctx, ws: await ensureDefaultWorkspace(ctx, 'u1') }; }
const Q = { view: 'all', sort: 'manual', nowIso: '2026-06-15T00:00:00.000Z', today: '2026-06-15', dayStartIso: '2026-06-15T00:00:00.000Z', dayEndIso: '2026-06-16T00:00:00.000Z' } as const;

test('pages: tree, nesting, cycle refusal, subtree delete, blocks order + sanitising', async () => {
  const { ctx, ws } = await dev(); const a = await createPage(ctx, ws, 'A'); const b = await createPage(ctx, ws, 'B', a.id); const c = await createPage(ctx, ws, 'C', b.id); const z = await createPage(ctx, ws, 'Z');
  let tree = await pageTree(ctx); assert.deepEqual(tree.map((n) => n.title), ['A', 'Z']); assert.equal(tree[0]!.children[0]!.children[0]!.depth, 2);
  await assert.rejects(movePage(ctx, a.id, c.id), /itself or its sub-pages/); await assert.rejects(movePage(ctx, a.id, a.id));
  await movePage(ctx, c.id, z.id); tree = await pageTree(ctx); assert.equal(tree[1]!.children[0]!.title, 'C'); await renamePage(ctx, c.id, 'C2', '📄');
  let deep = z.id; for (let i = 0; i < 7; i++) deep = (await createPage(ctx, ws, 'd' + i, deep)).id; await assert.rejects(createPage(ctx, ws, 'too deep', deep), /too deeply/);
  const b1 = await addBlock(ctx, a.id, 'paragraph', '<p>one</p><script>x()</script>'); const b2 = await addBlock(ctx, a.id, 'todo', 'two'); const b3 = await addBlock(ctx, a.id, 'paragraph', 'three', b1.id);
  assert.ok(!(await listBlocks(ctx, a.id))[0]!.text.includes('script')); assert.deepEqual((await listBlocks(ctx, a.id)).map((x) => x.text), ['<p>one</p>', 'three', 'two']);
  await moveBlock(ctx, b2.id, 0); assert.equal((await listBlocks(ctx, a.id))[0]!.id, b2.id); await updateBlock(ctx, b2.id, { checked: true }); assert.equal((await listBlocks(ctx, a.id))[0]!.checked, true);
  await deleteBlock(ctx, b3.id); assert.equal((await listBlocks(ctx, a.id)).length, 2); await assert.rejects(addBlock(ctx, a.id, 'nope' as never));
  await deletePage(ctx, a.id); assert.deepEqual((await pageTree(ctx)).map((n) => n.title), ['Z']); assert.equal((await listBlocks(ctx, a.id)).length, 0);
});
test('pages sync to a second device', async () => {
  const remote = new MemoryRemote(); const a = await dev(); const p = await createPage(a.ctx, a.ws, 'Shared'); await addBlock(a.ctx, p.id, 'heading', 'Hi'); await syncOnce(a.ctx, remote);
  const b = makeCtx(openTestDb()); await ensureDefaultWorkspace(b, 'u1'); await syncOnce(b, remote);
  assert.equal((await pageTree(b))[0]?.title, 'Shared'); assert.equal((await listBlocks(b, p.id))[0]?.text, 'Hi');
});
test('tasks: manual reorder and bulk actions', async () => {
  const { ctx, ws } = await dev(); const t = []; for (const n of ['a', 'b', 'c', 'd']) t.push(await createTask(ctx, ws, { title: n }));
  const order = async () => (await listTasks(ctx, Q)).map((x) => x.title);
  const start = await order(); assert.equal(start.length, 4);
  const ids = (await listTasks(ctx, Q)).map((x) => x.id); const last = ids[3]!; await reorderTask(ctx, ids, last, 0); assert.equal((await listTasks(ctx, Q))[0]!.id, last);
  const ids2 = (await listTasks(ctx, Q)).map((x) => x.id); await reorderTask(ctx, ids2, ids2[0]!, 2); assert.equal((await listTasks(ctx, Q))[2]!.id, ids2[0]);
  const r = await bulkApply(ctx, [t[0]!.id, t[1]!.id, 'missing', t[0]!.id], { kind: 'priority', value: 3 }); assert.equal(r.ok, 2); assert.equal(r.failed.length, 1); assert.equal((await getTask(ctx, t[0]!.id))!.priority, 3);
  assert.equal((await bulkApply(ctx, [t[0]!.id, t[2]!.id], { kind: 'complete', done: true })).ok, 2); assert.equal((await listTasks(ctx, Q)).length, 2);
  assert.equal((await bulkApply(ctx, [t[3]!.id], { kind: 'delete' })).ok, 1); assert.equal((await listTasks(ctx, Q)).length, 1);
});
test('custom themes: contrast enforced, bad stored data dropped', () => {
  const base = BUILT_IN_THEMES[0]!.tokens; assert.deepEqual(themeIssues(base), []);
  const ok = makeCustomTheme('mine', ' Mine ', { ...base, primary: '#1d4ed8' }); assert.ok(ok.ok && ok.theme.id === 'custom-mine' && ok.theme.name === 'Mine' && !ok.theme.dark);
  const bad = makeCustomTheme('x', 'x', { ...base, text: '#eeeeee' }); assert.ok(!bad.ok && bad.error === 'contrast' && bad.issues!.length > 0);
  assert.deepEqual(makeCustomTheme('x', '', base), { ok: false, error: 'name' }); assert.equal((makeCustomTheme('x', 'n', { ...base, primary: 'red' }) as { error: string }).error, 'tokens');
  const dark = makeCustomTheme('d', 'D', BUILT_IN_THEMES[1]!.tokens); assert.ok(dark.ok && dark.theme.dark);
  assert.equal(parseCustomThemes([{ id: 'custom-a', name: 'A', tokens: base }, { id: '../evil', name: 'E', tokens: base }, { id: 'custom-b', name: 'B', tokens: { ...base, text: '#fafafa' } }, 5, null]).length, 1); assert.deepEqual(parseCustomThemes('x'), []);
});
test('update check: release picking, versions, platform assets, hostile input', () => {
  const rel = (tag: string, o: object = {}) => ({ tag_name: tag, html_url: `https://github.com/o/r/releases/tag/${tag}`, prerelease: false, draft: false, body: 'n', assets: [{ name: 'NEXORA_1_x64-setup.exe', browser_download_url: 'https://github.com/o/r/a.exe' }, { name: 'x.AppImage', browser_download_url: 'https://github.com/o/r/b' }, { name: 'e.dmg', browser_download_url: 'https://evil.example/e.dmg' }], ...o });
  const j = [rel('v0.2.0', { prerelease: true }), rel('v0.1.5'), rel('v0.1.9', { draft: true }), rel('nightly')];
  assert.equal(pickLatestRelease(j, false)?.version, '0.1.5'); assert.equal(pickLatestRelease(j, true)?.version, '0.2.0'); assert.equal(pickLatestRelease('x', true), null); assert.equal(pickLatestRelease([{ tag_name: 'v1.0.0', html_url: 'http://evil' }], true), null);
  const r = pickLatestRelease(j, true)!; assert.equal(r.assets.length, 2, 'non-github asset urls dropped'); assert.equal(isNewer('0.1.0', r), true); assert.equal(isNewer('0.2.0', r), false); assert.equal(isNewer('bogus', r), false);
  assert.match(assetForPlatform(r.assets, 'Win32')!.name, /setup\.exe/); assert.match(assetForPlatform(r.assets, 'Linux x86_64')!.name, /AppImage/); assert.equal(assetForPlatform(r.assets, 'MacIntel'), null);
});
