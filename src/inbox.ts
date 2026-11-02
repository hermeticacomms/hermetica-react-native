import { call, profileAttributes, type ApiCtx } from './api.ts';

export interface InboxMessage { id: string; title: string; body: string; imageUrl: string | null; link: string | null; category: string | null; data: Record<string, unknown>; read: boolean; createdAt: string; expiresAt: string | null }
export interface InboxPage { items: InboxMessage[]; unread: number; nextCursor: string | null }

const who = (ctx: ApiCtx) => { const a = profileAttributes(ctx.identity()); return { external_id: a['external_id'], email: a['email'], phone_number: a['phone_number'], anonymous_id: a['anonymous_id'] }; };
const profile = (ctx: ApiCtx) => { const a = profileAttributes(ctx.identity()); return { externalId: a['external_id'], email: a['email'], phoneNumber: a['phone_number'], anonymousId: a['anonymous_id'] }; };

/** The person's message centre, newest first. Empty on any failure: the inbox must never break the app. */
export async function fetchInbox(ctx: ApiCtx, o: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}): Promise<InboxPage> {
  const res = await call(ctx, 'GET', '/client/inbox', { ...who(ctx), unread: o.unreadOnly ? 'true' : undefined, cursor: o.cursor, limit: o.limit ? String(o.limit) : undefined }).catch(() => null);
  if (!res?.ok) return { items: [], unread: 0, nextCursor: null };
  return (await res.json()) as InboxPage;
}

export async function setInboxRead(ctx: ApiCtx, id: string, read = true): Promise<boolean> {
  return !!(await call(ctx, 'POST', `/client/inbox/${encodeURIComponent(id)}/read`, {}, { read, profile: profile(ctx) }).catch(() => null))?.ok;
}

export async function deleteInboxMessage(ctx: ApiCtx, id: string): Promise<boolean> {
  return !!(await call(ctx, 'POST', `/client/inbox/${encodeURIComponent(id)}/delete`, {}, { profile: profile(ctx) }).catch(() => null))?.ok;
}
