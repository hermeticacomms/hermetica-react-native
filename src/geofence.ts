import { call, type ApiCtx } from './api.ts';

export interface Geofence { id: string; name: string; latitude: number; longitude: number; radius: number }
export type GeofenceTransition = 'enter' | 'exit' | 'dwell';

/** The geofences to register with your OS geofencing library (radius in metres). Empty when the request fails. */
export async function getGeofences(ctx: ApiCtx): Promise<Geofence[]> {
  const res = await call(ctx, 'GET', '/client/geofences').catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json()) as { data: { id: string; attributes: Omit<Geofence, 'id'> }[] };
  return body.data.map((g) => ({ id: g.id, ...g.attributes }));
}

/** Sends `$geofence_enter` / `$geofence_exit` / `$geofence_dwell` as a normal event, so event-triggered journeys fire on it. */
export const reportGeofence = (ctx: ApiCtx, type: GeofenceTransition, geofenceId: string): void => ctx.track(`$geofence_${type}`, { geofence_id: geofenceId });
