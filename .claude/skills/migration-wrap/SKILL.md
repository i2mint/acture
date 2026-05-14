---
name: migration-wrap
description: Wrap one or more existing handlers / store actions as acture commands using acture-migration's `wrapMutation`. Use after `migration-scaffold`. Triggers on "wrap this handler", "register as a command", "wrap onClick", "convert this action to a command", "use wrapMutation". The fourth skill in the migration track. Wraps incrementally without touching the legacy call site.
---

# migration-wrap

Wrap an existing function as an acture command using `wrapMutation`. The wrapped function keeps the same signature — call sites do not change. The registry gains a new command that the palette, hotkeys, MCP, and AI tool surfaces can use.

## Inputs

- `acture-output/plan.md` — for the next batch of candidates.
- `src/acture/registry.ts` from `migration-scaffold`.
- The candidate's `currentLocation` (file + line).

## Output

For each wrapped candidate, ONE new file under `src/acture/commands/` plus one barrel update. **No existing file is modified** (the legacy call site keeps importing the original; we add a new wrapped variant alongside).

## Steps

### 1. Pick the next candidate from the plan

Phase A first, ordered by priority then by file. Resist the urge to wrap five at once — wrap one, run the tests, commit, repeat. The strangler-fig metaphor means each tendril stands on its own.

### 2. Read the original implementation

Open the candidate's file at the indicated line. Identify:

- The function signature.
- Whether it reads or writes state.
- Whether it is sync or async.
- Whether it has side effects (API calls, navigation, storage).

If the function takes a React event (e.g. `(e: React.MouseEvent) => void`), the **underlying mutation** is what we wrap — not the event handler. The event handler stays where it is and calls the wrapped mutation.

### 3. Create the wrapping file

Path: `src/acture/commands/{category}/{actionName}.ts`. Lowercase the category, camelCase the action.

For a parameter-less store action:

```ts
import { wrapMutation } from 'acture-migration';
import { registry } from '../../registry';
import { useTodoStore } from '../../../store';

export const clearDone = wrapMutation(
  () => useTodoStore.getState().clearDone(),
  {
    id: 'app.todo.clearDone',
    title: 'Clear done todos',
    category: 'Todo',
    registry,
  },
);
```

For a store action with params:

```ts
import { z } from 'zod';
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
    params: z.object({
      text: z.string().min(1).describe('Todo text'),
    }),
  },
);
```

For a legacy event handler that wraps a mutation:

```ts
// legacy: const onSignOut = () => { authClient.signOut(); router.push('/login'); }
// We wrap the mutation, not the event handler. UI navigation stays in the host.

import { wrapMutation } from 'acture-migration';
import { registry } from '../../registry';
import { authClient } from '../../../auth';

export const signOut = wrapMutation(
  async () => { await authClient.signOut(); },
  {
    id: 'app.auth.signOut',
    title: 'Sign out',
    category: 'Auth',
    registry,
  },
);
```

The host's `onSignOut` can now be:

```ts
const onSignOut = () => { signOut(); router.push('/login'); };
```

— a one-line change, and only if the user wants the call site to benefit from logging / onDispatch. The original handler still works if untouched.

### 4. Register in the barrel

Append to `src/acture/commands/index.ts`:

```ts
import './todo/clearDone';
import './todo/addTodo';
// ...
```

Each wrapping file calls `registry.register` at module load time via `wrapMutation({ registry })`. The barrel just imports it for the side effect.

### 5. Dispatch test

Add or extend `src/acture/commands/wrap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { registry } from '../registry';
import '../commands';                 // side-effecting registration
import { useTodoStore } from '../../store';

describe('wrapped commands', () => {
  it('app.todo.add dispatches and mutates the existing store', async () => {
    const before = useTodoStore.getState().todos.length;
    const result = await registry.dispatch('app.todo.add', { text: 'wrapped' });
    expect(result.ok).toBe(true);
    expect(useTodoStore.getState().todos.length).toBe(before + 1);
  });
});
```

### 6. Repeat for the next candidate

Stop when Phase A is done. Don't drift into Phase B without a plan update — the user wants to see the palette light up with Phase A first.

## Common patterns and gotchas

- **`wrapMutation` returns the wrapped function.** If you ignore the return value, the command is still registered (the registry option does the registration). But export the wrapped function anyway — callers who want logging at the call site can opt in by importing the wrapped version.
- **Don't pass an inline arrow to the original action that re-allocates state.** If the legacy action is `useStore.getState().addTodo`, wrap exactly that, not a closure that rebuilds it. Otherwise the wrapped command may diverge from what the UI dispatches.
- **Async handlers:** `wrapMutation` preserves async-ness. The wrapped function returns the same Promise the original returns. From the registry side, `dispatch` awaits the handler and returns `Result<R>`.
- **Errors:** the wrapped call-site path re-throws (preserving the original behavior). The registry-dispatched path converts thrown errors to `Result.err({ code: 'handler_threw' })` — that's the acture errors-as-data contract.
- **`logTo`:** debug logs fire on every call by default in dev. Set `logTo: null` in tests or in production-noisy commands.

## Validation

- [ ] Each wrapped command lives in its own file under `src/acture/commands/{category}/`.
- [ ] No source file outside `src/acture/` is required to change for the command to appear (legacy UI still works).
- [ ] The barrel `src/acture/commands/index.ts` imports every wrapping file.
- [ ] `registry.dispatch('app.x.y', params)` returns `{ ok: true, ... }` in a test.
- [ ] `pnpm typecheck` is clean.

## Hand-off

After Phase A is wrapped:

- Wire the palette (`acture-palette-react`) — agent skill list will have a `wire-palette` skill (Phase 2-era).
- Wire hotkeys (`acture-hotkeys`) — same.
- Run `migration-graduate` to retire wrappers where the legacy handler is no longer called.
