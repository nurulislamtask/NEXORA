import { en } from './en.ts';
import { bn } from './bn.ts';
export type Locale = 'en' | 'bn';
export type Key = keyof typeof en;
export const LOCALES: { id: Locale; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'bn', label: 'বাংলা' }];
export const dictionaries: Record<Locale, Record<string, string>> = { en, bn };
/** Falls back to English, then to the key itself. `{name}` placeholders are interpolated. */
export function translate(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const s = dictionaries[locale][key] ?? en[key as Key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
