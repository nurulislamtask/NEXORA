import { validateEmail, validatePassword } from './validators.ts';

export interface AuthUser { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
export interface AuthSession { user: AuthUser }
export interface AuthApiError { message: string; status?: number; code?: string; name?: string }
type Res<T> = PromiseLike<{ data: T; error: AuthApiError | null }>;
/** Subset of supabase-js's client used by the app. */
export interface AuthClient {
  auth: {
    signUp(a: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }): Res<{ user: AuthUser | null; session: AuthSession | null }>;
    signInWithPassword(a: { email: string; password: string }): Res<{ user: AuthUser | null; session: AuthSession | null }>;
    signOut(): PromiseLike<{ error: AuthApiError | null }>;
    resetPasswordForEmail(email: string, o?: { redirectTo?: string }): Res<unknown>;
    getSession(): Res<{ session: AuthSession | null }>;
    updateUser(a: { password?: string; data?: Record<string, unknown> }): Res<{ user: AuthUser | null }>;
    resend(a: { type: 'signup'; email: string }): Res<unknown>;
  };
  rpc(fn: string): PromiseLike<{ error: AuthApiError | null }>;
  from(table: string): { update(v: Record<string, unknown>): { eq(c: string, v: unknown): PromiseLike<{ error: AuthApiError | null }> } };
}

export class AuthFailure extends Error { key: string; constructor(key: string, detail: string) { super(detail); this.name = 'AuthFailure'; this.key = key; } }

export function mapAuthError(e: AuthApiError): string {
  const m = `${e.code ?? ''} ${e.message} ${e.name ?? ''}`.toLowerCase();
  if (/invalid_credentials|invalid login/.test(m)) return 'auth.invalidCredentials';
  if (/email_not_confirmed|not confirmed/.test(m)) return 'auth.emailNotConfirmed';
  if (/user_already_exists|already registered/.test(m)) return 'auth.userExists';
  if (/weak_password|password should/.test(m)) return 'auth.passwordWeak';
  if (/rate.?limit|too many/.test(m) || e.status === 429) return 'auth.rateLimited';
  if (/failed to fetch|network|retryablefetch|load failed/.test(m) || e.status === 0) return 'auth.network';
  return 'auth.generic';
}
const unwrap = <T>(r: { data: T; error: AuthApiError | null }): T => { if (r.error) throw new AuthFailure(mapAuthError(r.error), r.error.message); return r.data; };

export type Restored = { kind: 'online'; user: AuthUser } | { kind: 'offline'; userId: string } | { kind: 'none' };

export class AuthService {
  private c: AuthClient; private redirectTo: string | undefined;
  constructor(client: AuthClient, redirectTo?: string) { this.c = client; this.redirectTo = redirectTo; }
  async signUp(email: string, password: string, name: string): Promise<'confirm-email' | 'signed-in'> {
    if (!validateEmail(email)) throw new AuthFailure('auth.emailInvalid', 'invalid email');
    const pw = validatePassword(password); if (pw) throw new AuthFailure(pw, 'weak password');
    const d = unwrap(await this.c.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, ...(this.redirectTo ? { emailRedirectTo: this.redirectTo } : {}) } }));
    return d.session ? 'signed-in' : 'confirm-email';
  }
  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!validateEmail(email)) throw new AuthFailure('auth.emailInvalid', 'invalid email');
    const d = unwrap(await this.c.auth.signInWithPassword({ email: email.trim(), password }));
    if (!d.user) throw new AuthFailure('auth.generic', 'no user'); return d.user;
  }
  async signOut(): Promise<void> { const r = await this.c.auth.signOut(); if (r.error && mapAuthError(r.error) !== 'auth.network') throw new AuthFailure(mapAuthError(r.error), r.error.message); }
  async requestPasswordReset(email: string): Promise<void> {
    if (!validateEmail(email)) throw new AuthFailure('auth.emailInvalid', 'invalid email');
    unwrap(await this.c.auth.resetPasswordForEmail(email.trim(), this.redirectTo ? { redirectTo: this.redirectTo } : undefined));
  }
  async resendConfirmation(email: string): Promise<void> { unwrap(await this.c.auth.resend({ type: 'signup', email: email.trim() })); }
  async changePassword(next: string): Promise<void> { const pw = validatePassword(next); if (pw) throw new AuthFailure(pw, 'weak password'); unwrap(await this.c.auth.updateUser({ password: next })); }
  async updateDisplayName(userId: string, name: string): Promise<void> {
    const n = name.trim(); if (n.length < 1 || n.length > 80) throw new AuthFailure('profile.nameInvalid', 'name length');
    unwrap(await this.c.auth.updateUser({ data: { name: n } }));
    const r = await this.c.from('profiles').update({ display_name: n }).eq('id', userId); if (r.error) throw new AuthFailure(mapAuthError(r.error), r.error.message);
  }
  async deleteAccount(): Promise<void> { const r = await this.c.rpc('delete_my_account'); if (r.error) throw new AuthFailure(mapAuthError(r.error), r.error.message); }
  /** Startup: valid stored session => online. Network failure with a previously bound user => keep working offline. */
  async restore(boundUserId: string | null): Promise<Restored> {
    try {
      const { data, error } = await this.c.auth.getSession();
      if (!error && data.session) return { kind: 'online', user: data.session.user };
      if (error && mapAuthError(error) === 'auth.network' && boundUserId) return { kind: 'offline', userId: boundUserId };
    } catch { if (boundUserId) return { kind: 'offline', userId: boundUserId }; }
    return { kind: 'none' };
  }
}
