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

  // Route callbacks through refs so the LATEST closure runs at fire time
  // without rebinding tinykeys. A fresh inline `onDispatched` /
  // `shouldIgnoreEvent` each render (the common case) would otherwise freeze
  // at first bind and run with stale captured state (e.g. a stale selection).
  const onDispatchedRef = useRef(options.onDispatched);
  onDispatchedRef.current = options.onDispatched;
  const shouldIgnoreRef = useRef(options.shouldIgnoreEvent);
  shouldIgnoreRef.current = options.shouldIgnoreEvent;

  const enabled = options.enabled ?? true;
  const {
    context: _ctx,
    enabled: _en,
    onDispatched: _od,
    shouldIgnoreEvent: _sie,
    ...rest
  } = options;
  void _ctx;
  void _en;
  void _od;
  void _sie;

  useEffect(() => {
    if (!enabled) return;
    const stop = bindHotkeys(registry, {
      ...rest,
      contextProvider: () => ctxRef.current,
      // Always-installed indirection: harmless when no onDispatched is set
      // (the optional-call no-ops), and picks up the latest closure otherwise.
      onDispatched: (cmd, result) => onDispatchedRef.current?.(cmd, result),
      // Only override the binder's DEFAULT_IGNORE when the caller supplied a
      // predicate at bind time; the ref keeps it current across renders.
      // (Toggling its presence on/off mid-flight, like `target`/`tiers`,
      // requires a remount.)
      ...(shouldIgnoreRef.current
        ? { shouldIgnoreEvent: (e: KeyboardEvent) => shouldIgnoreRef.current!(e) }
        : {}),
    });
    return stop;
    // Re-bind on `keymap` identity change so a live end-user remap UI takes
    // effect (research-10). Other options (`target`, `tiers`) are static —
    // callers who change those mid-flight should remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, enabled, options.keymap]);
}

export type { BindHotkeysOptions, HotkeyDispatchListener };
