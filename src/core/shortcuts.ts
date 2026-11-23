export type ShortcutAction = 'palette' | 'new-note' | 'new-task';
export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
/** Ctrl (Windows/Linux) or Cmd (macOS): K / P = palette, N = new note, Shift+N = new task. */
export function shortcutAction(e: KeyLike, isMac: boolean): ShortcutAction | null {
  if (e.altKey || !(isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if ((k === 'k' || k === 'p') && !e.shiftKey) return 'palette';
  if (k === 'n') return e.shiftKey ? 'new-task' : 'new-note';
  return null;
}
