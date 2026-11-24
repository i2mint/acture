---
name: acture-undo
description: Build an undo/redo consumer surface in a target project — patch-based, observing the state adapter's `setStateWithPatches` calls and grouping by dispatch boundary. Covers the state-library choice (any `PatchCapableAdapter` — zustand-with-immer, RTK, MST), the agent-written vs `acture-undo` package paths, the transaction model with partial-failure semantics, and the host-callback effect lifecycle (`onEffect(effect, { isUndo, isRedo })`). Use when adding undo/redo to a command-dispatch app, or when working ON the `acture-undo` package. Triggers on "undo", "redo", "patches", "immer", "history", "rollback", "rewind", "time-travel", "transaction", "effects", "PatchCapableAdapter".
---

# acture undo — patch-based history over the state adapter

Undo is a **projection of the registry's dispatch loop AND the state adapter's mutations**: every dispatch is a boundary; every `setStateWithPatches` call within it produces inverse patches; one inverse-patch application rolls the whole entry back. Effects (`Result<R>.effects?`) carry their lifecycle through a host callback — acture-undo never decides what an effect MEANS (journal article §3.6 reframed for the v1.x ship).

> **Load `acture-consumer-integration` first.** Undo is a consumer — this skill covers undo specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the tool-library-is-the-user's-choice rule) lives there. Also load `acture-state-adapter` — the `PatchCapableAdapter<S>` interface is what undo consumes.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the state-adapter library (the tool-library choice — the user's)

Undo rests on a `PatchCapableAdapter<S>`. Realistic choices: **zustand + immer** (the documented happy path; `acture-state-zustand` ships it), **Redux Toolkit** (`acture-state-redux` ships it; RTK runs Immer internally), **MobX-State-Tree** (its `onPatch` emits RFC 6902-shaped patches; hand-write the adapter), or a custom adapter over any substrate that produces Immer-shaped patches. **This choice belongs to the project, not to acture.** acture's reference adapters are *adapters*, not *the state library* — the project owns the substrate decision.

### Decision 2 — agent-written vs package-reuse

- **Agent-written** — write the instrument directly into the project from [`docs/hand-written-undo.md`](../../docs/hand-written-undo.md). ~80 lines, owned, zero acture dependency. Adapts wholesale; the doc covers the capture-owner state machine, transactions, the inverse-patch prepend ordering, the empty-capture-no-entry rule, the partial-failure semantics.
- **Package-reuse** — install `acture-undo`. `createUndoHistory(adapter, registry, options?)` returns the full `{ undo, redo, undoEntry, isApplied, canUndo, canRedo, clear, transaction, entries, dispose }` API (`transaction` resolves to the entry it pushed, or null). Cost: a dev dependency to track.

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes (`acture-consumer-integration` §Step 4).

## The contract — what makes undo work

Whatever path is chosen, the project must honour these — they are what makes undo a faithful registry projection, not a parallel system:

