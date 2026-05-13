/**
 * `actureMiddleware` — Redux/RTK store-event interception.
 *
 * Watches dispatched actions and, when an action's type matches a
 * registered acture command id (or the configured mapping yields one),
 * fires observer hooks without re-dispatching. Palette listeners, AI
 * audit trails, and devtools see store actions and registry dispatches
 * as one stream.
 *
 * "Without bypassing the registry" (per `acture-migration-package`
 * skill §"What `actureMiddleware` does") means observers attached to
 * the registry MUST see the event. We do this by calling `onDispatch`
 * — a generic hook that palette/MCP/AI surfaces can attach to the
 * registry's listener bus during their setup.
 *
 * **Scope distinction (research-4 §A.5):** this is *store-event*
 * interception. DOM-event interception (global synthetic-event capture)
 * is HARDER and is deferred to v1.1.
 *
 * **RTK compatibility:** RTK's `configureStore` accepts standard Redux
 * middleware via `middleware: (gDM) => gDM().concat(actureMiddleware(...))`.
 * The same export works for plain Redux's `applyMiddleware(...)`. RTK
 * users who want `createListenerMiddleware` semantics should compose
 * the listener middleware themselves and call `registry.dispatch(...)`
 * from inside their effects.
 */

import type { Registry } from 'acture';

/** Minimal Redux-action shape. Compatible with plain Redux, RTK, and
 *  any payload-bearing action library that follows the
 *  `{ type, payload? }` convention. */
export interface ReduxAction {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

/** Minimal Redux-store shape we touch. We only call `dispatch` /
 *  `getState` if the host explicitly opts in via `dispatchOnObserve`. */
export interface ReduxStoreLike<S = unknown> {
  dispatch: (action: ReduxAction) => ReduxAction;
  getState: () => S;
}

/** Standard Redux middleware signature. */
export type ReduxMiddleware<S = unknown> = (
  store: ReduxStoreLike<S>,
) => (next: (action: ReduxAction) => ReduxAction) => (
  action: ReduxAction,
) => ReduxAction;

export interface ActureMiddlewareOptions {
  /** Map a Redux action to an acture command-id + params. Return `null`
   *  to skip. Default: treat `action.type` as the command id and
   *  `action.payload` as the params. */
  mapping?: (action: ReduxAction) => { id: string; params?: unknown } | null;
  /** Fires whenever an intercepted action matches a registered command.
   *  This is the join point: palette / telemetry / devtools subscribe
   *  here. */
  onDispatch?: (id: string, params: unknown) => void;
  /** Require the command-id to be registered before emitting. Default
   *  true — set false if you want to observe unknown actions too. */
  requireRegistered?: boolean;
}

/**
 * Build a Redux middleware that observes dispatched actions and emits
 * acture-command-shaped events for matching registered commands. The
 * underlying action is NOT intercepted or replaced — `next(action)` is
 * always called.
 */
export function actureMiddleware<S = unknown>(
  registry: Registry,
  options: ActureMiddlewareOptions = {},
): ReduxMiddleware<S> {
  const mapping = options.mapping ?? defaultMapping;
  const requireRegistered = options.requireRegistered ?? true;
  const onDispatch = options.onDispatch;

  return (_store) => (next) => (action) => {
    const result = next(action);
    const match = mapping(action);
    if (match) {
      if (!requireRegistered || registry.has(match.id)) {
        onDispatch?.(match.id, match.params);
      }
    }
    return result;
  };
}

function defaultMapping(action: ReduxAction): { id: string; params?: unknown } | null {
  if (typeof action?.type !== 'string') return null;
  return { id: action.type, params: action.payload };
}
