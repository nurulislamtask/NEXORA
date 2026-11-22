import { useState } from 'react';
import { BUILT_IN_THEMES } from '../../core/theme/themes.ts';
import { LOCALES } from '../../core/i18n/index.ts';
import { AuthFailure } from '../../core/auth/authService.ts';
import { exportAllJson } from '../../core/data/export.ts';
import { createBackup, restoreBackup, validateBackup, type Backup } from '../../core/data/backup.ts';
import { updateSettings, useSettings } from '../store.ts';
import { useRuntime, useSyncStatus } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Dialog, Icon, useToast } from '../components/ui.tsx';
import { APP_VERSION, CLOUD_CONFIGURED } from '../env.ts';

export function SettingsPage() {
  const t = useT(); const s = useSettings(); const rt = useRuntime(); const toast = useToast(); const sync = useSyncStatus();
  const [name, setName] = useState(rt.user?.name ?? ''); const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState<{ backup: Backup; count: number } | null>(null); const [mode, setMode] = useState<'merge' | 'replace'>('merge'); const [ok, setOk] = useState(false);
  const run = async (fn: () => Promise<void>, ok?: string) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e instanceof AuthFailure ? t(e.key) : e instanceof Error ? e.message : String(e), 'err'); } };
  const save = (text: string, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  async function pick(file: File | undefined) { if (!file) return; const v = await validateBackup(rt.ctx, await file.text()); if (!v.ok) { toast(t(`backup.err.${v.error.split(':')[0]}`), 'err'); return; } setMode('merge'); setOk(false); setPending({ backup: v.backup, count: Object.values(v.counts).reduce((a, b) => a + b, 0) }); }
  async function doRestore() { if (!pending) return; if (mode === 'replace') save(await createBackup(rt.ctx), `nexora-safety-backup-${Date.now()}.json`); const r = await restoreBackup(rt.ctx, pending.backup, { mode, confirmed: ok }); setPending(null); toast(t('backup.done', { i: r.inserted, u: r.updated, r: r.removed })); }
  async function download() { const blob = new Blob([await exportAllJson(rt.ctx)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nexora-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); }
  return (<div className="stack">
    <h1>{t('nav.settings')}</h1>
    <section className="card stack"><h2>{t('settings.appearance')}</h2>
      <div className="themes" role="radiogroup" aria-label={t('settings.theme')}>{BUILT_IN_THEMES.map((th) => (
        <button key={th.id} role="radio" aria-checked={s.themeId === th.id} className={`theme-card${s.themeId === th.id ? ' on' : ''}`} onClick={() => updateSettings({ themeId: th.id, followSystem: false })}
          style={{ background: th.tokens.background, color: th.tokens.text, borderColor: s.themeId === th.id ? th.tokens.primary : th.tokens.border }}>
          <span className="dots"><i style={{ background: th.tokens.primary }} /><i style={{ background: th.tokens.accent }} /><i style={{ background: th.tokens.card, border: `1px solid ${th.tokens.border}` }} /></span>{th.name}</button>))}</div>
      <label className="inline"><input type="checkbox" checked={s.followSystem} onChange={(e) => updateSettings({ followSystem: e.target.checked })} />{t('settings.followSystem')}</label>
      <label>{t('settings.radius')}: {s.radius}px<input type="range" min={0} max={20} value={s.radius} onChange={(e) => updateSettings({ radius: Number(e.target.value) })} /></label>
      <button className="btn" onClick={() => updateSettings({ themeId: 'light', followSystem: true, radius: 10 })}>{t('settings.reset')}</button></section>
    <section className="card stack"><h2>{t('settings.language')}</h2><div className="row">{LOCALES.map((l) => <button key={l.id} className={`btn${s.locale === l.id ? ' primary' : ''}`} aria-pressed={s.locale === l.id} onClick={() => updateSettings({ locale: l.id })}>{l.label}</button>)}</div></section>
    <section className="card stack"><h2>{t('settings.sync')}</h2>
      {!CLOUD_CONFIGURED ? <p className="note">{t('settings.localOnly')}</p> : <>
        <p>{t(`sync.${sync.status}`)}{sync.lastSyncAt ? ` · ${t('sync.last', { when: new Date(sync.lastSyncAt).toLocaleString() })}` : ''} · {t('sync.pending', { n: sync.pending })}</p>
        {sync.lastError && <p className="note err" role="alert">{sync.lastError}</p>}{sync.conflicts > 0 && <p className="note">{t('sync.conflicts', { n: sync.conflicts })}</p>}
        <button className="btn" disabled={!rt.sync || sync.status === 'syncing'} onClick={() => { void rt.sync?.sync(); }}><Icon name="sync" /> {t('sync.now')}</button>
        {rt.offlineSession && <p className="note">{t('sync.offlineSession')}</p>}</>}</section>
    {rt.user && rt.auth && <section className="card stack"><h2>{t('settings.account')}</h2><p>{rt.user.email}</p>
      <label>{t('auth.name')}<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label><button className="btn" onClick={() => { void run(() => rt.auth!.updateDisplayName(rt.user!.id, name), t('common.saved')); }}>{t('common.save')}</button>
      <label>{t('settings.newPassword')}<input type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} /></label><button className="btn" disabled={!pw} onClick={() => { void run(async () => { await rt.auth!.changePassword(pw); setPw(''); }, t('common.saved')); }}>{t('settings.changePassword')}</button>
      <div className="row wrap"><button className="btn" onClick={() => { void rt.signOut(false); }}>{t('settings.signOut')}</button><button className="btn" onClick={() => { void rt.signOut(true); }}>{t('settings.signOutWipe')}</button></div></section>}
    <section className="card stack"><h2>{t('backup.title')}</h2><p className="meta">{t('backup.explain')}</p><div className="row wrap">
      <button className="btn" onClick={() => { void run(async () => { save(await createBackup(rt.ctx), `nexora-backup-${new Date().toISOString().slice(0, 10)}.json`); }, t('backup.created')); }}>{t('backup.create')}</button>
      <label className="btn file">{t('backup.restore')}<input type="file" accept="application/json,.json" hidden onChange={(e) => { void run(() => pick(e.target.files?.[0])); e.target.value = ''; }} /></label>
      <button className="btn" onClick={() => { void run(download); }}>{t('settings.export')}</button></div></section>
    <section className="card stack"><h2>{t('settings.notifications')}</h2><label>{t('settings.snooze')}<select value={s.snoozeMinutes} onChange={(e) => updateSettings({ snoozeMinutes: Number(e.target.value) })}>{[5, 10, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></section>
    {pending && <Dialog title={t('backup.confirmTitle')} onClose={() => setPending(null)}><div className="form"><p>{t('backup.summary', { n: pending.count })}</p>
      <label className="inline"><input type="radio" name="rm" checked={mode === 'merge'} onChange={() => setMode('merge')} />{t('backup.modeMerge')}</label>
      <label className="inline"><input type="radio" name="rm" checked={mode === 'replace'} onChange={() => setMode('replace')} />{t('backup.modeReplace')}</label>{mode === 'replace' && <p className="note err">{t('backup.replaceWarn')}</p>}
      <label className="inline"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />{t('backup.confirmCheck')}</label></div>
      <footer className="dialog-f"><span className="grow" /><button className="btn" onClick={() => setPending(null)}>{t('common.cancel')}</button><button className="btn primary" disabled={!ok} onClick={() => { void run(doRestore); }}>{t('backup.run')}</button></footer></Dialog>}
    {rt.user && rt.auth && <section className="card stack danger-zone"><h2>{t('settings.deleteAccount')}</h2><p>{t('settings.deleteWarn')}</p>
      <label>{t('settings.typeDelete')}<input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      <button className="btn danger" disabled={confirm !== 'DELETE'} onClick={() => { void run(async () => { await rt.auth!.deleteAccount(); await rt.signOut(true); }); }}>{t('settings.deleteAccount')}</button></section>}
    <p className="meta">NEXORA {APP_VERSION}</p>
  </div>);
}
