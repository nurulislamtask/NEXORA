/** Tiny change-notification bus; UI hooks re-query when it fires. */
export class Emitter {
  version = 0;
  private listeners = new Set<() => void>();
  subscribe = (f: () => void): (() => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  emit(): void { this.version++; this.listeners.forEach((f) => f()); }
}
