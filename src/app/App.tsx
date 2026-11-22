import { useEffect, useState } from 'react';
import { applyCurrentTheme, updateSettings, useSettings, watchSystemTheme } from './store.ts';
import { I18nProvider, useT } from './i18n.tsx';
import { RuntimeProvider, useRuntime, useSyncStatus } from './runtime.tsx';
import { Icon, ToastProvider, useToast } from './components/ui.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { TasksPage } from './pages/TasksPage.tsx';
import { NotesPage } from './pages/NotesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { dueReminders, markReminderFired } from '../core/data/tasks.ts';
import type { TaskViewName } from '../core/data/tasks.ts';

type Page = 'home' | 'my-day' | 'tasks' | 'notes' | 'settings';
const NAV: { id: Page; icon: string }[] = [{ id: 'home', icon: 'home' }, { id: 'my-day', icon: 'sun' }, { id: 'tasks', icon: 'tasks' }, { id: 'notes', icon: 'notes' }, { id: 'settings', icon: 'settings' }];

function Reminders() {
  const { ctx } = useRuntime(); const toast = useToast(); const t = useT();
  useEffect(() => {
    const tick = () => { void (async () => {
      for (const r of await dueReminders(ctx, new Date().toISOString())) {
        await markReminderFired(ctx, r.id); toast(`${t('tasks.reminder')}: ${r.title}`);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('NEXORA', { body: r.title });
      }
    })(); };
    tick(); const iv = setInterval(tick, 15_000); return () => clearInterval(iv);
  }, [ctx, toast, t]);
  return null;
}
function SyncBadge() {
  const t = useT(); const s = useSyncStatus(); const { sync } = useRuntime();
  return <button className={`sync-badge ${s.status}`} onClick={() => { void sync?.sync(); }} title={s.lastError ?? ''} aria-label={t(`sync.${s.status}`)}><i />{t(`sync.${s.status}`)}</button>;
}
function Shell() {
  const t = useT(); const collapsed = useSettings().sidebarCollapsed;
  const [page, setPage] = useState<Page>('home');
  const go = (p: Page) => setPage(p);
  const body = page === 'home' ? <Dashboard go={(p) => go(p)} /> : page === 'notes' ? <NotesPage /> : page === 'settings' ? <SettingsPage /> : <TasksPage key={page} initialView={(page === 'my-day' ? 'my-day' : 'all') as TaskViewName} />;
  return (<div className={`layout${collapsed ? ' collapsed' : ''}`}>
    <aside className="sidebar" aria-label={t('nav.main')}>
      <div className="row between"><span className="brand">{collapsed ? 'N' : 'NEXORA'}</span><button className="icon-btn" onClick={() => updateSettings({ sidebarCollapsed: !collapsed })} aria-label={t('nav.toggle')}><Icon name="menu" /></button></div>
      <nav className="nav">{NAV.map((n) => <button key={n.id} aria-current={n.id === page ? 'page' : undefined} onClick={() => go(n.id)} title={t(`nav.${n.id}`)}><Icon name={n.icon} /><span>{t(`nav.${n.id}`)}</span></button>)}</nav>
      <div className="grow" /><SyncBadge /></aside>
    <main key={page} className="page">{body}</main>
    <nav className="bottom-nav" aria-label={t('nav.main')}>{NAV.filter((n) => n.id !== 'my-day').map((n) => <button key={n.id} aria-current={n.id === page ? 'page' : undefined} onClick={() => go(n.id)}><Icon name={n.icon} /><span>{t(`nav.${n.id}`)}</span></button>)}</nav>
    <Reminders />
  </div>);
}

export function App() {
  useEffect(() => { applyCurrentTheme(); return watchSystemTheme(); }, []);
  return (<I18nProvider><ToastProvider><RuntimeProvider login={<AuthPage />}><Shell /></RuntimeProvider></ToastProvider></I18nProvider>);
}
