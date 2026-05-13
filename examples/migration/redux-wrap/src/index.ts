/**
 * Wire-up entry point. The host owns the store; acture observes it.
 *
 * Two paths reach the SAME store:
 *
 *   1. Legacy / UI path:    `store.dispatch(cartActions.addItem(...))`
 *   2. Palette / AI path:   `registry.dispatch('cart/addItem', ...)`
 *
 * In both cases `actureMiddleware` fires `onDispatch(id, params)` exactly
 * once per real state change, so observer code (palette badges, audit
 * trails, devtools) sees the events as a single stream.
 */

import { actureMiddleware } from '@acture/migration';
import { createCartStore } from './store.js';
import { createCartRegistry, registerCartCommands } from './acture/registry.js';

export interface DispatchEvent {
  readonly id: string;
  readonly params: unknown;
}

/** RTK's auto-generated action types are `slice/action` (slash-separated);
 *  acture command ids are `app.domain.action` (dot-separated). The
 *  middleware's `mapping` option is the seam: translate the action's
 *  shape into a registered id + params, or return `null` to skip.
 *
 *  Here the cart slice's action types are `cart/addItem`, `cart/removeItem`,
 *  etc. We map each to `app.cart.<verb>` and forward the payload. */
function rtkToActureId(action: { type: string; payload?: unknown }): {
  id: string;
  params?: unknown;
} | null {
  if (typeof action.type !== 'string') return null;
  const m = /^cart\/([a-zA-Z][\w]*)$/.exec(action.type);
  if (!m) return null;
  return { id: `app.cart.${m[1]}`, params: action.payload };
}

export function wireAcureCart() {
  const events: DispatchEvent[] = [];
  const registry = createCartRegistry();

  // Middleware is built against the (initially empty) registry. As
  // `registerCartCommands` adds entries, `registry.has(id)` flips true
  // and the middleware starts emitting for them.
  const store = createCartStore([
    actureMiddleware(registry, {
      mapping: rtkToActureId,
      onDispatch: (id, params) => {
        events.push({ id, params });
      },
    }),
  ]);

  registerCartCommands(registry, store);

  return { store, registry, events };
}
