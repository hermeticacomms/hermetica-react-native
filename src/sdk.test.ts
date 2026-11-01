import { describe, expect, it, vi } from 'vitest';
import { call, type ApiCtx } from './api.ts';
import { getGeofences, reportGeofence } from './geofence.ts';
import { handlePushOpened, pushTokenBody } from './push.ts';

const ctx = (track = vi.fn()): ApiCtx => ({
  endpoint: 'https://api.test', siteKey: 'pk', sdkVersion: 'rn-0.2', platform: 'ios', track,
  device: { appName: 'shop', appVersion: '1.2.3', deviceModel: 'iPhone15,2', osVersion: '17.4' },
  identity: () => ({ email: 'a@b.co', anonymousId: 'anon-1' }),
});
const opts = { platform: 'ios', vendor: 'apns', environment: 'release', enablementStatus: 'AUTHORIZED', background: 'AVAILABLE' } as const;

describe('push token body', () => {
  it('is the Klaviyo push-token JSON:API shape', () => {
    expect(pushTokenBody(ctx(), 'tok', opts)).toEqual({
      data: {
        type: 'push-token',
        attributes: {
          token: 'tok', platform: 'ios', vendor: 'apns', enablement_status: 'AUTHORIZED', background: 'AVAILABLE',
          device_metadata: { device_id: 'anon-1', sdk_version: 'rn-0.2', device_model: 'iPhone15,2', os_name: 'ios', os_version: '17.4', app_name: 'shop', app_version: '1.2.3', app_build: '', app_id: '', environment: 'release' },
          profile: { data: { type: 'profile', attributes: { email: 'a@b.co', anonymous_id: 'anon-1' } } },
        },
      },
    });
  });
});

describe('handlePushOpened', () => {
  it('tracks $opened_push and returns the deep link from common payload shapes', () => {
    const track = vi.fn();
    expect(handlePushOpened(ctx(track), { data: { hermetica_message_id: 'm1', deep_link: 'shop://cart' } })).toBe('shop://cart');
    expect(handlePushOpened(ctx(track), { notification: { request: { content: { data: { hermetica_message_id: 'm2', url: 'https://x.test' } } } } })).toBe('https://x.test');
    expect(handlePushOpened(ctx(track), { userInfo: { hermetica_message_id: 'm3' } })).toBeNull();
    expect(track.mock.calls.map((c) => [c[0], c[1]])).toEqual([['$opened_push', { hermetica_message_id: 'm1' }], ['$opened_push', { hermetica_message_id: 'm2' }], ['$opened_push', { hermetica_message_id: 'm3' }]]);
  });
  it('tracks nothing for a foreign notification', () => {
    const track = vi.fn();
    expect(handlePushOpened(ctx(track), { data: { other: 1 } })).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});

describe('geofences', () => {
  it('reads the JSON:API list and reports transitions as $geofence_* events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ type: 'geofence', id: 'g1', attributes: { name: 'Store', latitude: 1, longitude: 2, radius: 150 } }] }), { status: 200 })));
    expect(await getGeofences(ctx())).toEqual([{ id: 'g1', name: 'Store', latitude: 1, longitude: 2, radius: 150 }]);
    vi.unstubAllGlobals();
    const track = vi.fn();
    reportGeofence(ctx(track), 'dwell', 'g1');
    expect(track).toHaveBeenCalledWith('$geofence_dwell', { geofence_id: 'g1' });
  });
});

describe('call', () => {
  it('sends a fresh Idempotency-Key on every POST and none on GET', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await call(ctx(), 'POST', '/client/push-tokens', {}, {});
    await call(ctx(), 'POST', '/client/push-tokens', {}, {});
    await call(ctx(), 'GET', '/client/geofences');
    vi.unstubAllGlobals();
    const keys = (f.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => (init.headers as Record<string, string>)['idempotency-key']);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBeUndefined();
  });
});
