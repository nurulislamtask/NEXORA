/** Thin wrappers over optional Tauri plugins. Every call degrades to a no-op/false outside the desktop app (plain browser, tests). */
const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function notifyOs(title: string, body: string): Promise<boolean> {
  try {
    if (inTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      let ok = await n.isPermissionGranted(); if (!ok) ok = (await n.requestPermission()) === 'granted';
      if (ok) { n.sendNotification({ title, body }); return true; }
      return false;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') { new Notification(title, { body }); return true; }
  } catch { /* notification failed: the in-app banner still shows */ }
  return false;
}
/** Reads the clipboard text even while the window is unfocused (desktop app only). Returns null when unavailable. */
export async function readClipboardNative(): Promise<string | null> {
  try {
    if (inTauri()) return (await (await import('@tauri-apps/plugin-clipboard-manager')).readText()) ?? '';
    return await navigator.clipboard.readText();
  } catch { return null; }
}
export const nativeClipboardPolling = inTauri;
