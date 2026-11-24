import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { applyCurrentTheme, updateSettings, getSettings, useSettings, watchSystemTheme } from './store.ts';
import { I18nProvider, useT } from './i18n.tsx';
import { RuntimeProvider, useRuntime, useSyncStatus } from './runtime.tsx';
import { Icon, Logo, ToastProvider, useToast } from './components/ui.tsx';
import { Palette, type PaletteTarget } from './components/Palette.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { TasksPage } from './pages/TasksPage.tsx';
import { NotesPage } from './pages/NotesPage.tsx';
import { PagesPage } from './pages/PagesPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { CalendarPage } from './pages/CalendarPage.tsx';
import { HabitsPage } from './pages/HabitsPage.tsx';
import { ClipboardPage } from './pages/ClipboardPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { dueReminders, markReminderFired, setTaskCompleted, snoozeReminder, type DueReminder } from '../core/data/tasks.ts';
import { addClip } from '../core/data/clipboard.ts';
import { nativeClipboardPolling, notifyOs, readClipboardNative } from './native.ts';
import { shortcutAction } from '../core/shortcuts.ts';
import type { TaskViewName } from '../core/data/tasks.ts';

type Page = 'home' | 'my-day' | 'tasks' | 'notes' | 'projects' | 'calendar' | 'pages' | 'habits' | 'clipboard' | 'settings';
const NAV: { id: Page; icon: string }[] = [{ id: 'home', icon: 'home' }, { id: 'my-day', icon: 'sun' }, { id: 'tasks', icon: 'tasks' }, { id: 'projects', icon: 'folder' }, { id: 'calendar', icon: 'calendar' }, { id: 'habits', icon: 'repeat' }, { id: 'notes', icon: 'notes' }, { id: 'pages', icon: 'layers' }, { id: 'clipboard', icon: 'clipboard' }, { id: 'settings', icon: 'settings' }];
const GROUPS: { key: string; ids: Page[] }[] = [{ key: 'plan', ids: ['home', 'my-day', 'tasks', 'projects', 'calendar', 'habits'] }, { key: 'capture', ids: ['notes', 'pages', 'clipboard'] }];
const TAB_BAR: Page[] = ['home', 'tasks', 'notes', 'calendar'];

