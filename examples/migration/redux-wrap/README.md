# Migration worked example — redux-wrap

A small Redux Toolkit (RTK) cart slice with `actureMiddleware` wired in.
The point: store-event interception lets palette and AI surfaces see the
same dispatch stream the UI generates, without bypassing the registry or
duplicating state.

## What this exercises

`actureMiddleware` from `acture-migration` is the store-event half of
the strangler-fig pattern (research-4 §A.5). It does NOT replace
`store.dispatch` — it observes. RTK's auto-generated action types
(`cart/addItem`, `cart/removeItem`, …) are slash-separated, while
acture command ids are dot-separated (`app.cart.addItem`, …). The
middleware's `mapping` option is the seam: a small function translates
one shape into the other, so registry-attached observers (palette
badges, audit trails, devtools) see UI-driven mutations and
palette-driven dispatches as one stream.

## Two paths, one stream

```text
                  ┌─────────────────┐
                  │   RTK store     │  ← single source of truth
                  └────────▲────────┘
                           │
            ┌──────────────┼──────────────┐
            │                              │
   UI path: store.dispatch         Palette path: registry.dispatch
   (typed action object)           (id + params via execute)
            │                              │
            └──────────────┬──────────────┘
                           │
                  ┌────────▼────────┐
                  │ actureMiddleware│   onDispatch fires once per
                  │   (observer)    │   real mutation, regardless of
                  └─────────────────┘   which path drove it
```

## Wiring

```ts
import { actureMiddleware } from 'acture-migration';
import { createCartRegistry, registerCartCommands } from './acture/registry.js';
import { createCartStore } from './store.js';

const registry = createCartRegistry();
const store = createCartStore([
  actureMiddleware(registry, {
    mapping: (action) => {
      const m = /^cart\/([a-zA-Z][\w]*)$/.exec(action.type);
      return m ? { id: `app.cart.${m[1]}`, params: action.payload } : null;
    },
    onDispatch: (id, params) => console.log(id, params),
  }),
]);
registerCartCommands(registry, store);
```

The registry is created empty so the middleware can be bound against
it before the store exists. `registerCartCommands` then closes commands
over the live store, and `registry.has(id)` returns `true` from that
point forward — the middleware starts emitting.

## Running

```bash
pnpm test     # 5 integration tests
pnpm typecheck
```

## Why this is small

The zustand-wrap example exercises the full migration-skill loop
(diagnose → plan → scaffold → wrap → graduate). This example is
deliberately narrower: it closes the documentation gap for
`actureMiddleware` with a focused fixture. If you want the full
strangler-fig narrative, read `examples/migration/zustand-wrap/`.
