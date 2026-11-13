import { createClient, type Client, type ClientOptions } from '@hermeticacomms/sdk-browser';
import type { ApiCtx, DeviceMetadata, ProfileIds } from './api.ts';
import { getGeofences, reportGeofence, type Geofence, type GeofenceTransition } from './geofence.ts';
import { fetchInAppMessages, newSessionId, reportInAppEvent, type InAppMessage, type InAppTrigger } from './inapp.ts';
import { handlePushOpened, handlePushReceived, setPushToken, trackPushConversion, unregisterPushToken, type PushOptions } from './push.ts';
import { deleteInboxMessage, fetchInbox, setInboxRead, type InboxMessage, type InboxPage } from './inbox.ts';
import { liveUpdateOf, registerLiveActivityToken, type LiveTokenInput, type LiveUpdate } from './live.ts';
import { fetchTrackers, reportTrackerEvent, type ComponentRenderer, type Tracker } from './trackers.ts';

export { HermeticaInAppHost, type InAppClient, type InAppHostProps } from './host.ts';
export type { ComponentRenderer, DeviceMetadata, Geofence, GeofenceTransition, InAppMessage, InAppTrigger, InboxMessage, InboxPage, LiveTokenInput, LiveUpdate, ProfileIds, PushOptions, Tracker };
export { liveUpdateOf };

/** The slice of @react-native-async-storage/async-storage used here (any async key-value store with this shape works). */
export interface AsyncKv { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }

export type NativeClient = Client & {
  /** A screen view: sent as a page view with the screen name in place of a URL, and offered to in-app messages with a screen trigger. */
  screen(name: string, props?: Record<string, unknown>): void;
  /** Tell push and in-app who this is (email / phone / external id). `identify()` sets the external id too. */
  setProfile(p: ProfileIds): void;
  /** Register the device token with the profile. Resolves false when the server refused it. */
  setPushToken(token: string, o: PushOptions): Promise<boolean>;
  unregisterPushToken(token: string, o: PushOptions): Promise<boolean>;
  /** Call when a notification is tapped: tracks `$opened_push` and returns the deep link in the payload (or null). */
  handlePushOpened(notificationPayload: unknown): string | null;
  /** Call when a notification arrives: tracks `$received_push` (delivered). */
  handlePushReceived(notificationPayload: unknown): boolean;
  /** Call when the person did what the push was for: tracks `$converted_push` for that message. */
  trackPushConversion(notificationPayloadOrMessageId: unknown, props?: Record<string, unknown>): boolean;
  /** iOS Live Activities: report a push-to-start token or a running activity's update token. */
  registerLiveActivityToken(t: LiveTokenInput): Promise<boolean>;
  /** Message centre: list, mark read/unread, delete. */
  fetchInbox(o?: { unreadOnly?: boolean; cursor?: string; limit?: number }): Promise<InboxPage>;
  setInboxRead(id: string, read?: boolean): Promise<boolean>;
  deleteInboxMessage(id: string): Promise<boolean>;
  /** Developer-defined components a journey's tracker step asked to show, and the event that moves the journey on. */
  fetchTrackers(): Promise<Tracker[]>;
  reportTrackerEvent(trackerId: string, event: string): Promise<boolean>;
  fetchInAppMessages(trigger: InAppTrigger): Promise<InAppMessage[]>;
  reportInAppEvent(m: Pick<InAppMessage, 'id' | 'variant'>, type: 'impression' | 'click' | 'dismiss', button?: string): Promise<void>;
  /** Subscribe to moments that can show an in-app message (screens, events). The in-app host uses this. */
  onTrigger(cb: (t: InAppTrigger) => void): () => void;
  getGeofences(): Promise<Geofence[]>;
  /** Report a transition from your OS geofencing library; event-triggered journeys fire on `$geofence_enter` / `_exit` / `_dwell`. */
  reportGeofence(type: GeofenceTransition, geofenceId: string): void;
};

const KEYS = ['hm_aid', 'hm_consent'];
type G = Record<string, unknown>;

