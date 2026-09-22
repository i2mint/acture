# acture-undo

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md). The agent-written equivalent is [`docs/hand-written-undo.md`](../../docs/hand-written-undo.md).

Patch-based undo/redo over a `PatchCapableAdapter` (zustand-with-immer, Redux Toolkit, MST). Builds an undo history by observing the adapter's `setStateWithPatches` calls and grouping them by dispatch boundary. Effects are forwarded to a host callback — acture-undo never decides what an effect MEANS.

## Install

```sh
pnpm add acture-undo
```

`acture-undo` needs a state adapter that implements `PatchCapableAdapter<S>`. The two reference adapters do: `acture-state-zustand` and `acture-state-redux`.

## Use

```ts
import { createUndoHistory } from 'acture-undo';
import { adapter } from './state';
import { registry } from './registry';

const history = createUndoHistory(adapter, registry, {
  limit: 100,
  onEffect: (effect, { isUndo, isRedo }) => {
    if (isUndo)      compensate(effect);   // e.g. send unsend-email
    else if (isRedo) reapply(effect);      // re-fire the original
    else             fireForward(effect);  // first apply
  },
});

await registry.dispatch('app.graph.addNode', { x: 10, y: 20, label: 'A' });
history.canUndo();   // → true
history.undo();      // rolls back the node creation
history.redo();      // re-applies it
```

## Contract

`acture-undo` requires every state mutation flow through `adapter.setStateWithPatches`. Bare `adapter.setState` calls are invisible to undo — they mutate the store but produce no patches, so there is nothing to roll back. The greenfield acceptance criterion (every mutation flows through a command's `execute`, which calls `setStateWithPatches`) is exactly the discipline that makes undo work.

If commands need access to the forward patches in their `Result<R>` (e.g. for telemetry), they can still return them via `ok(value, { patches })`. acture-undo does not depend on that — it captures patches by observing the adapter, not by reading `Result.patches`.

## Transactions

`transaction(fn)` groups N dispatches into one undo entry. Synchronous or async callbacks both work:

```ts
await history.transaction(async () => {
  await registry.dispatch('app.move', { id: 'n1', x: 50, y: 50 });
  await registry.dispatch('app.move', { id: 'n2', x: 80, y: 80 });
});
// One `history.undo()` rolls back both moves.
```

**Partial-failure semantics (settled with the user):** if a dispatch inside a transaction throws or returns `ok: false`, prior mutations stay applied; the entry is still pushed for whatever was captured; the caller may `history.undo()` to rewind. acture-undo does *not* hide failures behind a magic rollback — the host stays in control.

Nested transactions throw — keep them flat.

## Effects

`Result<R>.effects?` is the type-reserved hook for post-mutation side effects. `acture-undo` collects effects from successful dispatches in the current entry's `effects` field and forwards them to your `onEffect(effect, { isUndo, isRedo })` callback at three lifecycle points:

- **Apply** (`isUndo: false, isRedo: false`) — right after the entry is pushed. Use to enact the effect (send the email, queue the network call).
- **Undo** (`isUndo: true, isRedo: false`) — when the entry is rolled back. Use to compensate (send the unsend, cancel the queued call).
- **Redo** (`isUndo: false, isRedo: true`) — when the entry is re-applied. Use to re-fire.

acture-undo never enacts effects itself; it only signals lifecycle. Hard-don't #3 (translate, don't decide).

A throwing `onEffect` is swallowed — effect handlers never break dispatch or undo.

## Composition with other instrumenters

acture-undo wraps both `adapter.setStateWithPatches` and `registry.dispatch`. It follows the same monkey-patch-dispatch pattern as `acture-devtools` (`instrumentRegistry`, `enableTierWarnings`) and `acture-telemetry`. Multiple instrumenters compose at install time, in install order. **Dispose in reverse install order** — disposing an outer wrapper while inner wrappers still reference its captured dispatch will leave dangling wrappers on the registry.

In practice, instrumenters are installed once at host boot and never disposed, so this rarely matters. Tests that install + dispose between cases should respect the reverse-order rule.

## What it does NOT do

- **No remote-state undo.** acture-undo rolls back local state via inverse patches. Remote actions are effects — handle them via `onEffect`.
- **No operational-transform / CRDT merge.** Single-user linear undo only. Multi-user collaboration needs a different layer.
- **No time-travel UI.** `history.entries()` exposes the entries read-only; building a UI on top is the host's job.
- **No automatic transaction rewind on failure.** Per the user-settled semantics: partial stays applied, the caller decides whether to undo.

## API

| Member | Description |
| --- | --- |
| `undo()` → `{ ok }` | Roll back the most recent entry. `{ ok: false }` if nothing to undo. |
| `redo()` → `{ ok }` | Re-apply the next entry. `{ ok: false }` if at head. |
| `canUndo()` / `canRedo()` | Booleans. |
| `clear()` | Drop every entry; current state untouched. |
| `transaction(fn)` → `Promise<void>` | Group N dispatches into one entry. Nested transactions throw. |
| `entries()` → `readonly UndoEntry[]` | Read-only snapshot. |
| `dispose()` | Restore the adapter + registry to their install-time references. |

| Option | Default | Meaning |
| --- | --- | --- |
| `limit` | `100` | Max entries retained; oldest dropped when exceeded. |
| `onEffect` | — | `(effect, { isUndo, isRedo }) => void`. Host decides what an effect MEANS. |

## See also

- [`docs/hand-written-undo.md`](../../docs/hand-written-undo.md) — the ~80-line agent-written equivalent.
- `acture-state-zustand` / `acture-state-redux` — the two reference `PatchCapableAdapter` implementations.
- `acture-telemetry` — the sibling instrumenter; observes dispatch without recording patches.
- `acture-devtools` — `instrumentRegistry` (in-memory dispatch log); same monkey-patch pattern.
- [`acture-undo`](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-undo/SKILL.md) consumer skill.
