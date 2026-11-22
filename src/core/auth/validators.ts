export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateEmail(e: string): boolean { return e.length <= 254 && EMAIL_RE.test(e.trim()); }
/** Returns an i18n key describing the first problem, or null when acceptable. */
export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'auth.passwordShort';
  if (p.length > 128) return 'auth.passwordLong';
  if (!/\p{L}/u.test(p) || !/\p{N}/u.test(p)) return 'auth.passwordWeak';
  return null;
}