/** Polls for due reminders (while the app is open). Each one stays visible until snoozed, completed or dismissed. */
function Reminders() {
  const { ctx } = useRuntime(); const t = useT(); const { snoozeMinutes } = useSettings(); const [due, setDue] = useState<DueReminder[]>([]); const notified = useRef(new Set<string>());
  useEffect(() => {
    const tick = () => { void (async () => {
      const list = await dueReminders(ctx, new Date().toISOString()); setDue(list);
      for (const r of list) if (!notified.current.has(r.id)) { notified.current.add(r.id); if (getSettings().notifications) void notifyOs('NEXORA', r.title); }
    })(); };
    tick(); const iv = setInterval(tick, 15_000); const un = ctx.events.subscribe(tick); return () => { clearInterval(iv); un(); };
  }, [ctx]);
  if (!due.length) return null;
  return (<div className="reminders" role="alert" aria-live="assertive">{due.map((r) => (
    <div key={r.id} className="card reminder"><strong>{t('reminder.title')}</strong><span>{r.title}</span>
      <span className="row wrap"><button className="btn" onClick={() => { notified.current.delete(r.id); void snoozeReminder(ctx, r.id, new Date(Date.now() + snoozeMinutes * 60_000).toISOString()).then(() => setDue((d) => d.filter((x) => x.id !== r.id))); }}>{t('reminder.snooze', { n: snoozeMinutes })}</button>
        {r.target_id && <button className="btn" onClick={() => { void setTaskCompleted(ctx, r.target_id!, true).then(() => markReminderFired(ctx, r.id)); }}>{t('reminder.complete')}</button>}
        <button className="btn" onClick={() => { void markReminderFired(ctx, r.id); }}>{t('reminder.dismiss')}</button></span></div>))}</div>);
}
/** Saves the clipboard on focus, and (desktop app) every 2 s while NEXORA is running — ONLY if the user enabled clipboard history. Nothing runs when the app is closed. */
function ClipboardWatcher() {
  const { ctx } = useRuntime(); const { clipboard } = useSettings();
  useEffect(() => {
    if (!clipboard.enabled || clipboard.paused) return;
    let last = ''; const on = () => { void readClipboardNative().then((tx) => { if (tx !== null && tx !== last) { last = tx; void addClip(ctx, tx, clipboard); } }); };
    window.addEventListener('focus', on); const iv = nativeClipboardPolling() ? setInterval(on, 2000) : undefined; // desktop app: also while the window is in the background
    return () => { window.removeEventListener('focus', on); if (iv) clearInterval(iv); };
  }, [ctx, clipboard]);
  return null;
}
function SyncBadge() {
  const t = useT(); const s = useSyncStatus(); const { sync } = useRuntime();
  return <button className={`sync-badge ${s.status}`} onClick={() => { void sync?.sync(); }} title={s.lastError ?? ''} aria-label={t(`sync.${s.status}`)}><i />{t(`sync.${s.status}`)}</button>;
}
export function Shell({ initialPage = 'home' as Page }: { initialPage?: Page } = {}) {
  const t = useT(); const toast = useToast(); const { ctx } = useRuntime(); const collapsed = useSettings().sidebarCollapsed;
  const [nav, setNav] = useState<{ page: Page; openId?: string; nonce: number }>({ page: initialPage, nonce: 0 }); const [palette, setPalette] = useState(false); const [more, setMore] = useState(false);
  const go = (page: Page, openId?: string) => setNav((n) => ({ page, ...(openId ? { openId } : {}), nonce: n.nonce }));
  const command = (c: 'new-task' | 'new-note') => setNav((n) => ({ page: c === 'new-task' ? 'tasks' : 'notes', nonce: n.nonce + 1 }));
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const on = (e: KeyboardEvent) => { const a = shortcutAction(e, mac); if (!a) return; e.preventDefault(); if (a === 'palette') setPalette((v) => !v); else command(a === 'new-task' ? 'new-task' : 'new-note'); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { let un: (() => void) | undefined; void listen('nexora:data-changed', () => ctx.events.emit()).then((f) => { un = f; }).catch(() => {}); return () => un?.(); }, [ctx]);
  const pick = (target: PaletteTarget) => { setPalette(false); if ('command' in target) command(target.command); else go(target.page, target.openId); };
  void toast;
  const { page } = nav;
  const body = page === 'home' ? <Dashboard go={(p) => go(p)} /> : page === 'notes' ? <NotesPage {...(nav.openId ? { openId: nav.openId } : {})} newSignal={nav.nonce} /> : page === 'settings' ? <SettingsPage /> : page === 'projects' ? <ProjectsPage openTasks={() => go('tasks')} /> : page === 'pages' ? <PagesPage /> : page === 'calendar' ? <CalendarPage openTask={(id) => go('tasks', id)} /> : page === 'habits' ? <HabitsPage /> : page === 'clipboard' ? <ClipboardPage /> :
    <TasksPage key={page} initialView={(page === 'my-day' ? 'my-day' : 'all') as TaskViewName} {...(nav.openId ? { openId: nav.openId } : {})} newSignal={nav.nonce} />;
  const item = (id: Page, extra = '') => <button key={id} className={extra} aria-current={id === page ? 'page' : undefined} onClick={() => { go(id); setMore(false); }} title={t(`nav.${id}`)}><Icon name={NAV.find((n) => n.id === id)!.icon} /><span>{t(`nav.${id}`)}</span></button>;
  return (<div className={`layout${collapsed ? ' collapsed' : ''}`}>
    <aside className="sidebar" aria-label={t('nav.main')}>
      <div className="side-top"><Logo size={34} /><span className="brand-name">NEXORA</span><button className="icon-btn" onClick={() => updateSettings({ sidebarCollapsed: !collapsed })} aria-label={t('nav.toggle')}><Icon name="panel" /></button></div>
      <button className="search-btn" onClick={() => setPalette(true)} aria-label={t('common.search')}><Icon name="search" /><span>{t('common.search')}</span><kbd>Ctrl K</kbd></button>
      <nav className="nav">{GROUPS.map((g) => <div key={g.key} className="nav-group"><p className="nav-label">{t(`nav.group.${g.key}`)}</p>{g.ids.map((id) => item(id))}</div>)}</nav>
      <div className="grow" /><div className="side-bottom">{item('settings')}<SyncBadge /></div></aside>
    <main key={page} className="page">{body}</main>
    <nav className="bottom-nav" aria-label={t('nav.main')}>{TAB_BAR.map((id) => item(id))}<button aria-expanded={more} onClick={() => setMore((v) => !v)}><Icon name="more" /><span>{t('nav.more')}</span></button></nav>
    {more && <div className="sheet-bg" onMouseDown={() => setMore(false)}><div className="sheet" role="menu" onMouseDown={(e) => e.stopPropagation()}>{NAV.filter((n) => !TAB_BAR.includes(n.id)).map((n) => item(n.id, 'sheet-item'))}<div className="sheet-sync"><SyncBadge /></div></div></div>}
    {palette && <Palette onPick={pick} onClose={() => setPalette(false)} />}
    <Reminders /><ClipboardWatcher />
  </div>);
}
export function App() {
  useEffect(() => { applyCurrentTheme(); return watchSystemTheme(); }, []);
  return (<I18nProvider><ToastProvider><RuntimeProvider login={<AuthPage />}><Shell /></RuntimeProvider></ToastProvider></I18nProvider>);
}
