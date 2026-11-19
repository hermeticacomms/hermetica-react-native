# @hermeticor/sdk-react-native

A thin wrapper over `@hermeticor/sdk-browser` for React Native and Expo, plus push-token registration, in-app messages and
geofence reporting. The browser SDK reads `localStorage`, `document` and `location` only for storage and page context, so the
wrapper supplies small stand-ins (storage preloaded from AsyncStorage). Consent gating, batching, retry and de-duplication are the
browser SDK's own. `react` and `react-native` are peer dependencies.

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createReactNativeClient } from '@hermeticor/sdk-react-native';

const hm = await createReactNativeClient({
  siteKey: 'hm_pk_...', endpoint: 'https://api.example.com', storage: AsyncStorage, appName: 'shop', platform: 'ios',
  device: { appName: 'shop', appVersion: '1.2.3', appBuild: '45', appId: 'com.example.shop', deviceModel: 'iPhone15,2', osName: 'ios', osVersion: '17.4' },
});
hm.consent.update({ analytics: true, marketing: false });
hm.identify('user-42');                 // or hm.setProfile({ email, phoneNumber, externalId })
hm.screen('Cart');                      // page view + offered to in-app messages with a screen trigger
hm.track('add_to_cart', { sku: 'A1' }, { value: 1999, currency: 'USD' });
```

## Push

Get the device token with your push library (APNs, FCM or Expo) and register it. The request is Klaviyo's
`POST /client/push-tokens` JSON:API body; `device_id` is the visitor's anonymous id.

```ts
await hm.setPushToken(token, { platform: 'ios', vendor: 'apns', environment: 'release', enablementStatus: 'AUTHORIZED', background: 'AVAILABLE' });
await hm.unregisterPushToken(token, sameOptions);   // POST /client/push-token-unregister

// Expo push token (needs a push_expo connection; all five options are required)
const { data: expoToken } = await Notifications.getExpoPushTokenAsync();
await hm.setPushToken(expoToken, { platform: Platform.OS === 'ios' ? 'ios' : 'android', vendor: 'expo', environment: 'release', enablementStatus: 'AUTHORIZED', background: 'AVAILABLE' });

// when a notification is tapped (works with raw FCM data, APNs userInfo, Expo and Notifee response objects)
const link = hm.handlePushOpened(notificationOrResponse);   // tracks "$opened_push", returns the deep link
if (link) Linking.openURL(link);
```

Sending, providers and tokens are server-side; the notification payload must carry `hermetica_message_id` (and optionally `deep_link` / `url`).
Tracking `$opened_push` needs analytics consent like any other event.

## In-app messages

Render the host once, near the root of the app. It asks for messages on mount (`app_open`) and on every `hm.screen()` / `hm.track()`,
shows the best one (modal, banner, full screen or bottom sheet), tracks impression, click and dismiss, and runs button actions.

```tsx
import { HermeticaInAppHost } from '@hermeticor/sdk-react-native';

<HermeticaInAppHost
  client={hm}
  onAction={(action, value, message) => {
    if (action === 'deep_link') { navigation.navigate(value); return false; }  // false = skip the default
  }}
/>
```

Default actions: `url` and `deep_link` open the link with `Linking.openURL`, `event` tracks the named event, `dismiss` closes.
`hm.fetchInAppMessages(trigger)` and `hm.reportInAppEvent(...)` are there if you want your own renderer.
Messages are never served to erased or fully suppressed profiles, or profiles with `do_not_track` set.

## Geofences

Hermeticor does the list and the events; your OS geofencing library (for example `react-native-geolocation-service` plus a geofence
module, or `expo-location`) does the monitoring.

```ts
const fences = await hm.getGeofences();        // [{ id, name, latitude, longitude, radius }] in metres
// register them with the OS, then on a transition:
hm.reportGeofence('enter', fence.id);          // sends "$geofence_enter" { geofence_id }; also 'exit' and 'dwell'
```

Journeys with an event trigger named `$geofence_enter`, `$geofence_exit` or `$geofence_dwell` start from these.

Not included: on-site forms, autocapture and video tracking (they need a DOM). Everything else is plain REST: for anything the wrapper
does not cover, use `POST /ingest/v1/batch` or the generated clients in `sdks/`.
Needs `crypto.randomUUID` (react-native-get-random-values) or accepts the built-in Math.random fallback for visitor ids.
