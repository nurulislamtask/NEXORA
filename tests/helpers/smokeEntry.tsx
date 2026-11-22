import './globals.ts';
import { renderToString } from 'react-dom/server';
import { openTestDb } from './nodeDb.ts';
import { makeCtx } from '../../src/core/data/ctx.ts';
import { RT, AuthGate, type Runtime } from '../../src/app/runtime.tsx';
import { I18nProvider } from '../../src/app/i18n.tsx';
import { ToastProvider } from '../../src/app/components/ui.tsx';
import { updateSettings } from '../../src/app/store.ts';
import { SettingsPage } from '../../src/app/pages/SettingsPage.tsx';
import { AuthPage } from '../../src/app/pages/AuthPage.tsx';
import { TasksPage } from '../../src/app/pages/TasksPage.tsx';
import { NotesPage } from '../../src/app/pages/NotesPage.tsx';
import { Dashboard } from '../../src/app/pages/Dashboard.tsx';
import { RichEditor } from '../../src/app/components/RichEditor.tsx';
import { HabitsPage } from '../../src/app/pages/HabitsPage.tsx';
import { ClipboardPage } from '../../src/app/pages/ClipboardPage.tsx';
import { ProjectsPage } from '../../src/app/pages/ProjectsPage.tsx';
import { CalendarPage } from '../../src/app/pages/CalendarPage.tsx';
import { App } from '../../src/app/App.tsx';

const rt = (): Runtime => ({ ctx: makeCtx(openTestDb()), workspaceId: 'w', user: { id: 'u', email: 'a@b.co', name: 'Ann' }, offlineSession: false, auth: null, sync: null, async signOut() {} });
const wrap = (locale: 'en' | 'bn', node: unknown): string => { updateSettings({ locale }); return renderToString(<I18nProvider><ToastProvider><RT.Provider value={rt()}>{node}</RT.Provider></ToastProvider></I18nProvider>); };
export const pages = {
  settings: (l: 'en' | 'bn') => wrap(l, <SettingsPage />), tasks: (l: 'en' | 'bn') => wrap(l, <TasksPage initialView="my-day" />), notes: (l: 'en' | 'bn') => wrap(l, <NotesPage />),
  dashboard: (l: 'en' | 'bn') => wrap(l, <Dashboard go={() => {}} />), editor: (l: 'en' | 'bn') => wrap(l, <RichEditor html="<p>x</p>" onChange={() => {}} />),
  auth: (l: 'en' | 'bn') => { updateSettings({ locale: l }); return renderToString(<I18nProvider><AuthGate.Provider value={{ auth: null as never, onSignedIn() {} }}><AuthPage /></AuthGate.Provider></I18nProvider>); },
  habits: (l: 'en' | 'bn') => wrap(l, <HabitsPage />), clipboard: (l: 'en' | 'bn') => wrap(l, <ClipboardPage />),
  projects: (l: 'en' | 'bn') => wrap(l, <ProjectsPage />), calendar: (l: 'en' | 'bn') => wrap(l, <CalendarPage />),
  app: (l: 'en' | 'bn') => { updateSettings({ locale: l }); return renderToString(<App />); },
};
