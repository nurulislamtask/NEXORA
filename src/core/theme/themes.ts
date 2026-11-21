export interface ThemeTokens {
  readonly background: string; readonly sidebar: string; readonly card: string;
  readonly text: string; readonly textMuted: string; readonly border: string;
  readonly primary: string; readonly accent: string;
}
export interface Theme { readonly id: string; readonly name: string; readonly dark: boolean; readonly tokens: ThemeTokens }

const t = (id: string, name: string, dark: boolean, tokens: ThemeTokens): Theme => ({ id, name, dark, tokens });

export const BUILT_IN_THEMES: readonly Theme[] = [
  t('light', 'Light', false, { background: '#fafaf9', sidebar: '#f4f4f2', card: '#ffffff', text: '#1c1917', textMuted: '#57534e', border: '#e7e5e4', primary: '#4f46e5', accent: '#0369a1' }),
  t('dark', 'Dark', true, { background: '#151517', sidebar: '#1b1b1e', card: '#212125', text: '#f4f4f5', textMuted: '#a1a1aa', border: '#2e2e33', primary: '#818cf8', accent: '#38bdf8' }),
  t('midnight', 'Midnight', true, { background: '#0b1020', sidebar: '#0e1428', card: '#131a33', text: '#e6e9f5', textMuted: '#9aa4c7', border: '#222b4d', primary: '#7c9cff', accent: '#5eead4' }),
  t('ocean', 'Ocean', false, { background: '#f0f7fa', sidebar: '#e4f0f5', card: '#ffffff', text: '#0c2a36', textMuted: '#40616e', border: '#cfe3ea', primary: '#0e7490', accent: '#0369a1' }),
  t('forest', 'Forest', true, { background: '#121a15', sidebar: '#16201a', card: '#1b2820', text: '#e8f0ea', textMuted: '#9db3a4', border: '#27382d', primary: '#4ade80', accent: '#a3e635' }),
  t('lavender', 'Lavender', false, { background: '#f8f5ff', sidebar: '#f0ebfc', card: '#ffffff', text: '#27203d', textMuted: '#625a7d', border: '#e2d9f5', primary: '#7c3aed', accent: '#c026d3' }),
  t('rose', 'Rose', false, { background: '#fff7f8', sidebar: '#fdecef', card: '#ffffff', text: '#3a1520', textMuted: '#7a4553', border: '#f6d5dc', primary: '#be123c', accent: '#c2410c' }),
  t('sunset', 'Sunset', true, { background: '#1c1210', sidebar: '#241714', card: '#2c1c18', text: '#fbeee8', textMuted: '#c9a89c', border: '#41281f', primary: '#fb923c', accent: '#f472b6' }),
  t('nord', 'Nord', true, { background: '#2e3440', sidebar: '#292e39', card: '#3b4252', text: '#eceff4', textMuted: '#d8dee9', border: '#434c5e', primary: '#88c0d0', accent: '#a3be8c' }),
  t('dracula', 'Dracula', true, { background: '#282a36', sidebar: '#21222c', card: '#343746', text: '#f8f8f2', textMuted: '#bcc2e0', border: '#44475a', primary: '#bd93f9', accent: '#50fa7b' }),
  t('monokai', 'Monokai', true, { background: '#272822', sidebar: '#1f201b', card: '#33342d', text: '#f8f8f2', textMuted: '#c0c0b0', border: '#49483e', primary: '#a6e22e', accent: '#66d9ef' }),
  t('minimal-gray', 'Minimal Gray', false, { background: '#f5f5f5', sidebar: '#ececec', card: '#ffffff', text: '#212121', textMuted: '#595959', border: '#dcdcdc', primary: '#424242', accent: '#1d4ed8' }),
  t('warm-sand', 'Warm Sand', false, { background: '#faf5ec', sidebar: '#f3ebdb', card: '#fffdf8', text: '#3b2f1e', textMuted: '#6e5d44', border: '#e6d9bf', primary: '#a16207', accent: '#b45309' }),
  t('graphite', 'Graphite', true, { background: '#1a1b1e', sidebar: '#202125', card: '#27292e', text: '#ececee', textMuted: '#a3a6ad', border: '#34373d', primary: '#94a3b8', accent: '#60a5fa' }),
];

export const DEFAULT_THEME_ID = 'light';
const HEX = /^#[0-9a-f]{6}$/i;

export function isValidTokens(x: unknown): x is ThemeTokens {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return ['background', 'sidebar', 'card', 'text', 'textMuted', 'border', 'primary', 'accent'].every(
    (k) => typeof o[k] === 'string' && HEX.test(o[k] as string));
}

/** WCAG relative luminance / contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (h: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Pure: token map -> CSS custom properties. Applying is a one-liner on documentElement. */
export function toCssVars(theme: Theme, radiusPx = 10): Record<string, string> {
  const v: Record<string, string> = { '--radius': `${radiusPx}px`, 'color-scheme': theme.dark ? 'dark' : 'light' };
  for (const [k, val] of Object.entries(theme.tokens)) v[`--nx-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = val;
  return v;
}

export function applyTheme(theme: Theme, radiusPx?: number, root: HTMLElement = document.documentElement): void {
  for (const [k, val] of Object.entries(toCssVars(theme, radiusPx))) root.style.setProperty(k, val);
  root.dataset['theme'] = theme.id;
}
