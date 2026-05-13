/**
 * The single acture registry for this app. The cart's five RTK actions
 * are registered here with matching ids so `actureMiddleware` can
 * recognise them when they flow through the store.
 *
 * Note: these commands are observer-only — their `execute` re-dispatches
 * via the host store, so palette / AI invocations land in the SAME store
 * the UI uses. The middleware does NOT call execute; it fires its
 * `onDispatch` hook so registry listeners see store-driven actions and
 * palette-driven dispatches as one stream.
 *
 * `createCartRegistry()` returns the empty registry so the store can be
 * built with the middleware wired against it. `registerCartCommands()`
 * fills it in once the store is available (commands close over `store`).
 */

import { z } from 'zod';
import { createRegistry, defineCommand, ok, type Registry } from 'acture';
import type { CartStore } from '../store.js';
import { cartActions } from '../store.js';

export function createCartRegistry(): Registry {
  return createRegistry();
}

export function registerCartCommands(registry: Registry, store: CartStore): void {
  registry.register(
    defineCommand({
      id: 'app.cart.addItem',
      title: 'Add to cart',
      params: z.object({ id: z.string(), name: z.string(), qty: z.number().optional() }),
      execute: (p) => {
        store.dispatch(cartActions.addItem(p));
        return ok(store.getState().cart);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'app.cart.removeItem',
      title: 'Remove from cart',
      params: z.object({ id: z.string() }),
      execute: (p) => {
        store.dispatch(cartActions.removeItem(p));
        return ok(store.getState().cart);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'app.cart.setQty',
      title: 'Set quantity',
      params: z.object({ id: z.string(), qty: z.number() }),
      execute: (p) => {
        store.dispatch(cartActions.setQty(p));
        return ok(store.getState().cart);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'app.cart.applyCoupon',
      title: 'Apply coupon',
      params: z.object({ code: z.string() }),
      execute: (p) => {
        store.dispatch(cartActions.applyCoupon(p));
        return ok(store.getState().cart);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'app.cart.clearCart',
      title: 'Clear cart',
      execute: () => {
        store.dispatch(cartActions.clearCart());
        return ok(store.getState().cart);
      },
    }),
  );
}
