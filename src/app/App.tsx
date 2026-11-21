import { useEffect, useState } from 'react';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyTheme } from '../core/theme/themes.ts';

const NAV = ['Home', 'My Day', 'Tasks', 'Notes', 'Calendar', 'Habits', 'Settings'] as const;
const KEY = 'nexora.theme';

/** Phase-1 shell: navigation + working theme switcher. Feature screens are NOT implemented yet. */
export function App() {
  const [themeId, setThemeId] = useState(() => localStorage.getItem(KEY) ?? DEFAULT_THEME_ID);
  const [page, setPage] = useState<(typeof NAV)[number]>('Home');
  useEffect(() => {
    const th = BUILT_IN_THEMES.find((x) => x.id === themeId) ?? BUILT_IN_THEMES[0]!;
    applyTheme(th); localStorage.setItem(KEY, th.id);
  }, [themeId]);
  return (
    <div className="layout">
      <aside className="sidebar"><h2>NEXORA</h2>
        <nav className="nav" aria-label="Main">{NAV.map((n) => (
          <button key={n} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>))}</nav></aside>
      <main style={{ padding: 24 }}><h1>{page}</h1>
        {page === 'Settings' ? (
          <div className="card"><label>Theme{' '}
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              {BUILT_IN_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
        ) : <div className="card">Not implemented yet.</div>}
      </main>
    </div>);
}
