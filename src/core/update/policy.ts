/** Update policy. Signature verification and install are done by the Tauri updater plugin, never here. */
export type UpdateState = 'up-to-date' | 'optional' | 'mandatory';
export interface UpdatePolicy { latest: string; minimumSupported: string; notes: string; reason?: string }

export function parseSemver(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  if (!m) throw new Error(`Invalid semantic version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const [x, y] = [parseSemver(a), parseSemver(b)];
  for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
  return 0;
}
/** Mandatory only when installed < minimumSupported; a newer release alone is optional. Never auto-installs. */
export function evaluateUpdate(installed: string, p: UpdatePolicy): UpdateState {
  if (compareSemver(installed, p.minimumSupported) < 0) return 'mandatory';
  return compareSemver(installed, p.latest) < 0 ? 'optional' : 'up-to-date';
}
