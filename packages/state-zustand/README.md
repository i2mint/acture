# @acture/state-zustand

Phase 1 reference adapter binding [acture](https://npm.im/acture)'s `StateAdapter<S>` interface to [zustand](https://github.com/pmndrs/zustand) + [immer](https://immerjs.github.io/immer/).

Implements `PatchCapableAdapter<S>` — patches produced via `produceWithPatches` so the future `@acture/undo` subsystem has the substrate it needs.

```ts
import { createZustandAdapter } from '@acture/state-zustand';

interface AppState { count: number }

const state = createZustandAdapter<AppState>({ initialState: { count: 0 } });

// Use anywhere acture expects a StateAdapter<S>.
state.setState((s) => { s.count += 1; });           // mutate-the-draft (Immer)
state.setState((s) => ({ ...s, count: s.count + 1 })); // return-a-new-object

// Capture patches for undo:
const { patches, inversePatches } = state.setStateWithPatches((draft) => {
  draft.count = 42;
});
state.applyPatches(inversePatches); // undoes the change
```

To wrap an existing zustand vanilla store instead of building a new one, use `wrapZustandStore(store)`.
