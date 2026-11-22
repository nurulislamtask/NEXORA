import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedStorage, type KV, type KeyStore } from '../src/core/auth/secureStorage.ts';
import { AuthFailure, AuthService, mapAuthError, type AuthClient, type AuthApiError } from '../src/core/auth/authService.ts';
import { validateEmail, validatePassword } from '../src/core/auth/validators.ts';
import { bindLocalUser, wipeLocalData } from '../src/core/auth/userBinding.ts';
import { openTestDb } from './helpers/nodeDb.ts';
import { makeCtx } from '../src/core/data/ctx.ts';
import { ensureDefaultWorkspace } from '../src/core/data/workspace.ts';
import { createNote } from '../src/core/data/notes.ts';
import { createTask } from '../src/core/data/tasks.ts';
import { syncOnce } from '../src/core/sync/engine.ts';
import { MemoryRemote } from './helpers/memoryRemote.ts';
import { exportAllJson } from '../src/core/data/export.ts';

const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const keyStore = (): KeyStore & { v: string | null } => ({ v: null, async get() { return this.v; }, async set(x) { this.v = x; } });

test('EncryptedStorage: round trip; ciphertext only; tamper/wrong-key/plaintext rejected; name-bound', async () => {
  const kv = mem(); const ks = keyStore(); const s = new EncryptedStorage(ks, kv);
  const secret = JSON.stringify({ access_token: 'AAA.BBB.CCC', refresh_token: 'r-123' });
  await s.setItem('sb-session', secret);
  assert.equal(await s.getItem('sb-session'), secret);
  assert.ok(!kv.m.get('sb-session')!.includes('AAA') && !kv.m.get('sb-session')!.includes('refresh'), 'no plaintext at rest');
  assert.ok(ks.v && ks.v.length >= 43, '256-bit key generated');
  assert.equal(await new EncryptedStorage(ks, kv).getItem('sb-session'), secret, 'new instance reuses stored key');
  const ct = kv.m.get('sb-session')!; kv.m.set('sb-session', ct.slice(0, -4) + 'AAAA'); assert.equal(await s.getItem('sb-session'), null, 'tampered');
  kv.m.set('sb-session', ct); kv.m.set('other', ct); assert.equal(await s.getItem('other'), null, 'ciphertext moved to another name fails');
  assert.equal(await new EncryptedStorage(keyStore(), kv).getItem('sb-session'), null, 'wrong key');
  kv.m.set('legacy', 'plain'); assert.equal(await s.getItem('legacy'), null);
  await s.removeItem('sb-session'); assert.equal(await s.getItem('sb-session'), null);
});
test('validators', () => {
  assert.ok(validateEmail('a@b.co')); assert.ok(!validateEmail('a@b')); assert.ok(!validateEmail('a b@c.com'));
  assert.equal(validatePassword('short1'), 'auth.passwordShort'); assert.equal(validatePassword('allletters'), 'auth.passwordWeak');
  assert.equal(validatePassword('12345678'), 'auth.passwordWeak'); assert.equal(validatePassword('goodpass1'), null); assert.equal(validatePassword('পাসওয়ার্ড১২৩'), null);
});
test('error mapping', () => {
  const m = (message: string, o: Partial<AuthApiError> = {}) => mapAuthError({ message, ...o });
  assert.equal(m('Invalid login credentials'), 'auth.invalidCredentials'); assert.equal(m('x', { code: 'email_not_confirmed' }), 'auth.emailNotConfirmed');
  assert.equal(m('User already registered'), 'auth.userExists'); assert.equal(m('Failed to fetch'), 'auth.network'); assert.equal(m('slow', { status: 429 }), 'auth.rateLimited'); assert.equal(m('???'), 'auth.generic');
});
function fakeClient(o: { session?: boolean; getSessionError?: AuthApiError; signInError?: AuthApiError } = {}) {
  const calls: string[] = [];
  const c: AuthClient = { auth: {
    signUp: async (a) => { calls.push('signUp:' + a.email); return { data: { user: { id: 'u' }, session: o.session ? { user: { id: 'u' } } : null }, error: null }; },
    signInWithPassword: async (a) => { calls.push('signIn'); return o.signInError ? { data: { user: null, session: null }, error: o.signInError } : { data: { user: { id: 'u1', email: a.email }, session: { user: { id: 'u1' } } }, error: null }; },
    signOut: async () => { calls.push('signOut'); return { error: null }; },
    resetPasswordForEmail: async (e, opt) => { calls.push('reset:' + e + ':' + (opt?.redirectTo ?? '')); return { data: {}, error: null }; },
    getSession: async () => (o.getSessionError ? { data: { session: null }, error: o.getSessionError } : { data: { session: { user: { id: 'u1' } } }, error: null }),
    updateUser: async () => ({ data: { user: { id: 'u1' } }, error: null }), resend: async () => ({ data: {}, error: null }) },
    rpc: async (fn) => { calls.push('rpc:' + fn); return { error: null }; },
    from: (t) => ({ update: () => ({ eq: async () => { calls.push('update:' + t); return { error: null }; } }) }) };
  return { c, calls };
}
test('AuthService flows + input validation before network', async () => {
  const { c, calls } = fakeClient(); const s = new AuthService(c, 'nexora://auth');
  assert.equal(await s.signUp('a@b.co', 'goodpass1', ' Ann '), 'confirm-email');
  await assert.rejects(s.signUp('bad', 'goodpass1', 'x'), (e: AuthFailure) => e.key === 'auth.emailInvalid');
  await assert.rejects(s.signUp('a@b.co', 'short', 'x'), (e: AuthFailure) => e.key === 'auth.passwordShort');
  assert.ok(!calls.includes('signUp:bad'));
  assert.equal((await s.signIn('a@b.co', 'pw')).id, 'u1');
  await s.requestPasswordReset('a@b.co'); assert.ok(calls.includes('reset:a@b.co:nexora://auth'));
  await s.updateDisplayName('u1', 'Ann'); assert.ok(calls.includes('update:profiles'));
  await assert.rejects(s.updateDisplayName('u1', '  '), (e: AuthFailure) => e.key === 'profile.nameInvalid');
  await s.deleteAccount(); assert.ok(calls.includes('rpc:delete_my_account'));
  await assert.rejects(new AuthService(fakeClient({ signInError: { message: 'Invalid login credentials' } }).c).signIn('a@b.co', 'x'), (e: AuthFailure) => e.key === 'auth.invalidCredentials');
});
test('session restore: online / offline-with-bound-user / none', async () => {
  assert.deepEqual(await new AuthService(fakeClient().c).restore(null), { kind: 'online', user: { id: 'u1' } });
  const net = fakeClient({ getSessionError: { message: 'Failed to fetch' } }).c;
  assert.deepEqual(await new AuthService(net).restore('u1'), { kind: 'offline', userId: 'u1' });
  assert.deepEqual(await new AuthService(net).restore(null), { kind: 'none' });
  assert.deepEqual(await new AuthService(fakeClient({ getSessionError: { message: 'JWT expired', status: 401 } }).c).restore('u1'), { kind: 'none' });
});
test('user binding: same user ok; switching user is blocked while unsynced, wipes when clean', async () => {
  const ctx = makeCtx(openTestDb()); const remote = new MemoryRemote();
  assert.equal(await bindLocalUser(ctx, 'u1'), 'bound'); assert.equal(await bindLocalUser(ctx, 'u1'), 'same');
  const ws = await ensureDefaultWorkspace(ctx, 'u1'); await createTask(ctx, ws, { title: 'mine' }); await createNote(ctx, ws, { title: 'n' });
  assert.equal(await bindLocalUser(ctx, 'u2'), 'blocked-unsynced');
  assert.equal(Number((await ctx.db.all('SELECT COUNT(*) n FROM tasks'))[0]!['n']), 1, 'nothing deleted when blocked');
  await syncOnce(ctx, remote);
  assert.equal(await bindLocalUser(ctx, 'u2'), 'wiped');
  assert.equal(Number((await ctx.db.all('SELECT COUNT(*) n FROM tasks'))[0]!['n']), 0); assert.equal(Number((await ctx.db.all('SELECT COUNT(*) n FROM search_idx'))[0]!['n']), 0);
  await wipeLocalData(ctx);
});
test('JSON export contains all user data', async () => {
  const ctx = makeCtx(openTestDb()); const ws = await ensureDefaultWorkspace(ctx, 'u1'); await createTask(ctx, ws, { title: 'বাংলা টাস্ক', labels: ['l'] });
  const j = JSON.parse(await exportAllJson(ctx)); assert.equal(j.tasks[0].title, 'বাংলা টাস্ক'); assert.equal(j.tags[0].name, 'l'); assert.equal(j.task_tags.length, 1); assert.ok(!('clipboard_items' in j));
});
