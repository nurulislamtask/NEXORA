import { useSyncExternalStore } from 'react';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyTheme } from '../core/theme/themes.ts';
import type { Locale } from '../core/i18n/index.ts';
import { DEFAULT_CLIP_SETTINGS, type ClipSettings } from '../core/data/clipboard.ts';

export interface Settings { themeId: string; followSystem: boolean; radius: number; locale: Locale; sidebarCollapsed: boolean; snoozeMinutes: number; clipboard: ClipSettings; recentSearches: string[] }
const KEY = 'nexora.settings.v1';
const DEFAULTS: Settings = { themeId: DEFAULT_THEME_ID, followSystem: true, radius: 10, locale: 'en', sidebarCollapsed: false, snoozeMinutes: 10, clipboard: DEFAULT_CLIP_SETTINGS, recentSearches: [] };

function load(): Settings {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>; return { ...DEFAULTS, ...raw, clipboard: { ...DEFAULT_CLIP_SETTINGS, ...(raw.clipboard ?? {}) }, radius: Math.min(20, Math.max(0, Number(raw.radius ?? DEFAULTS.radius))) }; } catch { return DEFAULTS; }
}
let state = load(); const subs = new Set<() => void>();
export const getSettings = (): Settings => state;
export function updateSettings(patch: Partial<Settings>): void {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ }
  applyCurrentTheme(); subs.forEach((f) => f());
}
export const useSettings = (): Settings => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getSettings, getSettings);

export function effectiveThemeId(s: Settings, prefersDark: boolean): string {
  if (!s.followSystem) return s.themeId;
  const cur = BUILT_IN_THEMES.find((t) => t.id === s.themeId);
  if (cur && cur.dark === prefersDark) return cur.id;           // keep the chosen theme if it already matches the system mode
  return prefersDark ? 'dark' : 'light';
}
export function applyCurrentTheme(): void {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const id = effectiveThemeId(state, dark); applyTheme(BUILT_IN_THEMES.find((t) => t.id === id) ?? BUILT_IN_THEMES[0]!, state.radius);
}
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const m = matchMedia('(prefers-color-scheme: dark)'); m.addEventListener('change', applyCurrentTheme); return () => m.removeEventListener('change', applyCurrentTheme);
}
