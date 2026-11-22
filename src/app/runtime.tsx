import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { makeCtx, type Ctx } from '../core/data/ctx.ts';
import { openTauriDb } from '../core/db/tauriDb.ts';
import { EncryptedStorage } from '../core/auth/secureStorage.ts';
import { tauriKeyStore } from '../core/auth/tauriKeyStore.ts';
import { AuthService, type AuthClient, type AuthUser } from '../core/auth/authService.ts';
import { bindLocalUser, boundUser, wipeLocalData, type BindResult } from '../core/auth/userBinding.ts';
import { ensureDefaultWorkspace } from '../core/data/workspace.ts';
import { SyncController } from '../core/sync/controller.ts';
import { pendingCount, syncOnce } from '../core/sync/engine.ts';
import { SupabaseRemote, type SbClient } from '../core/sync/supabaseRemote.ts';
import { CLOUD_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from './env.ts';
import { useT } from './i18n.tsx';

export interface Runtime { ctx: Ctx; workspaceId: string; user: { id: string; email: string | null; name: string } | null; offlineSession: boolean; auth: AuthService | null; sync: SyncController | null; signOut(wipe: boolean): Promise<void> }
export const RT = createContext<Runtime | null>(null);
export const useRuntime = (): Runtime => { const r = useContext(RT); if (!r) throw new Error('Runtime not ready'); return r; };

type Phase = { k: 'booting' } | { k: 'error'; msg: string } | { k: 'login' } | { k: 'blocked'; uid: string } | { k: 'ready'; rt: Runtime };
interface Boot { ctx: Ctx; auth: AuthService | null; client: ReturnType<typeof createClient> | null }
export const AuthGate = createContext<{ auth: AuthService; onSignedIn(u: AuthUser): void } | null>(null);
export const useAuthGate = (): { auth: AuthService; onSignedIn(u: AuthUser): void } => { const g = useContext(AuthGate); if (!g) throw new Error('No auth gate'); return g; };

export function RuntimeProvider({ children, login }: { children: ReactNode; login: ReactNode }) {
  const t = useT(); const [phase, setPhase] = useState<Phase>({ k: 'booting' }); const boot = useRef<Boot | null>(null); const ctl = useRef<SyncController | null>(null);

  const enter = useCallback(async (user: AuthUser | null, offline: boolean, uidFallback?: string) => {
    const b = boot.current!; const uid = user?.id ?? uidFallback ?? 'local-only';
    const res: BindResult = await bindLocalUser(b.ctx, uid);
    if (res === 'blocked-unsynced') { setPhase({ k: 'blocked', uid }); return; }
    const workspaceId = await ensureDefaultWorkspace(b.ctx, uid);
    let sync: SyncController | null = null;
    if (b.client && b.auth && !offline && user) {
      const remote = new SupabaseRemote(b.client as unknown as SbClient, uid);
      sync = new SyncController({ run: () => syncOnce(b.ctx, remote), isOnline: () => navigator.onLine, setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (h) => clearTimeout(h as number) });
      ctl.current = sync;
    }
    const rt: Runtime = { ctx: b.ctx, workspaceId, auth: b.auth, sync, offlineSession: offline,
      user: user ? { id: user.id, email: user.email ?? null, name: String(user.user_metadata?.['name'] ?? user.email ?? '') } : null,
      async signOut(wipe) { sync && ctl.current === sync && (ctl.current = null); await b.auth?.signOut(); if (wipe) await wipeLocalData(b.ctx); setPhase({ k: 'login' }); } };
    setPhase({ k: 'ready', rt }); void sync?.sync();
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const ctx = makeCtx(await openTauriDb());
        if (!CLOUD_CONFIGURED) { boot.current = { ctx, auth: null, client: null }; await enter(null, true, 'local-only'); return; }
        const storage = new EncryptedStorage(tauriKeyStore, localStorage);
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
        const auth = new AuthService(client as unknown as AuthClient); boot.current = { ctx, auth, client };
        const r = await auth.restore(await boundUser(ctx)); if (dead) return;
        if (r.kind === 'online') await enter(r.user, false); else if (r.kind === 'offline') await enter(null, true, r.userId); else setPhase({ k: 'login' });
      } catch (e) { if (!dead) setPhase({ k: 'error', msg: e instanceof Error ? e.message : String(e) }); }
    })();
    return () => { dead = true; };
  }, [enter]);

  // sync triggers: connectivity changes, periodic, and debounced after local writes
  useEffect(() => {
    if (phase.k !== 'ready' || !phase.rt.sync) return;
    const s = phase.rt.sync; const on = () => s.onOnline(); const off = () => s.onOffline();
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const iv = setInterval(() => { void s.sync(); }, 60_000); let deb: ReturnType<typeof setTimeout> | null = null;
    const un = phase.rt.ctx.events.subscribe(() => { if (deb) clearTimeout(deb); deb = setTimeout(() => { void s.sync(); }, 3000); });
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv); if (deb) clearTimeout(deb); un(); };
  }, [phase]);

  if (phase.k === 'booting') return <div className="center" role="status">{t('common.loading')}</div>;
  if (phase.k === 'error') return <div className="center"><div className="card" role="alert"><h2>{t('boot.failed')}</h2><p>{phase.msg}</p></div></div>;
  if (phase.k === 'blocked') return (
    <div className="center"><div className="card stack" role="alertdialog"><h2>{t('boot.otherAccount')}</h2><p>{t('boot.otherAccountBody')}</p>
      <button className="btn" onClick={() => { void boot.current!.auth?.signOut(); setPhase({ k: 'login' }); }}>{t('boot.back')}</button>
      <button className="btn danger" onClick={() => { void (async () => { await wipeLocalData(boot.current!.ctx); await enter({ id: phase.uid }, false); })(); }}>{t('boot.discard')}</button></div></div>);
  if (phase.k === 'login') return <AuthGate.Provider value={{ auth: boot.current!.auth!, onSignedIn: (u) => { void enter(u, false); } }}>{login}</AuthGate.Provider>;
  return <RT.Provider value={phase.rt}>{children}</RT.Provider>;
}

export function useSyncStatus(): { status: string; lastError: string | null; pending: number; lastSyncAt: string | null; conflicts: number } {
  const { sync, ctx } = useRuntime(); const [extra, setExtra] = useState({ pending: 0, lastSyncAt: null as string | null });
  const getSnap = () => `${sync?.status ?? 'local'}|${sync?.lastError ?? ''}|${sync?.lastReport?.conflicts ?? 0}`;
  const snap = useSyncExternalStore(sync ? sync.subscribe : () => () => {}, getSnap, getSnap);
  useEffect(() => { void (async () => { setExtra({ pending: await pendingCount(ctx), lastSyncAt: (await ctx.db.all<{ value: string }>("SELECT value FROM sync_state WHERE key='last_sync_at'"))[0]?.value ?? null }); })(); }, [ctx, snap]);
  const [status, err, conflicts] = snap.split('|'); return { status: status!, lastError: err || null, conflicts: Number(conflicts), ...extra };
}
