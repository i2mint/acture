/**
 * `acture-state-zustand` — Phase 1 reference state adapter.
 *
 * Implements `PatchCapableAdapter<S>` from `acture` on top of
 * `zustand/vanilla` + `immer`. The vanilla store is essential —
 * it gives first-class support for non-React surfaces (MCP, CLI,
 * keyboard daemons), per `acture-state-adapter` skill.
 *
 * Per research-3 §6, the entire adapter is ~50 LOC.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { enablePatches, produceWithPatches, applyPatches as immerApplyPatches } from 'immer';
import type { Patch as ImmerPatch } from 'immer';
import type { PatchCapableAdapter, Patch } from 'acture';

enablePatches();

export interface CreateZustandAdapterOptions<S> {
  /** Initial state. */
  initialState: S;
}

/**
 * Build a `PatchCapableAdapter<S>` from a plain initial state. Internally
 * creates a `zustand/vanilla` store. To wrap an existing zustand store
 * instead, use {@link wrapZustandStore}.
 */
export function createZustandAdapter<S>(
  options: CreateZustandAdapterOptions<S>,
): PatchCapableAdapter<S> & { readonly store: StoreApi<S> } {
  const store = createStore<S>(() => options.initialState);
  return wrapZustandStore(store);
}

/**
 * Wrap an existing zustand vanilla store as a `PatchCapableAdapter<S>`.
 * Patches are produced via `produceWithPatches` at `setStateWithPatches`
 * call time, so the underlying store does NOT need to use Immer
 * middleware.
 */
export function wrapZustandStore<S>(
  store: StoreApi<S>,
): PatchCapableAdapter<S> & { readonly store: StoreApi<S> } {
  let previous: S = store.getState();
  // Track previous state so we can pass (next, previous) to listeners,
  // matching the StateAdapter contract.
  store.subscribe((next) => {
    previous = next;
  });

  return {
    store,
    supportsPatches: true,
    getState: () => store.getState(),
    setState(updater) {
      const current = store.getState();
      const result = updater(current);
      // Immer-style mutate-the-draft updaters return void; return-a-new-object
      // updaters return S. Both forms are supported per the adapter contract.
      if (result === undefined) {
        // The updater mutated `current` directly. zustand's setState requires
        // a new reference for change detection — produce one via Immer.
        const [next] = produceWithPatches(current, () => result);
        store.setState(next, true);
      } else {
        store.setState(result, true);
      }
    },
    subscribe(listener) {
      return store.subscribe((next, prev) => listener(next, prev));
    },
    setStateWithPatches(recipe) {
      const before = store.getState();
      const [next, patches, inversePatches] = produceWithPatches(before, recipe);
      store.setState(next as S, true);
      return {
        patches: patches.map(immerToActurePatch),
        inversePatches: inversePatches.map(immerToActurePatch),
      };
    },
    applyPatches(patches) {
      const next = immerApplyPatches(
        store.getState() as object,
        patches.map(actureToImmerPatch),
      );
      store.setState(next as S, true);
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
