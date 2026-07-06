/**
 * Optional React entry-point. Imports React lazily so a host that
 * never uses the React hook does not pull React into its bundle.
 *
 *     import { useHotkeys } from 'acture-hotkeys/react';
 */

import { useEffect, useRef } from 'react';
import type { Context, Registry } from 'acture';
import { bindHotkeys } from './bind.js';
import type { BindHotkeysOptions, HotkeyDispatchListener } from './bind.js';

export interface UseHotkeysOptions
  extends Omit<BindHotkeysOptions, 'contextProvider'> {
  /** Current context. Updates flow through without rebinding tinykeys
   *  — the underlying provider closure reads the latest ref on every
   *  fire. */
  context?: Context;
  /** Disable binding without unmounting (e.g. when a modal opens). */
  enabled?: boolean;
  onDispatched?: HotkeyDispatchListener;
}

/**
 * React hook: bind the registry's keybindings for the lifetime of the
 * calling component. The `context` value is captured via a ref so a
 * fast-changing selection / focus state doesn't churn the bindings.
 */
export function useHotkeys(
  registry: Registry,
  options: UseHotkeysOptions = {},
): void {
  const ctxRef = useRef<Context>(options.context ?? {});
  ctxRef.current = options.context ?? {};

  const enabled = options.enabled ?? true;
  const { context: _ctx, enabled: _en, ...rest } = options;
  void _ctx;
  void _en;

  useEffect(() => {
    if (!enabled) return;
    const stop = bindHotkeys(registry, {
      ...rest,
      contextProvider: () => ctxRef.current,
    });
    return stop;
    // Re-bind on `keymap` identity change so a live end-user remap UI takes
    // effect (research-10). Other options (`target`, `tiers`) are static —
    // callers who change those mid-flight should remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, enabled, options.keymap]);
}

export type { BindHotkeysOptions, HotkeyDispatchListener };
