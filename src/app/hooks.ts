import { useEffect, useState } from 'react';
import type { Ctx } from '../core/data/ctx.ts';

/** Re-runs an async query whenever local data changes (any write, sync pull) or deps change. */
export function useQuery<T>(ctx: Ctx, fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null } {
  const [st, setSt] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => ctx.events.subscribe(() => setTick((n) => n + 1)), [ctx]);
  useEffect(() => {
    let live = true;
    fn().then((data) => { if (live) setSt({ data, loading: false, error: null }); }, (e: unknown) => { if (live) setSt((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, tick, ...deps]);
  return st;
}
