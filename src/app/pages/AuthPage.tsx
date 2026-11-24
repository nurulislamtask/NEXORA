import { useState, type FormEvent } from 'react';
import { AuthFailure } from '../../core/auth/authService.ts';
import { useAuthGate } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Logo } from '../components/ui.tsx';

type Mode = 'login' | 'register' | 'reset';
export function AuthPage() {
  const t = useT(); const { auth, onSignedIn } = useAuthGate();
  const [mode, setMode] = useState<Mode>('login'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'login') onSignedIn(await auth.signIn(email, password));
      else if (mode === 'register') { const r = await auth.signUp(email, password, name); if (r === 'confirm-email') { setMsg({ kind: 'ok', text: t('auth.checkEmail') }); setMode('login'); } else onSignedIn(await auth.signIn(email, password)); }
      else { await auth.requestPasswordReset(email); setMsg({ kind: 'ok', text: t('auth.resetSent') }); }
    } catch (err) { setMsg({ kind: 'err', text: err instanceof AuthFailure ? t(err.key) : t('auth.generic') }); } finally { setBusy(false); }
  }
  return (
    <div className="center"><form className="card auth" onSubmit={(e) => { void submit(e); }} aria-labelledby="auth-title">
      <div className="auth-brand"><Logo size={48} /><h1 id="auth-title" className="brand">NEXORA</h1><p className="sub">{t('auth.tagline')}</p></div><h2>{t(`auth.${mode}`)}</h2>
      {mode === 'register' && <label>{t('auth.name')}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" /></label>}
      <label>{t('auth.email')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      {mode !== 'reset' && <label>{t('auth.password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />{mode === 'register' && <small>{t('auth.passwordHint')}</small>}</label>}
      {msg && <p className={`note ${msg.kind}`} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <button className="btn primary" disabled={busy}>{busy ? t('common.loading') : t(`auth.${mode}Submit`)}</button>
      <div className="links">
        {mode !== 'login' && <button type="button" className="link" onClick={() => { setMode('login'); setMsg(null); }}>{t('auth.toLogin')}</button>}
        {mode !== 'register' && <button type="button" className="link" onClick={() => { setMode('register'); setMsg(null); }}>{t('auth.toRegister')}</button>}
        {mode === 'login' && <button type="button" className="link" onClick={() => { setMode('reset'); setMsg(null); }}>{t('auth.forgot')}</button>}
      </div></form></div>);
}
