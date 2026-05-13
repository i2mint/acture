# @acture/migration

Strangler-fig adoption primitives for bringing acture into an existing app without a rewrite.

Four functions, all with sensible defaults:

| Function | Purpose |
| --- | --- |
| `wrapMutation(handler, opts?)` | Wrap an existing function as a command without changing call sites. |
| `actureMiddleware(registry, opts?)` | Redux/RTK middleware: observe dispatched actions and emit matching command events. |
| `chooseImplementation(pick, impls)` | 5-line legacy/modern router. Composes with any feature-flag SDK. |
| `shadowCompare(modern, legacy, opts?)` | Scientist-style A/B with a "modern wins" default. |

Companion skills under `.claude/skills/` walk an agent through the recommended workflow:

```
migration-diagnose → migration-plan → migration-scaffold → migration-wrap → migration-graduate
```

## Install

```bash
pnpm add @acture/migration acture zod
```

## `wrapMutation` — the load-bearing primitive

```ts
import { wrapMutation } from '@acture/migration';
import { registry } from './acture/registry';
import { useTodoStore } from './store';

// Before — existing handler, untouched
// const addTodo = (text: string) => useTodoStore.getState().addTodo(text);

// After — same call signature, plus a command registered with the registry
export const addTodo = wrapMutation(
  (params: { text: string }) => useTodoStore.getState().addTodo(params.text),
  {
    id: 'app.todo.add',
    title: 'Add todo',
    category: 'Todo',
    registry,
    params: z.object({ text: z.string().min(1) }),
  },
);
```

Now `registry.dispatch('app.todo.add', { text: '…' })` works — the palette, MCP, and AI surfaces see the command. Call sites that import `addTodo` keep working unchanged.

## `actureMiddleware` — Redux/RTK store-event interception

```ts
import { configureStore } from '@reduxjs/toolkit';
import { actureMiddleware } from '@acture/migration';
import { registry } from './acture/registry';

export const store = configureStore({
  reducer,
  middleware: (gDM) =>
    gDM().concat(actureMiddleware(registry, {
      onDispatch: (id, params) => {
        // Telemetry sink, devtools hook, audit log — your choice.
      },
    })),
});
```

Watches dispatched actions; when `action.type` matches a registered command id, fires `onDispatch`. The store action itself is NOT re-dispatched. This is store-event interception; DOM-event interception is deferred to v1.1.

## `chooseImplementation` — feature-flag bridge

```ts
import { chooseImplementation } from '@acture/migration';
import { flags } from './flags';

export const submit = chooseImplementation(
  () => (flags.use('new-checkout') ? 'modern' : 'legacy'),
  { legacy: oldSubmit, modern: newSubmit },
);
```

Five lines, no flag-SDK opinion baked in. Pair with LaunchDarkly / Statsig / Unleash / `@vercel/flags` / an env var — whatever the host already has.

## `shadowCompare` — Scientist-style A/B

```ts
import { shadowCompare } from '@acture/migration';

export const search = shadowCompare(
  (q: string) => newSearch(q),     // modern — always returned
  (q: string) => oldSearch(q),     // legacy — run in shadow, logged on divergence
  { sample: 0.1, logTo: telemetry },
);
```

Default behavior is "use new, log if differs" — opposite of `scientist.js`'s "always return old," because acture is an adoption library, not a verification tool.

## Why not `divertHandler`?

Earlier sketches included a `divertHandler(commandId, { legacy, modern, predicate })`. It was dropped because:

1. It re-implements feature flags poorly.
2. The predicate signature couples runtime to sync user code, which fails for async predicates.
3. The name is awkward — "divert" is nginx vocabulary.

`chooseImplementation` is the thin replacement.

## Codemods

Deferred to v1.1 per research-4 §B.1 — runtime first, codemods later, matches the proven RTK / react-codemod sequencing.

See [`.claude/skills/acture-migration-package/SKILL.md`](../../.claude/skills/acture-migration-package/SKILL.md) for the architectural rationale.
