import { invoke } from '@tauri-apps/api/core';
import { withMemoryFallback, type KeyStore } from './secureStorage.ts';

/** OS keychain via the Rust `secret_get` / `secret_set` commands (Windows Credential Manager, macOS Keychain, Secret Service). */
export const tauriKeyStore: KeyStore = withMemoryFallback({
  get: () => invoke<string | null>('secret_get', { name: 'storage-key' }),
  set: (v) => invoke<void>('secret_set', { name: 'storage-key', value: v }),
});