/**
 * React Native wrapper around the browser SDK. The SDK only needs `localStorage`, `document` and `location` for page
 * context, so this installs small stand-ins (storage preloaded from AsyncStorage and written through to it) and keeps the
 * same consent gate, batching, retries and idempotency as the web client. No forms, autocapture or video: those need a DOM.
 * Needs `crypto.randomUUID` (use react-native-get-random-values or a polyfill; a Math.random fallback is installed otherwise).
 */
export async function createReactNativeClient(opts: Omit<ClientOptions, 'storage' | 'forms' | 'autocapture' | 'trackVideo' | 'autoPageViews'> & { storage: AsyncKv; appName?: string; device?: DeviceMetadata; platform?: 'ios' | 'android' }): Promise<NativeClient> {
  const g = globalThis as unknown as G;
  const cache = new Map<string, string>();
  for (const k of KEYS) { const v = await opts.storage.getItem(k); if (v !== null) cache.set(k, v); }
  g.localStorage = {
    getItem: (k: string) => cache.get(k) ?? null,
    setItem: (k: string, v: string) => { cache.set(k, v); void opts.storage.setItem(k, v); },
    removeItem: (k: string) => { cache.delete(k); void opts.storage.removeItem(k); },
  };
  const loc = { href: `app://${opts.appName ?? 'app'}/`, pathname: '/' };
  g.location = loc;
  g.document = { referrer: '', title: opts.appName ?? 'app', addEventListener: () => undefined };
  const c = g.crypto as { randomUUID?: () => string } | undefined;
  if (!c?.randomUUID) g.crypto = { ...c, randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16); }) };
  const { storage: _kv, appName: _name, device, platform, ...rest } = opts;
  const client = createClient({ ...rest, storage: 'local' });
  const profile: ProfileIds = {};
  const listeners = new Set<(t: InAppTrigger) => void>();
  const emit = (t: InAppTrigger) => listeners.forEach((f) => f(t));
  const sessionId = newSessionId();
  const track: Client['track'] = (name, props = {}, o) => { client.track(name, props, o); emit({ type: 'event', name, properties: props }); };
  const api: ApiCtx = {
    endpoint: opts.endpoint, siteKey: opts.siteKey, sdkVersion: 'rn-0.4.0', device: { appName: opts.appName, ...device }, platform: platform ?? (device?.osName?.toLowerCase() === 'android' ? 'android' : 'ios'),
    identity: () => ({ ...profile, anonymousId: client.anonymousId() ?? undefined }),
    // Push opens and geofences are sent straight to the client: they are not in-app triggers.
    track: (name, props) => client.track(name, props),
  };
  return {
    ...client,
    track,
    identify: (externalId, traits) => { profile.externalId = externalId ?? undefined; client.identify(externalId, traits); },
    screen: (name, props = {}) => { loc.href = `app://${opts.appName ?? 'app'}/${encodeURIComponent(name)}`; loc.pathname = `/${name}`; client.page({ screen: name, ...props }); emit({ type: 'screen_view', name }); },
    setProfile: (p) => { Object.assign(profile, p); },
    setPushToken: (token, o) => setPushToken(api, token, o),
    unregisterPushToken: (token, o) => unregisterPushToken(api, token, o),
    handlePushOpened: (payload) => handlePushOpened(api, payload),
    handlePushReceived: (payload) => handlePushReceived(api, payload),
    trackPushConversion: (payload, props) => trackPushConversion(api, payload, props),
    registerLiveActivityToken: (t) => registerLiveActivityToken(api, t),
    fetchInbox: (o) => fetchInbox(api, o),
    setInboxRead: (id, read) => setInboxRead(api, id, read),
    deleteInboxMessage: (id) => deleteInboxMessage(api, id),
    fetchTrackers: () => fetchTrackers(api),
    reportTrackerEvent: (id, event) => reportTrackerEvent(api, id, event),
    fetchInAppMessages: (t) => fetchInAppMessages(api, sessionId, t),
    reportInAppEvent: (m, type, button) => reportInAppEvent(api, sessionId, m, type, button),
    onTrigger: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getGeofences: () => getGeofences(api),
    reportGeofence: (type, id) => reportGeofence(api, type, id),
  };
}
