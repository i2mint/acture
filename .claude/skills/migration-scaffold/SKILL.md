---
name: migration-scaffold
description: Install acture into an existing app and wire the registry + state adapter without touching legacy code. Use after `migration-plan` and before `migration-wrap`. Triggers on "scaffold acture", "set up the registry", "install acture into this app", "add the migration package". Creates a single `acture/` directory with a registry instance and wraps the existing store as a `StateAdapter`.
---

# migration-scaffold

Stand up acture in an existing host app so commands have something to register against. The legacy app stays untouched — every new file lives in a single `src/acture/` directory (or a path the user prefers).

## Inputs

- `acture-output/plan.md` (from `migration-plan`) — at least the chosen state adapter decision.
- The host app's existing store file path.

## Output

A `src/acture/` directory inside the host app containing:

```
src/acture/
├── registry.ts          # createRegistry() singleton
├── state.ts             # wraps the existing store as a StateAdapter
├── commands/
│   └── index.ts         # barrel for registered commands (populated by migration-wrap)
└── index.ts             # re-exports registry + state
```

Nothing in `src/` outside this directory is modified.

## Steps

### 1. Install packages

```bash
pnpm add acture @acture/migration zod
# State adapter (pick one based on the plan):
pnpm add @acture/state-zustand    # if the host uses zustand
pnpm add @acture/state-redux      # if the host uses RTK
# Wire-up packages — install only what the plan calls for:
pnpm add @acture/palette-react cmdk    # if palette is in scope
pnpm add @acture/hotkeys tinykeys      # if hotkeys are in scope
pnpm add @acture/mcp                   # if MCP is in scope
pnpm add @acture/ai-vercel ai          # if AI tool calling is in scope
```

Use `npm` / `yarn` instead of `pnpm` if the host uses them.

### 2. Create `src/acture/registry.ts`

```ts
import { createRegistry } from 'acture';

export const registry = createRegistry();
```

That's it. No middleware to register — acture's dispatcher already validates params and catches thrown errors as `Result.err`. Don't add middleware unless the plan calls for it.

### 3. Create `src/acture/state.ts`

For zustand:

```ts
import { wrapZustandStore } from '@acture/state-zustand';
import { useTodoStore } from '../store';   // existing host store

export const state = wrapZustandStore(useTodoStore);
```

For RTK:

```ts
import { wrapReduxStore } from '@acture/state-redux';
import { store } from '../store';

export const state = wrapReduxStore(store, {
  select: (root) => root,
  makeReplace: (next) => ({ type: 'acture/setState', payload: next }),
});
```

**Critical:** the wrapper takes the EXISTING store — do not create a parallel one. Sharing the single source of truth is the whole point of the drop-in path.

### 4. Create `src/acture/commands/index.ts`

Empty barrel — populated by `migration-wrap`:

```ts
// Auto-registered command barrel. `migration-wrap` appends to this file.
import '../registry';
```

### 5. Create `src/acture/index.ts`

```ts
export { registry } from './registry';
export { state } from './state';
```

### 6. (Optional) Add `actureMiddleware` for Redux/RTK hosts

If the plan says to observe store events (e.g. for telemetry or to render dispatches in devtools), update the host's `configureStore` call:

```ts
import { actureMiddleware } from '@acture/migration';
import { registry } from './acture/registry';

export const store = configureStore({
  reducer,
  middleware: (gDM) => gDM().concat(actureMiddleware(registry, {
    onDispatch: (id, params) => {
      // Hook your telemetry here. The middleware does NOT re-dispatch;
      // it observes only.
    },
  })),
});
```

Zustand hosts skip this step — use `store.subscribe(...)` directly if you want a similar observation seam.

### 7. Verify

```bash
pnpm typecheck
pnpm build
```

Both must pass. If `pnpm typecheck` fails on imports from `src/acture/`, the path the user picked isn't in the tsconfig `include` — fix that.

### 8. Smoke test

Add and run a one-line smoke test in `src/acture/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { registry } from './registry';

it('registry is empty at scaffold time', () => {
  expect(registry.size()).toBe(0);
});
```

When this passes, scaffold is done.

## Validation

- [ ] `src/acture/registry.ts` exports a `registry`.
- [ ] `src/acture/state.ts` wraps the EXISTING host store (not a new one).
- [ ] No file outside `src/acture/` was modified, except optionally the host store file to add `actureMiddleware`.
- [ ] `pnpm typecheck` is clean.
- [ ] The smoke test passes.

## Hand-off

Now run `migration-wrap` for each Phase A candidate. Wrapping is incremental and reversible.
