/**
 * State adapter interface. Per research-3 §5, three methods plus an
 * optional patch-capable sub-interface. The core ships only the types;
 * concrete adapters live in `acture-state-zustand`, `acture-state-redux`,
 * etc.
 *
 * Design constraints (research-3 §2):
 * 1. Patches: must allow `produceWithPatches`-shaped output or wrappable.
 * 2. Subscribe: callable outside React; shape `(listener) => unsubscribe`.
 * 3. Typed slices: slice types are first-class TS.
 * 4. JSON-serializable snapshots: `JSON.stringify(getState())` round-trips.
 */

import type { Patch } from './types.js';

/**
 * Minimum interface every state library must satisfy.
 *
 * `setState(updater)` accepts an updater returning `S | void` so it
 * works for both "return-a-new-object" libraries (RTK reducers, plain
 * Redux) and "mutate-the-draft" libraries (zustand + Immer middleware).
 *
 * `subscribe(listener)` returns an unsubscribe function. The `previous`
 * argument is optional from the adapter's perspective: zustand passes
 * it, RTK does not. Adapters that can't track it should pass the same
 * value as `current`.
 */
export interface StateAdapter<S> {
  getState(): S;
  setState(updater: (state: S) => S | void): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

/**
 * Capability extension: adapters whose substrate produces Immer-shaped
 * patches natively (zustand+immer, RTK, MST). The future
 * `acture-undo` subsystem will check for this capability and fall back
 * to wrapping `produceWithPatches` inside the command's exec otherwise.
 */
export interface PatchCapableAdapter<S> extends StateAdapter<S> {
  readonly supportsPatches: true;
  setStateWithPatches(recipe: (draft: S) => void): {
    patches: readonly Patch[];
    inversePatches: readonly Patch[];
  };
  applyPatches(patches: readonly Patch[]): void;
}

/**
 * Capability extension for adapters that expose efficient selector
 * subscriptions natively (zustand). Optional.
 */
export interface SelectableAdapter<S> extends StateAdapter<S> {
  select<T>(
    selector: (s: S) => T,
    listener: (current: T, previous: T) => void,
    equalityFn?: (a: T, b: T) => boolean,
  ): () => void;
}

/** Type guard: is this adapter patch-capable? */
export function isPatchCapable<S>(
  adapter: StateAdapter<S>,
): adapter is PatchCapableAdapter<S> {
  return (
    (adapter as Partial<PatchCapableAdapter<S>>).supportsPatches === true
  );
}
