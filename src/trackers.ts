import { call, profileAttributes, type ApiCtx } from './api.ts';

/** A journey's tracker step asks the app to show a developer-defined component with these field values, and waits for one of `events`. */
export interface Tracker { id: string; componentKey: string; fields: Record<string, unknown>; events: string[] }
/** Your component: render it from `fields`, call `report(event)` with one of the tracker's events (that moves the journey on). */
export type ComponentRenderer = (t: Tracker, report: (event: string) => Promise<boolean>) => unknown;

export async function fetchTrackers(ctx: ApiCtx): Promise<Tracker[]> {
  const a = profileAttributes(ctx.identity());
  if (!a['external_id'] && !a['email'] && !a['phone_number'] && !a['anonymous_id']) return [];
  const res = await call(ctx, 'GET', '/client/in-app-trackers', { external_id: a['external_id'], email: a['email'], phone_number: a['phone_number'], anonymous_id: a['anonymous_id'] }).catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { items: Tracker[] }).items;
}

export async function reportTrackerEvent(ctx: ApiCtx, trackerId: string, event: string): Promise<boolean> {
  const a = profileAttributes(ctx.identity());
  const res = await call(ctx, 'POST', `/client/in-app-trackers/${encodeURIComponent(trackerId)}/events`, {}, {
    event, profile: { externalId: a['external_id'], email: a['email'], phoneNumber: a['phone_number'], anonymousId: a['anonymous_id'] },
  }).catch(() => null);
  return !!res?.ok;
}
