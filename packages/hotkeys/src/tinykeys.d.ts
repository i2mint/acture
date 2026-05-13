// Tinykeys 3.0.0 ships .d.ts but its package.json `exports` field
// doesn't list `types`, so TypeScript with `moduleResolution: Bundler`
// can't find them. This ambient declaration mirrors the surface we use.

declare module 'tinykeys' {
  export type KeyBindingMap = Record<string, (event: KeyboardEvent) => void>;
  export interface KeyBindingOptions {
    timeout?: number;
    event?: 'keydown' | 'keyup';
  }
  export function tinykeys(
    target: Window | HTMLElement | EventTarget,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingOptions,
  ): () => void;
}
