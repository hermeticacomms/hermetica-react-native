import { createElement as h, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { InAppButton, InAppMessage, InAppTrigger } from './inapp.ts';

/** What the host needs from the client (the NativeClient has all of it). */
export interface InAppClient {
  fetchInAppMessages(t: InAppTrigger): Promise<InAppMessage[]>;
  reportInAppEvent(m: Pick<InAppMessage, 'id' | 'variant'>, type: 'impression' | 'click' | 'dismiss', button?: string): Promise<void>;
  onTrigger(cb: (t: InAppTrigger) => void): () => void;
  track(name: string, props?: Record<string, unknown>): void;
}
export interface InAppHostProps {
  client: InAppClient;
  /** Runs for `deep_link`, `url` and `event` buttons. Return false to skip the default (open the link with Linking, track the event). */
  onAction?: (action: 'deep_link' | 'url' | 'event', value: string, message: InAppMessage) => boolean | void;
  /** Fetch messages for the `app_open` trigger when the host mounts (default true). */
  fetchOnMount?: boolean;
}

function body(m: InAppMessage, onButton: (b: InAppButton) => void): ReactNode[] {
  const s = m.style;
  return m.content.blocks.map((b, i) => {
    if (b.type === 'heading') return h(Text, { key: i, style: { color: s.textColor, fontSize: 20, fontWeight: '700', marginBottom: 8 } }, b.text);
    if (b.type === 'text') return h(Text, { key: i, style: { color: s.textColor, fontSize: 16, marginBottom: 12 } }, b.text);
    if (b.type === 'image') return h(Image, { key: i, source: { uri: b.url }, accessibilityLabel: b.alt ?? '', resizeMode: 'cover', style: { width: '100%', height: 160, marginBottom: 12, borderRadius: Math.min(s.radius, 12) } });
    return h(View, { key: i, style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } }, (b.buttons ?? []).map((x, j) => {
      const primary = x.style !== 'secondary';
      return h(Pressable, { key: j, accessibilityRole: 'button', onPress: () => onButton(x), style: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Math.min(s.radius, 10), borderWidth: 1, borderColor: s.accentColor, backgroundColor: primary ? s.accentColor : 'transparent' } },
        h(Text, { style: { color: primary ? '#ffffff' : s.accentColor, fontWeight: '600' } }, x.label));
    }));
  });
}

function card(m: InAppMessage, onButton: (b: InAppButton) => void, onClose: () => void): ReactNode {
  const s = m.style;
  const edge = m.layout === 'fullscreen' ? { flex: 1, borderRadius: 0 } : m.layout === 'bottom_sheet' ? { borderTopLeftRadius: s.radius, borderTopRightRadius: s.radius } : m.layout === 'modal' ? { borderRadius: s.radius, marginHorizontal: 24 } : { borderRadius: 0 };
  const close = s.dismissible ? h(Pressable, { key: 'x', accessibilityRole: 'button', accessibilityLabel: 'Close', onPress: onClose, style: { position: 'absolute', top: 8, right: 12, padding: 6 } }, h(Text, { style: { color: s.textColor, fontSize: 20 } }, '×')) : null;
  return h(View, { style: { backgroundColor: s.background, padding: 20, paddingTop: s.dismissible ? 32 : 20, ...edge } }, [h(ScrollView, { key: 'b' }, body(m, onButton)), close]);
}

/**
 * Render once near the root of your app. It asks for messages on mount (app_open) and whenever the client reports a screen, event or
 * app trigger, shows the best one at a time, and tracks impression, click and dismiss.
 */
export function HermeticaInAppHost({ client, onAction, fetchOnMount = true }: InAppHostProps): ReactNode {
  const [queue, setQueue] = useState<InAppMessage[]>([]);
  const seen = useRef(new Set<string>());
  const current = queue[0];

  const run = useCallback(async (t: InAppTrigger) => {
    const [best] = await client.fetchInAppMessages(t);
    if (best && !seen.current.has(best.id)) { seen.current.add(best.id); setQueue((q) => [...q, best]); }
  }, [client]);

  useEffect(() => {
    if (fetchOnMount) void run({ type: 'app_open' });
    return client.onTrigger((t) => void run(t));
  }, [client, run, fetchOnMount]);

  useEffect(() => { if (current) void client.reportInAppEvent(current, 'impression'); }, [current?.id]);

  if (!current) return null;
  const next = () => setQueue((q) => q.slice(1));
  const onClose = () => { void client.reportInAppEvent(current, 'dismiss'); next(); };
  const onButton = (b: InAppButton) => {
    void client.reportInAppEvent(current, 'click', b.label);
    next();
    if (b.action === 'dismiss' || !b.value) return;
    if (onAction?.(b.action, b.value, current) === false) return;
    if (b.action === 'event') client.track(b.value, { hermetica_message_id: current.id });
    else void Linking.openURL(b.value);
  };

  const content = card(current, onButton, onClose);
  if (current.layout === 'banner_top' || current.layout === 'banner_bottom') {
    return h(View, { pointerEvents: 'box-none', style: { position: 'absolute', left: 0, right: 0, [current.layout === 'banner_top' ? 'top' : 'bottom']: 0 } }, content);
  }
  const place = current.layout === 'bottom_sheet' ? 'flex-end' : 'center';
  return h(Modal, { transparent: true, visible: true, animationType: current.layout === 'bottom_sheet' ? 'slide' : 'fade', onRequestClose: s0(current, onClose) },
    h(View, { style: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: place } }, content));
}

// Android back closes a dismissible message only.
const s0 = (m: InAppMessage, close: () => void) => (m.style.dismissible ? close : () => undefined);
