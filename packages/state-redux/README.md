# acture-state-redux

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

Reference state adapter binding [acture](https://npm.im/acture)'s `StateAdapter<S>` to [Redux Toolkit](https://redux-toolkit.js.org/). Implements `PatchCapableAdapter<S>` via Immer (already bundled with RTK).

## Two forms

### 1. Fresh single-slice store (greenfield)

```ts
import { createReduxAdapter } from 'acture-state-redux';

interface AppState { count: number }

const state = createReduxAdapter<AppState>({ initialState: { count: 0 } });

state.setState((s) => { s.count += 1; });
state.setState((s) => ({ ...s, count: 0 }));

const { patches, inversePatches } = state.setStateWithPatches((draft) => {
  draft.count = 42;
});
state.applyPatches(inversePatches);
```

### 2. Wrap an existing RTK store (strangler-fig)

```ts
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { wrapReduxStore } from 'acture-state-redux';

const slice = createSlice({
  name: 'graph',
  initialState: { nodes: {}, edges: {} },
  reducers: {
    replaceFromActure: (_s, action) => action.payload,
  },
});

const store = configureStore({ reducer: { graph: slice.reducer } });

const adapter = wrapReduxStore(store, {
  select: (root) => root.graph,
  makeReplace: (next) => slice.actions.replaceFromActure(next),
});
```

The host keeps its existing reducers, slices, and dispatch surfaces; acture treats one slice as its source of truth.

## The `previous` argument

RTK's `store.subscribe(listener)` calls the listener with **no arguments** (unlike zustand which passes `(next, prev)`). The adapter tracks `previous` itself between callbacks; values are forwarded to acture's `subscribe(listener)` contract. Documented in [`docs/phase-1-reflection.md` §2](../../docs/phase-1-reflection.md).

## What about `serializableCheck`?

`createReduxAdapter` ships with `serializableCheck: false` and `immutableCheck: false` because the adapter's payload IS the next state (already produced by Immer upstream of dispatch). For `wrapReduxStore` you control the store's middleware — keep `serializableCheck` on as long as your `makeReplace` action carries a plain object.

## See also

- [`acture-state-adapter`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-state-adapter/SKILL.md) — the contract
- [`acture-state-zustand`](../state-zustand) — sibling adapter for zustand+immer
