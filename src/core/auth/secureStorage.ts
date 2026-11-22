/** Encrypts everything the auth library persists (session + refresh token) with AES-256-GCM.
 *  The 256-bit key lives in a KeyStore (OS keychain in the desktop app), the ciphertext in ordinary storage,
 *  so copying the app-data folder alone does not reveal tokens. */
export interface KeyStore { get(): Promise<string | null>; set(base64Key: string): Promise<void> }
export interface KV { getItem(k: string): string | null | Promise<string | null>; setItem(k: string, v: string): void | Promise<void>; removeItem(k: string): void | Promise<void> }

const b64 = (u: Uint8Array): string => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PREFIX = 'v1.';

export class EncryptedStorage {
  private ks: KeyStore; private kv: KV; private key: Promise<CryptoKey> | null = null;
  constructor(ks: KeyStore, kv: KV) { this.ks = ks; this.kv = kv; }
  private getKey(): Promise<CryptoKey> {
    this.key ??= (async () => {
      let raw = await this.ks.get();
      if (!raw) { raw = b64(crypto.getRandomValues(new Uint8Array(32))); await this.ks.set(raw); }
      return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
    })();
    return this.key;
  }
  async setItem(name: string, value: string): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) }, await this.getKey(), new TextEncoder().encode(value)));
    await this.kv.setItem(name, `${PREFIX}${b64(iv)}.${b64(ct)}`);
  }
  /** Returns null for missing, tampered, wrong-key or legacy-plaintext values (never throws). */
  async getItem(name: string): Promise<string | null> {
    const raw = await this.kv.getItem(name);
    if (!raw?.startsWith(PREFIX)) return null;
    try {
      const [iv, ct] = raw.slice(PREFIX.length).split('.') as [string, string];
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(name) }, await this.getKey(), unb64(ct));
      return new TextDecoder().decode(pt);
    } catch { return null; }
  }
  async removeItem(name: string): Promise<void> { await this.kv.removeItem(name); }
}
