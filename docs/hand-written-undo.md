# The hand-written undo history — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise *true in the code* for the undo consumer surface: a developer can
build patch-based undo with **zero `acture-*` dependency** by hand-writing
the instrument, following this reference.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. The
short version: `acture-undo` (the npm package) is an *optional accelerator*.
The dispatch-wrap, the adapter-wrap, the entry shape, transactions, and
effect lifecycle — all of it can be code the target project *owns
outright*. This doc is the legible reference an agent adapts;
`packages/undo/src/` is the tested implementation an agent installs
instead, if the team chooses to.

The doc has the same status, structure, and faithfulness commitment as
[`docs/hand-written-registry.md`](hand-written-registry.md),
[`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md),
and [`docs/hand-written-telemetry.md`](hand-written-telemetry.md).

---

## When to hand-write vs. install `acture-undo`

| | Hand-write (this doc) | `pnpm add acture-undo` |
| --- | --- | --- |
| Dependency added | none | one (`acture` is a peer; the state adapter is already in the project) |
| Code the team owns | ~80 lines, in their repo | the import surface |
| Patches | host's existing `PatchCapableAdapter` produces them | same — adapter is the only thing the package consumes |
| Transactions | hand-write the capture-owner state machine | included |
| Effects (onEffect lifecycle) | hand-write the three call sites | included |
| Limit / drop-oldest | one line in your push | included |
| Maintenance | the team's | acture's |

Hand-writing is the right call when the project wants the *mechanism* without
the *dependency* — a small command set, a single-flavored undo (no
transactions / no effects), or a team that prefers to own every line.
Installing `acture-undo` is the right call when the team wants the tested
behaviour (transaction-vs-dispatch capture ownership, partial-failure
semantics, defensive try/catch, multi-call inverse-patch ordering) without
re-deriving it. **It is a per-project trade, made deliberately — never a
default.**

The two paths are compatible: a project can hand-write today and swap in
`acture-undo` later (or vice versa). The shapes below are deliberately the
same shapes `acture-undo` exports, so the migration is mechanical.

---

## The minimal undo history

This is a complete, self-contained undo/redo instrument. Copy it into the
target project (e.g. `src/undo.ts`), adapt the names, delete what the
project doesn't need. It has **no dependencies** beyond `acture`'s types
(and even those can be locally typed if the project hand-wrote the registry
and adapter).

```ts
import type {
  Effect, Patch, PatchCapableAdapter, Registry, Result,
} from 'acture';

export interface UndoEntry {
  readonly patches: readonly Patch[];          // apply order
  readonly inversePatches: readonly Patch[];   // pre-reversed
  readonly effects: readonly Effect[];
}

export type UndoEffectHandler = (
  effect: Effect,
  ctx: { isUndo: boolean; isRedo: boolean },
) => void;

export function createUndoHistory<S>(
  adapter: PatchCapableAdapter<S>,
  registry: Registry,
  options: { limit?: number; onEffect?: UndoEffectHandler } = {},
) {
  // The TS signature guarantees patch-capability, but a runtime caller
  // could bypass it with a cast. Fail loud and informative instead of
  // crashing one frame deeper on `adapter.setStateWithPatches.bind`.
  // (acture-undo ships the same guard; mirror it here.)
  if (!('supportsPatches' in adapter) || (adapter as { supportsPatches: unknown }).supportsPatches !== true) {
    throw new Error(
      'createUndoHistory requires a PatchCapableAdapter ' +
        '(supportsPatches: true, with setStateWithPatches and applyPatches).',
    );
  }

  const limit = options.limit ?? 100;
  const onEffect = options.onEffect;
  let entries: UndoEntry[] = [];
  let cursor = 0;  // entries[0..cursor) are applied

  let buffer: { patches: Patch[]; inversePatches: Patch[]; effects: Effect[] } | null = null;
  let owner: 'dispatch' | 'transaction' | null = null;

  // ── adapter.setStateWithPatches wrapper ────────────────────────────
  const origSet = adapter.setStateWithPatches.bind(adapter);
  (adapter as { setStateWithPatches: typeof adapter.setStateWithPatches }).setStateWithPatches = (recipe) => {
    const r = origSet(recipe);
    if (buffer) {
      buffer.patches = [...buffer.patches, ...r.patches];
      // Inverse: PREPEND. `applyPatches(state, inversePatches)` will
      // roll back call N first, then N-1, ..., then call 1.
      buffer.inversePatches = [...r.inversePatches, ...buffer.inversePatches];
    }
    return r;
  };

  // ── registry.dispatch wrapper ─────────────────────────────────────
  const origDispatch = registry.dispatch.bind(registry);
  (registry as { dispatch: Registry['dispatch'] }).dispatch =
    async function undoDispatch<R>(id, params, ctx, opts) {
      const own = owner === null;
      if (own) { buffer = { patches: [], inversePatches: [], effects: [] }; owner = 'dispatch'; }
      try {
        const result = await origDispatch<R>(id, params, ctx, opts);
        if (buffer && result.ok && result.effects?.length) {
          buffer.effects = [...buffer.effects, ...result.effects];
        }
        return result;
      } finally {
        if (own) close();
      }
    };

  function close(): void {
    const cap = buffer;
    buffer = null;
    owner = null;
    if (!cap) return;
    if (cap.patches.length === 0 && cap.effects.length === 0) return;
    // New branch — discard pending redos.
    if (cursor < entries.length) entries = entries.slice(0, cursor);
    if (onEffect) for (const e of cap.effects) try { onEffect(e, { isUndo: false, isRedo: false }); } catch {}
    entries.push({ patches: cap.patches, inversePatches: cap.inversePatches, effects: cap.effects });
    cursor = entries.length;
    if (entries.length > limit) {
      const drop = entries.length - limit;
      entries = entries.slice(drop);
      cursor -= drop;
    }
  }

  return {
    undo(): { ok: boolean } {
      if (cursor === 0) return { ok: false };
      const e = entries[--cursor]!;
      adapter.applyPatches(e.inversePatches);
      if (onEffect) for (const x of e.effects) try { onEffect(x, { isUndo: true, isRedo: false }); } catch {}
      return { ok: true };
    },
    redo(): { ok: boolean } {
      if (cursor === entries.length) return { ok: false };
      const e = entries[cursor++]!;
      adapter.applyPatches(e.patches);
      if (onEffect) for (const x of e.effects) try { onEffect(x, { isUndo: false, isRedo: true }); } catch {}
      return { ok: true };
    },
    canUndo: () => cursor > 0,
    canRedo: () => cursor < entries.length,
    clear: () => { entries = []; cursor = 0; },
    async transaction(fn: () => void | Promise<void>): Promise<void> {
      if (owner !== null) throw new Error('nested transactions not supported');
      buffer = { patches: [], inversePatches: [], effects: [] };
      owner = 'transaction';
      try { await fn(); } finally { close(); }
    },
    entries: () => entries.slice(),
    dispose: () => {
      (adapter as { setStateWithPatches: typeof adapter.setStateWithPatches }).setStateWithPatches = origSet;
      (registry as { dispatch: Registry['dispatch'] }).dispatch = origDispatch;
    },
  };
}
```

That's the whole instrument. ~80 lines, zero new dependencies, owned by the
project.

---

## Why each piece is shaped this way

These are not stylistic choices — each one defends against a documented
failure mode or pins a settled design decision. Keep them when you adapt.

- **Two wrappers, not one.** The adapter wrapper captures *patches* (the
  raw material for undo). The registry wrapper marks *dispatch
  boundaries* (so multiple patches per dispatch become ONE undo entry,
  not many) and collects *effects* (from `Result<R>.effects?`).
  Capturing only via the adapter would lose dispatch grouping; capturing
  only via the registry would require commands to propagate patches in
  their `Result`, which today's commands don't.

- **`captureOwner` decides who closes the capture.** A dispatch inside a
  transaction does NOT close the capture (the transaction owns it); the
  transaction's `finally` closes. This is what makes
  `transaction(() => { await dispatch(A); await dispatch(B); })` produce
  one undo entry instead of two.

- **Partial-failure semantics: prior mutations stay applied; the entry is
  still pushed.** If a dispatch inside a transaction throws, the
  transaction's `finally` runs `close()`, pushing an entry for whatever
  was captured. The caller can `undo()` to rewind. acture is "errors-as-
  data, no magic rollback"; mid-transaction failure follows that contract.

- **Inverse patches are PREPENDED, not appended.** Multiple
  `setStateWithPatches` calls in one capture window: applying their
  patches in order produces the final state; rolling back requires
  applying inverses in REVERSE order. Prepending each new inverse keeps
  the running list pre-reversed — `applyPatches(state, inversePatches)`
  is one call, no flip-then-apply.

- **An empty capture pushes no entry.** A dispatch that returned
  `{ ok: false }` and made no mutation, or an unknown-command attempt,
  is invisible to undo. The history records *mutations and effects*,
  not *every dispatch*.

- **Starting a new dispatch after an undo discards redos.** Linear
  undo/redo only. A user who undoes three steps and then dispatches a
  new command can no longer redo into the abandoned branch — the
  "redo three steps that were just abandoned" UX is rarely useful and
  the bookkeeping for branched history is substantial. Stay linear.

- **Every `onEffect` call is wrapped in `try`/`catch`.** A throwing
  effect handler must never break dispatch or undo. Swallowed,
  silently.

- **`onEffect` fires on apply, undo, AND redo.** The host has one
  callback that sees the full effect lifecycle; the `{ isUndo, isRedo }`
  context tells it which phase. Effects' MEANING is host territory
  (acture-undo "translates, doesn't decide"); the lifecycle signal is
  uniform.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears in your
project, not for a hypothetical:

- **Branched / time-travel history.** Linear undo/redo covers the
  overwhelming majority of cases. Branched history's bookkeeping
  (graph of states, "current branch" pointer, merge semantics) is
  substantial; build it when a real consumer needs it.

- **Remote-state undo / collaboration.** Single-user only. Multi-user
  collaboration needs OT or CRDT — a different layer.

- **Throttled / batched entry coalescing.** Some apps coalesce rapid
  edits (typing) into one entry; that's an entry-coalescing policy
  the host owns, not a primitive.

- **Persistent history (save to disk).** The entry shape is JSON-
  serializable (Patches are RFC-6902-style); persisting is one
  `JSON.stringify(history.entries())`. Rehydration is not provided —
  it's a host decision how to merge persisted history with current
  state.

---

## Faithfulness note

The shapes here mirror `packages/undo/src/undo.ts` exactly — the
`UndoEntry` fields, the `createUndoHistory(adapter, registry, options)`
signature, the `onEffect` lifecycle calls with `{ isUndo, isRedo }`,
the partial-failure transaction semantics, the inverse-patch prepend
ordering, the empty-capture-no-entry rule. That is intentional: an
agent that hand-writes from this doc and later installs `acture-undo`
finds the migration mechanical. If the package's contract changes,
this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- `packages/undo/src/` — the tested implementation this reference mirrors.
- [`docs/hand-written-registry.md`](hand-written-registry.md), [`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md), [`docs/hand-written-telemetry.md`](hand-written-telemetry.md) — sibling references.
- `acture-undo` consumer skill — the agent's guide to *adding* undo to a target project.
- `acture-state-adapter` skill — the `PatchCapableAdapter` interface this builds on.
