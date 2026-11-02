import { call, profileAttributes, type ApiCtx } from './api.ts';

export interface LiveTokenInput { kind: 'push_to_start' | 'update'; token: string; activityType?: string; activityId?: string; environment?: 'sandbox' | 'production'; appId?: string }
/** What an Android ongoing-notification data message asks the app to show. Render it with your notification library, keyed by `activityId`, and remove it on `end`. */
export interface LiveUpdate { activityId: string; event: 'start' | 'update' | 'end'; activityType: string; contentState: Record<string, unknown>; attributes: Record<string, unknown>; title?: string; body?: string; dismissAt?: number }

/** iOS: report ActivityKit's push-to-start token (`Activity<T>.pushToStartTokenUpdates`) or a running activity's `pushTokenUpdates`, hex-encoded. */
export async function registerLiveActivityToken(ctx: ApiCtx, t: LiveTokenInput): Promise<boolean> {
  const a = profileAttributes(ctx.identity());
  const res = await call(ctx, 'POST', '/client/push-live-tokens', {}, {
    ...t, environment: t.environment ?? 'production', profile: { externalId: a['external_id'], email: a['email'], phoneNumber: a['phone_number'], anonymousId: a['anonymous_id'] },
  }).catch(() => null);
  return !!res?.ok;
}

const parse = (v: unknown): Record<string, unknown> => { try { const o: unknown = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o === 'object' ? (o as Record<string, unknown>) : {}; } catch { return {}; } };

/** Reads a live-notification data message (FCM `data`); null for any other message. */
export function liveUpdateOf(data: Record<string, unknown> | undefined): LiveUpdate | null {
  if (!data || data['hermetica_live'] !== '1' || typeof data['hermetica_activity_id'] !== 'string') return null;
  const event = data['event'] === 'end' ? 'end' : data['event'] === 'start' ? 'start' : 'update';
  return {
    activityId: data['hermetica_activity_id'], event, activityType: String(data['activity_type'] ?? ''), contentState: parse(data['content_state']), attributes: parse(data['attributes']),
    ...(typeof data['title'] === 'string' ? { title: data['title'] } : {}), ...(typeof data['body'] === 'string' ? { body: data['body'] } : {}),
    ...(data['dismiss_at'] ? { dismissAt: Number(data['dismiss_at']) } : {}),
  };
}
