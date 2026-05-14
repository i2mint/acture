/**
 * `acture-state-redux` — Redux Toolkit reference adapter.
 *
 * Wraps an RTK store as `PatchCapableAdapter<S>`. RTK bundles Immer, so
 * the patches story is identical to `acture-state-zustand` — same
 * `produceWithPatches` plumbing.
 *
 * Two forms:
 *
 * 1. **`createReduxAdapter({ initialState })`** — builds a fresh
 *    single-slice RTK store and hands back the adapter. Use this when
 *    acture is the dominant state owner (greenfield path).
 *
 * 2. **`wrapReduxStore(store, slice)`** — wraps an existing RTK store,
 *    treating one slice as acture's state. The host supplies selectors
 *    and a replace-action creator. Use this for the strangler-fig /
 *    drop-in path.
 *
 * ## The `previous` quirk
 *
 * RTK's `store.subscribe(listener)` calls `listener()` with no args.
 * We track `previous` ourselves between callbacks. The acture
 * `StateAdapter` contract says adapters that can't track `previous`
 * cleanly may pass the same value as `current` — RTK's notification
 * isn't synchronous-with-action either, so by the time we read
 * getState() we already have the new value. Phase 1 reflection (§2)
 * flagged this as expected.
 */

import { configureStore, createAction, createReducer } from '@reduxjs/toolkit';
import type { Action, EnhancedStore } from '@reduxjs/toolkit';
import { enablePatches, produceWithPatches, applyPatches as immerApplyPatches } from 'immer';
import type { Patch as ImmerPatch } from 'immer';
import type { PatchCapableAdapter, Patch } from 'acture';

enablePatches();

export interface CreateReduxAdapterOptions<S> {
  initialState: S;
  /** Optional action type prefix for the internal setState action.
   *  Default `'acture/setState'`. Useful only if the same store also
   *  hosts a slice that wants to react to this action. */
  actionType?: string;
}

/**
 * Build a `PatchCapableAdapter<S>` backed by a fresh single-slice RTK
 * store. Returns the adapter plus the underlying store (for devtools
 * integration).
 */
export function createReduxAdapter<S>(
  options: CreateReduxAdapterOptions<S>,
): PatchCapableAdapter<S> & { readonly store: EnhancedStore<S> } {
  const actionType = options.actionType ?? 'acture/setState';
  const replace = createAction<S>(actionType);

  const reducer = createReducer<S>(options.initialState, (builder) => {
    builder.addCase(replace, (_state, action) => action.payload);
  });

  const store = configureStore<S>({
    reducer,
    // Our payload IS the next state, which IS the next store value —
    // serializability and immutability are guaranteed by Immer upstream
    // of dispatch. Disable RTK's defensive middleware so the action
    // doesn't trip warnings for plain (already-immutable) objects.
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  return wrapAdapter(store, {
    select: (s) => s,
    makeReplace: (next) => replace(next),
  });
}

/** Selector + action-creator pair binding the adapter to one slice of
 *  an existing store. */
export interface ReduxAdapterSlice<RootState, S> {
  select: (root: RootState) => S;
  /** Returns the action that, when dispatched, replaces the slice
   *  state with the provided next value. */
  makeReplace: (next: S) => Action;
}

/**
 * Wrap an existing RTK store and treat one slice as acture's state.
 * The host supplies a selector and an action creator for replacing
 * the slice in one shot.
 */
export function wrapReduxStore<RootState, S>(
  store: EnhancedStore<RootState>,
  slice: ReduxAdapterSlice<RootState, S>,
): PatchCapableAdapter<S> & { readonly store: EnhancedStore<RootState> } {
  return wrapAdapter(store, slice);
}

/* ───────────────────────── internals ──────────────────────────────── */

function wrapAdapter<RootState, S>(
  store: EnhancedStore<RootState>,
  slice: ReduxAdapterSlice<RootState, S>,
): PatchCapableAdapter<S> & { readonly store: EnhancedStore<RootState> } {
  let previous: S = slice.select(store.getState());

  return {
    store,
    supportsPatches: true,
    getState: () => slice.select(store.getState()),

    setState(updater) {
      const current = slice.select(store.getState());
      // Immer's overloaded signature wants `Draft<S>` in the recipe;
      // acture's contract is `S`. Cast through `Function` to bridge.
      const recipe = (draft: S): S | void =>
        (updater as (s: S) => S | void)(draft);
      const result = (produceWithPatches as unknown as (
        base: S,
        recipe: (d: S) => S | void,
      ) => [S, unknown, unknown])(current, recipe);
      const next = result[0];
      store.dispatch(slice.makeReplace(next));
    },

    subscribe(listener) {
      return store.subscribe(() => {
        const next = slice.select(store.getState());
        if (next === previous) return; // RTK fires on any dispatch
        const prev = previous;
        previous = next;
        listener(next, prev);
      });
    },

    setStateWithPatches(recipe) {
      const current = slice.select(store.getState());
      const result = (produceWithPatches as unknown as (
        base: S,
        recipe: (d: S) => void,
      ) => [S, ImmerPatch[], ImmerPatch[]])(current, recipe);
      const [next, patches, inversePatches] = result;
      store.dispatch(slice.makeReplace(next));
      return {
        patches: patches.map(immerToActurePatch),
        inversePatches: inversePatches.map(immerToActurePatch),
      };
    },

    applyPatches(patches) {
      const current = slice.select(store.getState());
      const next = immerApplyPatches(
        current as object,
        patches.map(actureToImmerPatch),
      );
      store.dispatch(slice.makeReplace(next as S));
    },
  };
}

function immerToActurePatch(p: ImmerPatch): Patch {
  return {
    op: p.op as Patch['op'],
    path: p.path as readonly (string | number)[],
    value: 'value' in p ? p.value : undefined,
  };
}

function actureToImmerPatch(p: Patch): ImmerPatch {
  return {
    op: p.op,
    path: p.path as (string | number)[],
    value: p.value,
  };
}

export type { PatchCapableAdapter } from 'acture';