- **Every state mutation flows through `adapter.setStateWithPatches`.** Bare `adapter.setState` calls are invisible to undo (no patches, nothing to roll back). The greenfield acceptance criterion (every mutation through a command's `execute`, which calls `setStateWithPatches`) is exactly the discipline that makes undo work. In a strangler-fig adoption, this is the gate: legacy code mutating directly is not undoable until it's migrated.
- **Patches and inverse patches come from the substrate — Immer for zustand/RTK/MST.** `acture-undo` does not produce patches; it observes them. If the substrate doesn't produce Immer-shaped patches, you need a different adapter (or a wrapping `produceWithPatches` call inside the adapter).
- **Multiple `setStateWithPatches` calls within one dispatch become ONE undo entry.** Capture window = one dispatch (or one transaction). Forward patches accumulate in application order; inverse patches accumulate in REVERSE application order (most-recent inverse applied first) — the hand-written reference shows the prepend technique.
- **Empty captures (no mutation, no effect) produce no entry.** A dispatch that returns `{ ok: false }` and didn't mutate state is invisible to undo. An unknown-command attempt is invisible. Undo records mutations, not every dispatch.

## Transactions — the partial-failure decision

`transaction(fn)` groups N dispatches into one entry. The settled semantics (user-confirmed 2026-05-15):

> **Partial stays applied on failure.** If a dispatch inside a transaction throws or returns `ok: false`, prior mutations stay applied; the entry is still pushed for whatever was captured; the caller may then call `undo()` to rewind.

**An undo toast for one action is bound to its entry:** `const entry = await history.transaction(fn)`, then the toast calls `history.undoEntry(entry)`, which undoes it only while it is the last applied (never a later edit; `busy` while another capture is open). Never `history.undo()` or `entries().at(-1)` from a toast. The wiring for `acture/selection` is in acture-undo's README.

This is the predictable choice — it matches acture's errors-as-data discipline, and it keeps the host in control rather than hiding state changes behind a magic rollback. If the host wants atomicity, it checks after each dispatch and undoes explicitly. Nested transactions throw.

## Effects — the host-callback lifecycle

`Result<R>.effects?` is the type-reserved hook for post-mutation side effects (e.g. "send confirmation email"). The settled lifecycle (user-confirmed 2026-05-15) is a **host callback**:

```ts
createUndoHistory(adapter, registry, {
  onEffect: (effect, { isUndo, isRedo }) => {
    if (isUndo)      compensate(effect);
    else if (isRedo) reapply(effect);
    else             fireForward(effect);   // initial apply
  },
});
```

acture-undo NEVER enacts effects itself. It collects them from successful dispatches into the current entry and fires the callback at three lifecycle points: apply (`isUndo: false, isRedo: false`), undo (`isUndo: true, isRedo: false`), redo (`isUndo: false, isRedo: true`). The host decides what an effect MEANS — that an email's compensation is "send unsend", that a network call's redo is "fire again", that some effects undo to no-op. Hard-don't #3 (translate, don't decide) applied inward.

A throwing `onEffect` is swallowed — effect handlers never break dispatch or undo.

## When working ON `acture-undo`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- The package **observes** the registry and the adapter; it does not own state, business logic, or effect semantics (hard-don't #3). Patches come from the substrate; effects come from `Result<R>.effects?`; their meaning is the host's.
- `acture` is the only peer dependency. No state library is pulled in — the package consumes `PatchCapableAdapter<S>` as an interface, not a concrete library.
- The package ships **one** shape: linear undo/redo, transaction grouping, host-callback effects. Branched history, time-travel UI, OT/CRDT collaboration, entry-coalescing policies — each is a separate accelerator and waits for a real named need. Hard-don't #2: no god-package of undo flavours.
- The dispatch-wrap follows the same monkey-patch pattern as `acture-devtools` (`instrumentRegistry`, `enableTierWarnings`) and `acture-telemetry`. Install order is install order; dispose in reverse install order. Document the contract; don't invent a shared middleware-chain primitive in core.

## What NOT to build (wait for a real need)

No branched / time-travel history (linear covers the overwhelming majority). No remote-state undo / OT / CRDT (single-user only). No throttle / coalesce / batch policies (host territory). No automatic transaction rewind on failure (settled the other way). No persistent-to-disk history (the entry shape is already JSON-serializable; rehydration is host policy). YAGNI applied softly.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- [`docs/hand-written-undo.md`](../../docs/hand-written-undo.md) — the ~80-line agent-written equivalent.
- `acture-state-adapter` — the `PatchCapableAdapter<S>` interface this consumes.
- `acture-command-record-shape` — the `Result<R>` shape, including the `patches?` and `effects?` reservations undo relies on.
- `acture-telemetry` — the sibling instrumenter; observes dispatch without recording patches.
- `acture-devtools` — `instrumentRegistry`; same monkey-patch pattern.
- `packages/undo/src/undo.ts` — the tested implementation; a worked example to adapt.
- `docs/command_dispatch_journal_article.md` §3.6 — undo as a multi-surface dispatch consumer.
