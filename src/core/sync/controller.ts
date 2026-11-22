import type { SyncReport } from './types.ts';
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'failed';

/** Exponential backoff with cap: 2s, 4s, 8s ... 5min. */
export const backoffMs = (attempts: number): number => Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, attempts - 1));

export interface ControllerDeps { run(): Promise<SyncReport>; isOnline(): boolean; setTimer(f: () => void, ms: number): unknown; clearTimer(h: unknown): void }
/** Single-flight sync scheduler: triggers coalesce, failures back off, going offline pauses, coming online resumes. */
export class SyncController {
  status: SyncStatus = 'idle'; lastError: string | null = null; attempts = 0; lastReport: SyncReport | null = null;
  private running = false; private again = false; private timer: unknown = null; private listeners = new Set<() => void>();
  private deps: ControllerDeps;
  constructor(deps: ControllerDeps) { this.deps = deps; }
  subscribe = (f: () => void): (() => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  private set(s: SyncStatus): void { this.status = s; this.listeners.forEach((f) => f()); }
  async sync(): Promise<void> {
    if (this.running) { this.again = true; return; }
    if (!this.deps.isOnline()) { this.set('offline'); return; }
    this.running = true; this.set('syncing');
    try {
      const rep = await this.deps.run(); this.lastReport = rep;
      if (rep.error) { this.attempts++; this.lastError = rep.error; this.set('failed'); this.schedule(backoffMs(this.attempts)); }
      else { this.attempts = 0; this.lastError = null; this.set('synced'); }
    } catch (e) { this.attempts++; this.lastError = e instanceof Error ? e.message : String(e); this.set('failed'); this.schedule(backoffMs(this.attempts)); }
    finally { this.running = false; }
    if (this.again) { this.again = false; await this.sync(); }
  }
  private schedule(ms: number): void { if (this.timer !== null) this.deps.clearTimer(this.timer); this.timer = this.deps.setTimer(() => { this.timer = null; void this.sync(); }, ms); }
  onOnline(): void { this.attempts = 0; void this.sync(); }
  onOffline(): void { this.set('offline'); }
}
