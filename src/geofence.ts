import { call, profileAttributes, type ApiCtx } from './api.ts';

export interface Geofence { id: string; name: string; latitude: number; longitude: number; radius: number }
export type GeofenceTransition = 'enter' | 'exit' | 'dwell';

/** The geofences to register with your OS geofencing library (radius in metres). Empty when the request fails. */
export async function getGeofences(ctx: ApiCtx): Promise<Geofence[]> {
  const res = await call(ctx, 'GET', '/client/geofences').catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json()) as { data: { id: string; attributes: Omit<Geofence, 'id'> }[] };
  return body.data.map((g) => ({ id: g.id, ...g.attributes }));
}

/**
 * Reports the hit to the server, which records `geofence_entered` / `geofence_exited` / `geofence_dwelled` (with the geofence's name and position).
 * Only when the server cannot be reached does it fall back to the legacy `$geofence_*` event, so one hit never fires a journey trigger twice.
 */
export function reportGeofence(ctx: ApiCtx, type: GeofenceTransition, geofenceId: string): void {
  const a = profileAttributes(ctx.identity());
  const legacy = () => ctx.track(`$geofence_${type}`, { geofence_id: geofenceId });
  void call(ctx, 'POST', '/client/geofence-events', {}, {
    geofenceId, transition: type, profile: { externalId: a['external_id'], email: a['email'], phoneNumber: a['phone_number'], anonymousId: a['anonymous_id'] },
  }).then((r) => { if (!r.ok) legacy(); }, legacy);
}
