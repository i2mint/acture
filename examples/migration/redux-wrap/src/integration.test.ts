/**
 * End-to-end fixture for `actureMiddleware` with Redux Toolkit.
 *
 * Closes the documentation gap called out in phase-3-reflection §3 and
 * phase-4-reflection §3 (#3): the middleware was unit-tested but had no
 * worked example showing both paths converging.
 *
 * Acceptance:
 *   1. UI-path (`store.dispatch(action)`) mutates the store AND fires
 *      `onDispatch` once for the matching command id.
 *   2. Palette-path (`registry.dispatch(id, params)`) mutates the same
 *      store AND fires `onDispatch` once for the same id.
 *   3. Unregistered action types do NOT fire `onDispatch` (default
 *      `requireRegistered: true`).
 *   4. The state observed via `store.getState()` is identical regardless
 *      of which path drove the mutation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cartActions } from './store.js';
import { wireAcureCart, type DispatchEvent } from './index.js';

describe('redux-wrap example — actureMiddleware end-to-end', () => {
  let wire: ReturnType<typeof wireAcureCart>;
  let events: DispatchEvent[];

  beforeEach(() => {
    wire = wireAcureCart();
    events = wire.events;
  });

  it('UI path: store.dispatch triggers store mutation AND onDispatch', () => {
    wire.store.dispatch(cartActions.addItem({ id: 'sku-1', name: 'Widget' }));
    expect(wire.store.getState().cart.items).toEqual([
      { id: 'sku-1', name: 'Widget', qty: 1 },
    ]);
    expect(events).toEqual([
      { id: 'app.cart.addItem', params: { id: 'sku-1', name: 'Widget' } },
    ]);
  });

  it('Palette path: registry.dispatch triggers SAME store mutation AND onDispatch', async () => {
    const result = await wire.registry.dispatch('app.cart.addItem', {
      id: 'sku-2',
      name: 'Gadget',
      qty: 3,
    });
    expect(result.ok).toBe(true);
    expect(wire.store.getState().cart.items).toEqual([
      { id: 'sku-2', name: 'Gadget', qty: 3 },
    ]);
    // The palette-path mutation went through `store.dispatch` inside
    // execute, so the middleware saw it and emitted exactly once.
    expect(events).toEqual([
      { id: 'app.cart.addItem', params: { id: 'sku-2', name: 'Gadget', qty: 3 } },
    ]);
  });

  it('Unregistered action types do not fire onDispatch (default requireRegistered)', () => {
    // The middleware fires only for registered command ids. Dispatching
    // an arbitrary RTK action that has no matching command is a no-op
    // from the registry's perspective.
    wire.store.dispatch({ type: 'analytics/pageView', payload: { path: '/' } });
    expect(events).toEqual([]);
    // State unchanged (the action has no reducer either).
    expect(wire.store.getState().cart.items).toEqual([]);
  });

  it('Both paths converge on identical state', async () => {
    // Path A: UI dispatch.
    wire.store.dispatch(cartActions.addItem({ id: 'sku-A', name: 'Alpha', qty: 2 }));
    wire.store.dispatch(cartActions.applyCoupon({ code: 'WELCOME10' }));
    const stateA = wire.store.getState().cart;

    // Rebuild and run the same sequence via the palette path.
    const wireB = wireAcureCart();
    await wireB.registry.dispatch('app.cart.addItem', { id: 'sku-A', name: 'Alpha', qty: 2 });
    await wireB.registry.dispatch('app.cart.applyCoupon', { code: 'WELCOME10' });
    const stateB = wireB.store.getState().cart;

    expect(stateA).toEqual(stateB);
  });

  it('Mixed paths preserve a single observation stream', async () => {
    wire.store.dispatch(cartActions.addItem({ id: 'sku-3', name: 'X' }));
    await wire.registry.dispatch('app.cart.setQty', { id: 'sku-3', qty: 5 });
    wire.store.dispatch(cartActions.applyCoupon({ code: 'SAVE5' }));
    await wire.registry.dispatch('app.cart.clearCart', undefined);

    expect(events.map((e) => e.id)).toEqual([
      'app.cart.addItem',
      'app.cart.setQty',
      'app.cart.applyCoupon',
      'app.cart.clearCart',
    ]);
    expect(wire.store.getState().cart).toEqual({ items: [], couponCode: null });
  });
});
