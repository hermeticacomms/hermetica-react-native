import { call, profileAttributes, type ApiCtx } from './api.ts';

export interface InAppBlock { type: 'heading' | 'text' | 'image' | 'buttons' | 'component'; text?: string; url?: string; alt?: string; buttons?: InAppButton[]; componentKey?: string; fields?: Record<string, unknown> }
export interface InAppButton { label: string; action: 'dismiss' | 'deep_link' | 'url' | 'event'; value?: string; style?: 'primary' | 'secondary' }
export interface InAppMessage {
  id: string; variant: string; layout: 'modal' | 'banner_top' | 'banner_bottom' | 'fullscreen' | 'bottom_sheet'; queued: boolean; priority: number;
  content: { blocks: InAppBlock[]; html?: string };
  style: { background: string; textColor: string; accentColor: string; radius: number; dismissible: boolean };
}
export type InAppTrigger = { type: 'app_open' } | { type: 'screen_view'; name: string } | { type: 'event'; name: string; properties?: Record<string, unknown> };

export const newSessionId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** The messages that fit this moment, best first. Empty on any failure: a missing in-app message must never break the app. */
export async function fetchInAppMessages(ctx: ApiCtx, sessionId: string, t: InAppTrigger): Promise<InAppMessage[]> {
  const id = ctx.identity();
  if (!id.anonymousId && !id.externalId && !id.email && !id.phoneNumber) return [];
  const res = await call(ctx, 'GET', '/client/in-app-messages', {
    platform: ctx.platform, trigger: t.type, session_id: sessionId,
    name: 'name' in t ? t.name : undefined, properties: t.type === 'event' && t.properties ? JSON.stringify(t.properties) : undefined,
    external_id: id.externalId, email: id.email, phone_number: id.phoneNumber, anonymous_id: id.anonymousId,
  }).catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { items: InAppMessage[] }).items;
}

export async function reportInAppEvent(ctx: ApiCtx, sessionId: string, m: Pick<InAppMessage, 'id' | 'variant'>, type: 'impression' | 'click' | 'dismiss', button?: string): Promise<void> {
  const a = profileAttributes(ctx.identity());
  await call(ctx, 'POST', '/client/in-app-events', {}, {
    events: [{ messageId: m.id, variant: m.variant, type, platform: ctx.platform, sessionId, ...(button ? { button } : {}) }],
    profile: { externalId: a['external_id'], email: a['email'], phoneNumber: a['phone_number'], anonymousId: a['anonymous_id'] },
  }).catch(() => undefined);
}
