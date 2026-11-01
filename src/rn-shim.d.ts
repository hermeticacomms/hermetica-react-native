// react-native is a peer dependency of the app, not installed in this repo: just the parts the in-app host uses.
declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';
  type Props = Record<string, unknown> & { children?: ReactNode };
  export const View: ComponentType<Props>;
  export const Text: ComponentType<Props>;
  export const Image: ComponentType<Props>;
  export const Pressable: ComponentType<Props>;
  export const Modal: ComponentType<Props>;
  export const ScrollView: ComponentType<Props>;
  export const Linking: { openURL(url: string): Promise<unknown> };
}
