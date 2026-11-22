import { invoke } from '@tauri-apps/api/core';
import type { Ctx } from '../core/data/ctx.ts';
import { createSticky, getStickyState } from '../core/data/sticky.ts';

/** Sticky windows are native desktop windows; Android/iOS have no equivalent in Tauri, so the button is hidden there. */
export const stickySupported = (): boolean => typeof navigator !== 'undefined' && !/Android|iPhone|iPad/i.test(navigator.userAgent);
export async function openSticky(ctx: Ctx, workspaceId: string, existingId?: string): Promise<void> {
  const id = existingId ?? (await createSticky(ctx, workspaceId)).id; const st = await getStickyState(ctx, id);
  await invoke('open_sticky', { id, x: st.x, y: st.y, w: st.w, h: st.h, alwaysOnTop: st.alwaysOnTop });
}
