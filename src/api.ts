/** Shared by the push, in-app and geofence helpers: where to call, with which key, and who the visitor is. */
export interface ProfileIds { externalId?: string | undefined; email?: string | undefined; phoneNumber?: string | undefined }
export interface ApiCtx {
  endpoint: string;
  siteKey: string;
  identity: () => ProfileIds & { anonymousId?: string | undefined };
  track: (name: string, props?: Record<string, unknown>) => void;
  device: DeviceMetadata;
  sdkVersion: string;
  platform: 'ios' | 'android';
}
/** Optional description of the app and handset; sent with push tokens. Fill it from react-native-device-info or expo-device. */
export interface DeviceMetadata { deviceModel?: string; osName?: string; osVersion?: string; appName?: string; appVersion?: string; appBuild?: string; appId?: string }

const opt = (k: string, v: string | undefined): Record<string, string> => (v ? { [k]: v } : {});

export const profileAttributes = (id: ReturnType<ApiCtx['identity']>) => ({ ...opt('email', id.email), ...opt('phone_number', id.phoneNumber), ...opt('external_id', id.externalId), ...opt('anonymous_id', id.anonymousId) });

export async function call(ctx: ApiCtx, method: 'GET' | 'POST', path: string, query: Record<string, string | undefined> = {}, body?: unknown): Promise<Response> {
  const q = new URLSearchParams({ company_id: ctx.siteKey });
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') q.set(k, v);
  return fetch(`${ctx.endpoint.replace(/\/$/, '')}${path}?${q}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${ctx.siteKey}`, ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
