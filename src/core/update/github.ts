import { compareSemver, parseSemver } from './policy.ts';

export interface ReleaseInfo { version: string; url: string; notes: string; prerelease: boolean; assets: { name: string; url: string }[] }
/** Picks the newest suitable release from the GitHub "list releases" JSON. Drafts are ignored; pre-releases only when asked. Never throws. */
export function pickLatestRelease(json: unknown, includePrerelease: boolean): ReleaseInfo | null {
  if (!Array.isArray(json)) return null; let best: ReleaseInfo | null = null;
  for (const r of json as Record<string, unknown>[]) {
    if (!r || r['draft'] === true || (r['prerelease'] === true && !includePrerelease) || typeof r['tag_name'] !== 'string') continue;
    const m = /^v?(\d+\.\d+\.\d+)/.exec(r['tag_name']); if (!m) continue;
    const url = typeof r['html_url'] === 'string' && r['html_url'].startsWith('https://github.com/') ? r['html_url'] : null; if (!url) continue;
    const assets = (Array.isArray(r['assets']) ? (r['assets'] as Record<string, unknown>[]) : []).flatMap((a) => typeof a['name'] === 'string' && typeof a['browser_download_url'] === 'string' && a['browser_download_url'].startsWith('https://github.com/') ? [{ name: a['name'], url: a['browser_download_url'] }] : []);
    const info: ReleaseInfo = { version: m[1]!, url, notes: typeof r['body'] === 'string' ? r['body'].slice(0, 2000) : '', prerelease: r['prerelease'] === true, assets };
    if (!best || compareSemver(info.version, best.version) > 0) best = info;
  }
  return best;
}
export function isNewer(installed: string, r: ReleaseInfo | null): boolean { try { parseSemver(installed); return !!r && compareSemver(r.version, installed) > 0; } catch { return false; } }
/** Which asset suits this OS (best effort from the user agent / platform string). */
export function assetForPlatform(assets: ReleaseInfo['assets'], platform: string): ReleaseInfo['assets'][number] | null {
  const p = platform.toLowerCase(); const find = (re: RegExp) => assets.find((a) => re.test(a.name)) ?? null;
  if (p.includes('win')) return find(/setup\.exe$/i) ?? find(/\.msi$/i);
  if (p.includes('mac')) return find(/\.dmg$/i);
  if (p.includes('android')) return find(/\.apk$/i);
  return find(/\.AppImage$/i) ?? find(/\.deb$/i);
}
