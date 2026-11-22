import type { Ctx } from './ctx.ts';
import { getRow, putLocal } from './mutate.ts';
import { WORKSPACES } from '../sync/entities.ts';

/** Deterministic UUID-shaped id per user, so two devices creating the default workspace converge on one row. */
export async function defaultWorkspaceId(userKey: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nexora-default-ws:${userKey}`)));
  const hex = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function ensureDefaultWorkspace(ctx: Ctx, userKey: string): Promise<string> {
  const id = await defaultWorkspaceId(userKey);
  if (!(await getRow(ctx, WORKSPACES, { id }))) await putLocal(ctx, WORKSPACES, { id, name: 'Personal', icon: null, color: null, description: null, created_at: ctx.now(), deleted_at: null, version: 0 });
  return id;
}
