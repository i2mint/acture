---
name: acture-state-adapter
description: Load context on acture's StateAdapter<S> interface (per research-3), the PatchCapableAdapter sub-interface for the future undo subsystem, and the strategy of being state-library-agnostic with documented happy-path adapters. Two reference adapters now ship: `acture-state-zustand` and `acture-state-redux`. Use when building or modifying a state adapter, when designing the StateAdapter interface, when working on the reference adapters, when integrating acture with a host app's existing store, or when reviewing the get/set/subscribe contract. Triggers on "StateAdapter", "state library", "zustand", "Redux Toolkit", "RTK", "Jotai", "Valtio", "MobX", "Effector", "XState", "state substrate", "patches", "Immer", "produceWithPatches". Do NOT use for the undo subsystem itself (post-v1).
---

# acture state adapter

Loads research-3's findings on state-library substrate trade-offs and the resulting interface.

## The strategy: agnostic with happy path

Acture is **state-library-agnostic at the public type boundary**, **opinionated in the recommended-defaults documentation**. An AI coding agent installing acture into a user's codebase picks the adapter that matches the user's existing stack; greenfield users follow the zustand happy path.

## The interface (research-3 §5)

```ts
export interface StateAdapter<S> {
  getState(): S;
  setState(updater: (state: S) => S | void): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

export interface PatchCapableAdapter<S> extends StateAdapter<S> {
  readonly supportsPatches: true;
  setStateWithPatches(
    recipe: (draft: S) => void
  ): { patches: Patch[]; inversePatches: Patch[] };
  applyPatches(patches: Patch[]): void;
}

export interface SelectableAdapter<S> extends StateAdapter<S> {
  select<T>(
    selector: (s: S) => T,
    listener: (current: T, previous: T) => void,
    equalityFn?: (a: T, b: T) => boolean
  ): () => void;
}

export function isPatchCapable<S>(a: StateAdapter<S>): a is PatchCapableAdapter<S> {
  return (a as Partial<PatchCapableAdapter<S>>).supportsPatches === true;
}
```

## Why these three methods specifically

Per research-3 §2, the four constraints acture has on its substrate:

1. **Patches for undo** (post-v1) — must allow `produceWithPatches`-shaped output OR allow acture to wrap the substrate's setter.
2. **`commandsChanged` observables** — subscribe must be callable outside React, of shape `(listener) => unsubscribe`, no Provider required.
3. **Typed slices** — slice types must be first-class TS types, not runtime-only things.
4. **JSON-serializable snapshots** — `JSON.stringify(getState())` must round-trip.

All seven candidate libraries (zustand, RTK, Jotai, MobX, Valtio, Effector, XState) satisfy constraints 2, 3, 4 — but only RTK and zustand+immer produce patches natively. **That's why patches are an optional capability**, exposed via discriminated `PatchCapableAdapter`.

## The dual-form `setState(updater)`

`updater` returns `S | void`. This is intentional dual form:
- A library that returns a new object (RTK reducers under Immer, plain Redux) satisfies `(s) => S`.
- A library running under Immer where the reducer mutates a draft and returns void (zustand+immer middleware) satisfies `(s) => void`.

Both are valid. Implementations choose whichever fits their substrate.

## The `previous: S` listener parameter

zustand passes `(state, previous)`. RTK passes nothing. Recommendation: keep `previous` in the interface; default to `undefined` for adapters that don't track it. Document the quirk in the adapter's README.

## Reference adapter: `acture-state-zustand`

The documented happy path. Per research-3 §6, ~50 LOC including tests.

```ts
import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { produceWithPatches, applyPatches } from 'immer';

export function createZustandAdapter<S>(initial: S): PatchCapableAdapter<S> {
  const store = createStore(immer<S>(() => initial));
  return {
    getState: store.getState,
    setState: (updater) => store.setState(updater as any),
    subscribe: store.subscribe,
    supportsPatches: true,
    setStateWithPatches(recipe) {
      const before = store.getState();
      const [next, patches, inversePatches] = produceWithPatches(before, recipe);
      store.setState(() => next);
      return { patches, inversePatches };
    },
    applyPatches(patches) {
      store.setState((state) => applyPatches(state, patches));
    },
  };
}
```

`zustand/vanilla` is essential — it gives first-class support for non-React surfaces (MCP, CLI, keyboard daemons).

## Phase 2 adapter: `acture-state-redux`

Per research-3 §6 second choice. RTK already runs Immer internally; `createSlice` is the exemplar of typed slices. Adapter pattern: wrap the store; expose typed slice accessors.

## Adapters deferred to v1.x or community

- **Jotai** — atom-by-atom; requires non-trivial atoms ↔ tree bridge. Defer.
- **Valtio** — proxy-to-patch translation is real work. Defer.

## Adapters left to users

- **MobX** — JSON-serializability gap is per-app; provide an authoring guide if asked.
- **Effector** — paradigm mismatch; integration recipe instead.
- **XState** — users modeling apps as machines don't need acture's registry, they need a thin discovery surface.

## Case-study lessons (research-3 §7)

1. **Excalidraw's `ActionManager`** is initialized inside a React component — making it unusable outside React. **acture must not repeat this mistake.** The registry must be constructible outside React. Plain `createRegistry()`, not `<ActureProvider>`.
2. **tldraw's Signia** showed niche substrates can adapt cleanly to a 3-method interface; ~20 LOC adapter.
3. **kbar's `<KBarProvider actions={...}>`** is the coupling acture rejects. React Context is for *injecting* a stateful container, not *being* one.
4. **mobx-state-tree's `onPatch`** emits RFC 6902 JSON Patches — same shape as Immer patches. The `Patch` type acture exports MUST be compatible with both. Cross-substrate interop is then trivial.

## What NOT to do

- **Do not put persistence, devtools, or async effects in the adapter.** Those belong in command middleware.
- **Do not couple the registry to React** via the adapter. Adapter is plain TS.
- **Do not generalize patches to "any change-tracking system."** The Patch type is RFC-6902-compatible JSON Patches. Period.
- **Do not require adapters to track `previous` state** if the substrate doesn't natively expose it.

## See also

- `docs/research/acture_research_3 -- State-Management Substrate ...md` — the source
- `acture-command-record-shape` — the `Result<R>` shape's reserved `patches?` field
- `acture-architecture-primer` — where the state model primitive fits
