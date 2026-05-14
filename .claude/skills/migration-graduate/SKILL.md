---
name: migration-graduate
description: Retire `wrapMutation` calls once the legacy handler is no longer needed — collapse the wrapper into the command's execute, or delete the wrapper and let the command be authored directly with `defineCommand`. The final step in the strangler-fig metaphor — "let the host die." Use after `migration-wrap` when the wrapped commands have been in use for a while and the legacy call sites have been deleted or rerouted. Triggers on "graduate", "retire wrapMutation", "remove the wrapper", "promote to defineCommand", "strangler-fig endgame".
---

# migration-graduate

Once a wrapped command's legacy handler has no remaining call sites, the wrapper has done its job. Graduation either:

- **Inlines the handler** into a direct `defineCommand` (the legacy function disappears, its body lives inside the command's `execute`), OR
- **Deletes the wrapper file** while keeping the legacy function as the sole call surface (rare — only when the command surface turned out not to need this candidate).

The first form is the common case and the one this skill covers in detail.

**Hard rule:** before graduating, verify the legacy handler has zero remaining callers. If anything still calls it, graduation is premature — the wrapper is still load-bearing.

## Inputs

- The wrapped command files in `src/acture/commands/`.
- The legacy source where the wrapped handler lives.
- Read access to the whole codebase (to grep for remaining callers).

## Output

For each graduated command:

- The wrapper file becomes a direct `defineCommand` — `wrapMutation` is no longer imported there.
- The legacy handler is either deleted (most common) or kept as a tiny adapter the command's execute calls.
- All tests still pass.

## Finding graduation candidates with ESLint

`eslint-plugin-acture-migration` ships the `acture/no-stale-wrap-mutation` rule, which flags `wrapMutation(...)` calls whose result is never used — a strong single-file signal that the wrapper has graduated. Enable it during a migration and the lint warnings become your graduation backlog:

```js
// eslint.config.js
import acture from 'eslint-plugin-acture-migration';
export default [{ plugins: { acture }, rules: { 'acture/no-stale-wrap-mutation': 'warn' } }];
```

The rule is conservative (it stays quiet on exported or still-referenced bindings), so a clean lint run does not prove every wrapper has graduated — but every warning is a real candidate. Step 1 below is the cross-file verification the rule cannot do.

## Steps

### 1. Pick a wrapped command to graduate

Scan `src/acture/commands/` for files using `wrapMutation`. For each, run:

```bash
rg "addTodo\(" src/ --type ts --type tsx -l
```

(replacing `addTodo` with the legacy function name). If the only matches are inside `src/acture/commands/` and inside the legacy source file itself, the legacy function has no external callers. Graduate it.

If you find external callers, **stop**. The wrapper is still earning its keep. Note the file in `acture-output/graduate-skipped.md` with the reason.

### 2. Decide: inline or stash

**Inline (default):** the legacy function body moves into the command's `execute`. The legacy file loses the function entirely.

**Stash:** the legacy function stays as a private helper called by the command's `execute`. Use this when:
- The function is large and inlining hurts readability.
- The function is reused inside the legacy file by other internal code that is itself slated for graduation later.

### 3. Rewrite the wrapper file as a direct `defineCommand`

Before (wrapped):

```ts
import { wrapMutation } from 'acture-migration';
import { registry } from '../../registry';
import { useTodoStore } from '../../../store';

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

After (graduated, inline):

```ts
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { registry } from '../../registry';
import { useTodoStore } from '../../../store';

export const addTodo = defineCommand({
  id: 'app.todo.add',
  title: 'Add todo',
  category: 'Todo',
  params: z.object({ text: z.string().min(1) }),
  execute: ({ text }) => {
    // Body moved here from src/store.ts's addTodo.
    const id = crypto.randomUUID();
    useTodoStore.setState((s) => ({
      ...s,
      todos: [...s.todos, { id, text, done: false }],
    }));
    return ok({ id, text });
  },
});

registry.register(addTodo);
```

After (graduated, stashed):

```ts
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { registry } from '../../registry';
import { addTodoCore } from '../../../store';      // still exported

export const addTodo = defineCommand({
  id: 'app.todo.add',
  title: 'Add todo',
  category: 'Todo',
  params: z.object({ text: z.string().min(1) }),
  execute: ({ text }) => ok(addTodoCore(text)),
});

registry.register(addTodo);
```

### 4. Remove the legacy function (inline path)

Delete the `addTodo` method from the legacy store. If the store has other actions that used it, those callers were already either rerouted or are themselves about to graduate — confirm before deleting.

Run the typechecker — it will pinpoint any stragglers immediately.

### 5. Adjust imports

The legacy handler is no longer exported. Any test or other consumer that imported it must now import the wrapped command (or do its own equivalent). The typechecker tells you where.

### 6. Run the tests

```bash
pnpm test
pnpm typecheck
```

Both must pass. If a test was exercising the legacy function directly, rewrite it to dispatch via the registry — `registry.dispatch('app.todo.add', {...})`.

### 7. Repeat or stop

Graduate one command per commit. Resist the temptation to graduate a batch — bisecting a regression later is easier when each graduation is its own commit.

## When to leave a wrapper in place permanently

Not every wrap needs to be graduated. The wrapper is still useful when:

- The legacy function is itself a stable, well-tested API (e.g. a vendored SDK call) that has many internal call sites you don't control.
- The function is called from non-React contexts (web workers, service workers) where threading the command registry would add complexity.
- The wrapper's `onDispatch` is wiring telemetry the host wants regardless of where the call originates.

In those cases, document the decision in a comment on the wrapper file:

```ts
// Kept as wrapMutation: this is the canonical entry for the legacy auth
// SDK, which is also imported by the service worker. Graduating would
// duplicate the body.
```

## Validation

- [ ] Every graduated command file imports `defineCommand` from `acture`, not `wrapMutation` from `acture-migration`.
- [ ] The legacy function has no remaining callers (verified by grep).
- [ ] `pnpm test` and `pnpm typecheck` pass.
- [ ] Any tests that previously called the legacy function now dispatch via the registry.

## Hand-off

When Phase A graduations are complete, the `acture-migration` import in the acture barrel is much thinner. Wrapped command counts drop; first-class `defineCommand` counts rise. Run `migration-diagnose` again periodically to find new candidates as the app grows.
