import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translate, type Key } from '../core/i18n/index.ts';
import { useSettings } from './store.ts';

type T = (key: Key | (string & {}), vars?: Record<string, string | number>) => string;
const Ctx = createContext<T>((k) => String(k));
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = useSettings();
  const t = useMemo<T>(() => (k, v) => translate(locale, k, v), [locale]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}
export const useT = (): T => useContext(Ctx);
