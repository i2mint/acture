# The hand-written selection command — a reproducible reference

**Status:** reference artifact, like [`hand-written-registry.md`](hand-written-registry.md) and [`hand-written-undo.md`](hand-written-undo.md). A project can have bulk actions with **no `acture` import** by owning the code below; `acture/selection` (in the `acture` package, `packages/core/src/selection.ts`) is the tested version to install instead. Read [`positioning.md`](positioning.md) first.

## What it is for

A **bulk action** (batch action, selection action) applies one action to a selection. Every app with a list writes one, and the independent reviews of eight adoptions in the fleet kept finding the same defects: Undo that overwrote later edits, a half-failed loop that left items changed with no Undo, a count that changed between the click and the run, and actions applied to items the list no longer showed. The contract below makes those hard to write.

## The contract

| Part | What it does |
| --- | --- |
| `Selection` | `{kind: 'ids', ids}` or `{kind: 'query', query, include?, exclude?, expectedCount?}`. A query selection is evaluated when used; `expectedCount` is what the person saw when they chose "all matching". |
| `reversal` | Declared per action, in undo-toast's words: `deferred`, `compensating` (one Undo takes it all back in place), `manual` (recoverable by hand only: not reversible), `none`. |
| `appliesTo(item, params)` | The gate: `true`, or `false` / a reason. Evaluated before anything runs, so "3 are not yours" is shown before the click. |
| `run(targets, params)` | Returns `{done, failed, undo}`: the items changed, the ones that failed with why, and **one** Undo for exactly `done`. |
| `liftToSelection(itemAction)` | Runs a per-item action over the targets; each item returns its own undo; the composite Undo runs them last first, and each once even when called again (an Undo that failed half-way is finished by calling it again). |
| The ask-first rule | Confirm with the count unless one Undo takes the whole operation back in place (`compensating`, `deferred`); `manual` asks above one item; `none` always asks. A query that now matches a different number than `expectedCount`, or targets the list does not show, always ask. |
| Commands | Each action is a command whose params are the action's own plus `selection?` (default: the current one) and `confirmed?`. Without `confirmed`, a command that needs a yes returns `needs-confirmation` with the question; an AI asks the person and calls again. One runs at a time (`busy`). |

## The code (about 90 lines; adapt freely)

```ts
type Id = string;
type Selection<Q> =
  | { kind: 'ids'; ids: Id[] }
  | { kind: 'query'; query: Q; include?: Id[]; exclude?: Id[]; expectedCount?: number };
type Reversal = 'deferred' | 'compensating' | 'manual' | 'none';

interface RunOutcome<T> { done: T[]; failed?: { item: T; error: string }[]; undo?: (() => unknown) | null }

interface SelectionAction<T, P> {
  id: string;
  reversal: Reversal;
  verb(n: number, p: P): string;            // "Move 3 songs to Trash"
  done(n: number, p: P): string;            // "3 songs moved to Trash"
  appliesTo?(item: T, p: P): boolean | string;
  run(targets: T[], p: P): Promise<RunOutcome<T>>;
}

/** One Undo over many: last first; each part once, so calling it again finishes a failed Undo. */
function composeUndo(undos: (() => unknown)[]) {
  const pending = new Set(undos.keys());
  return async () => {
    const errors: unknown[] = [];
    for (let i = undos.length - 1; i >= 0; i--) {
      if (!pending.has(i)) continue;
      try { await undos[i](); pending.delete(i); } catch (e) { errors.push(e); }
    }
    if (errors.length) throw new AggregateError(errors, 'Undo failed for some items; call it again.');
  };
}

function liftToSelection<T, P>(a: Omit<SelectionAction<T, P>, 'run'> & {
  runItem(item: T, p: P): Promise<(() => unknown) | null>;
}): SelectionAction<T, P> {
  return {
    ...a,
    async run(targets, p) {
      const done: T[] = [], failed: { item: T; error: string }[] = [], undos: (() => unknown)[] = [];
      let undoable = true;
      for (const item of targets) {
        try {
          const undo = await a.runItem(item, p);
          done.push(item);
          if (undo) undos.push(undo); else undoable = false;
        } catch (e) { failed.push({ item, error: e instanceof Error ? e.message : String(e) }); }
      }
      return { done, failed, undo: undoable && done.length ? composeUndo(undos) : null };
    },
  };
}

async function planSelection<T, P, Q>(
  action: SelectionAction<T, P>, p: P, sel: Selection<Q>,
  { resolve, key = (t: any) => t.id, shown, offer }: {
    resolve(sel: Selection<Q>): Promise<{ items: T[]; matched?: number }>;
    key?(t: T): Id; shown?(): Id[];
    offer?(o: { message: string; undo: () => Promise<void> }): void;
  },
) {
  const { items, matched } = await resolve(sel);
  const targets = items.filter((t) => (action.appliesTo?.(t, p) ?? true) === true);
  const refused = items.filter((t) => !targets.includes(t))
    .map((t) => ({ item: t, why: String(action.appliesTo?.(t, p) || 'does not apply') }));
  const visible = shown && new Set(shown());
  const hidden = visible ? targets.filter((t) => !visible.has(key(t))).length : 0;
  const n = targets.length, verb = action.verb(n, p);
  const drift = sel.kind === 'query' && sel.expectedCount !== undefined && matched !== undefined
    && matched !== sel.expectedCount;
  const asks = action.reversal === 'none' || (action.reversal === 'manual' && n > 1) || drift || hidden > 0;
  const go = async () => {
    const out = await action.run(targets, p);
    if (out.undo && out.done.length) {
      const undo = out.undo;
      offer?.({ message: action.done(out.done.length, p), undo: async () => { await undo(); } });
    }
    return out;
  };
  return { targets, refused, hidden, confirm: n && asks ? `${verb}?` : null, go };
}
```

Wire the result to the UI: show `refused` next to the action button ("3 are not yours"), the confirmation when `confirm` is set (its button is the verb with the count, never "OK"), and call `go()`. Project each action as a command whose `execute` calls `planSelection`, returns `err('needs-confirmation', confirm)` unless `params.confirmed`, and otherwise runs `go()`.

## Plugging in the rest of the fleet

- **undo-toast** decides the surface: `policy: ({ reversal, count, verb }) => { const a = advise({ reversal, count, verb }); return a.surface === 'confirm' ? { question: \`${verb}?\`, confirmLabel: a.confirmLabel ?? verb, typeToConfirm: a.typeToConfirm } : null; }`, and offers the Undo: `offer: ({ message, undo, count, reversal }) => offerUndo({ message, undo, context: { reversal, count } })`.
- **acture-undo**: when the action changes local state through a patch-capable adapter, pass `transaction: (fn) => history.transaction(fn)` so the whole run is one entry on Cmd/Ctrl+Z too.
- **zodal**: `Selection` is the design's `@zodal/core` type; `resolve` is `resolveSelection` over the rows (or a server query when the store can run one).

## What makes Undo safe (the review findings)

1. **Compare-and-set, not a blind write-back.** Record what the action left (a version, an `updated_at`, the value it set) and restore only items still in that state; report the rest.
2. **Partial failure keeps its Undo.** Fill the undo record as the action goes, and make Undo idempotent.
3. **Act on what is shown**, or say how many hidden items are included (the `hidden` count and its confirmation).
4. **Confirm what Undo cannot take back**, even inside an otherwise undoable action (stopping a running job before trashing it).
