import { call, profileAttributes, type ApiCtx } from './api.ts';

export interface PushOptions {
  platform: 'ios' | 'android';
  vendor: 'apns' | 'fcm' | 'expo';
  environment: 'debug' | 'release';
  enablementStatus: 'AUTHORIZED' | 'DENIED' | 'NOT_DETERMINED' | 'PROVISIONAL' | 'UNAUTHORIZED';
  background: 'AVAILABLE' | 'DENIED' | 'RESTRICTED';
}

/** Klaviyo's push-token JSON:API body, byte for byte what the server expects. */
export function pushTokenBody(ctx: ApiCtx, token: string, o: PushOptions) {
  const id = ctx.identity();
  const d = ctx.device;
  return {
    data: {
      type: 'push-token',
      attributes: {
        token, platform: o.platform, vendor: o.vendor, enablement_status: o.enablementStatus, background: o.background,
        device_metadata: {
          device_id: id.anonymousId ?? '', sdk_version: ctx.sdkVersion, device_model: d.deviceModel ?? '', os_name: d.osName ?? o.platform, os_version: d.osVersion ?? '',
          app_name: d.appName ?? '', app_version: d.appVersion ?? '', app_build: d.appBuild ?? '', app_id: d.appId ?? '', environment: o.environment,
        },
        profile: { data: { type: 'profile', attributes: profileAttributes(id) } },
      },
    },
  };
}

export const setPushToken = async (ctx: ApiCtx, token: string, o: PushOptions): Promise<boolean> =>
  (await call(ctx, 'POST', '/client/push-tokens', {}, pushTokenBody(ctx, token, o))).ok;

/** Same shape as registering; the token stops receiving pushes. */
export const unregisterPushToken = async (ctx: ApiCtx, token: string, o: PushOptions): Promise<boolean> =>
  (await call(ctx, 'POST', '/client/push-token-unregister', {}, pushTokenBody(ctx, token, o))).ok;

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);

/** Where push libraries put the custom data: raw FCM `data`, APNs `userInfo`, Expo/Notifee response objects. */
function dataOf(payload: unknown): Bag {
  if (!isBag(payload)) return {};
  const nested = [payload['data'], payload['userInfo'], isBag(payload['notification']) ? payload['notification'] : undefined, isBag(payload['request']) ? payload['request'] : undefined];
  const layers: unknown[] = [payload, ...nested.flatMap((n) => (isBag(n) ? [n, n['data'], isBag(n['request']) && isBag(n['request']['content']) ? n['request']['content']['data'] : undefined, isBag(n['content']) ? n['content']['data'] : undefined] : []))];
  return Object.assign({}, ...layers.filter(isBag));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Tracks `$opened_push` for the Hermeticor message the notification carried and returns its deep link (or null). Call it when the user taps a notification. */
export function handlePushOpened(ctx: ApiCtx, payload: unknown): string | null {
  const d = dataOf(payload);
  const messageId = str(d['hermetica_message_id']);
  if (messageId) ctx.track('$opened_push', { hermetica_message_id: messageId });
  return str(d['deep_link']) ?? str(d['url']) ?? str(d['hermetica_url']);
}

/** Call when a notification arrives (foreground handler or notification service extension): tracks `$received_push`, which counts as delivered. Returns whether it was ours. */
export function handlePushReceived(ctx: ApiCtx, payload: unknown): boolean {
  const messageId = str(dataOf(payload)['hermetica_message_id']);
  if (messageId) ctx.track('$received_push', { hermetica_message_id: messageId });
  return !!messageId;
}

/** Call when the person did what the push was for (bought, booked...). Pass the notification payload or its message id; tracks `$converted_push` once per message on the server. */
export function trackPushConversion(ctx: ApiCtx, payloadOrMessageId: unknown, props: Record<string, unknown> = {}): boolean {
  const messageId = typeof payloadOrMessageId === 'string' ? payloadOrMessageId : str(dataOf(payloadOrMessageId)['hermetica_message_id']);
  if (messageId) ctx.track('$converted_push', { ...props, hermetica_message_id: messageId });
  return !!messageId;
}
