/**
 * `acture-undo` — patch-based undo/redo over a `PatchCapableAdapter`.
 *
 * Two dispatch-layer instruments are installed on construction:
 *
 *   1. `adapter.setStateWithPatches` is wrapped to append the
 *      `{ patches, inversePatches }` it produces into a per-capture
 *      buffer.
 *   2. `registry.dispatch` is wrapped to mark capture boundaries (one
 *      capture window per dispatch unless a transaction is open) and to
 *      collect `Result<R>.effects?` from successful dispatches.
 *
 * On dispatch close, the buffer becomes one `UndoEntry`. Calling
 * `undo()` applies the entry's `inversePatches` to roll back; `redo()`
 * applies the forward `patches`. Effects fire through an optional
 * `onEffect(effect, { isUndo, isRedo })` host callback — acture-undo
 * does NOT enact effects itself (translates, doesn't decide; hard-don't
 * #3).
 *
 * Transactions group N dispatches into one undo unit. **Partial-failure
 * semantics:** if a dispatch inside a transaction throws or returns
 * `ok: false`, prior dispatches' mutations stay applied; the entry is
 * still pushed; the caller may then `undo()` if they want to rewind.
 * (Settled with the user 2026-05-15.)
 *
 * Composition: `acture-undo`'s dispatch wrapper plays nicely with
 * `acture-telemetry` and `acture-devtools` — each wraps the dispatch
 * captured at install time; dispose in reverse install order.
 */

import { isPatchCapable } from 'acture';
import type {
  DispatchOptions,
  Effect,
  Patch,
  PatchCapableAdapter,
  Registry,
  Result,
  StateAdapter,
} from 'acture';

/** Resolve `console` defensively — `globalThis.console` may be absent in
 *  some edge runtimes (Workers, embedded). Same pattern as the registry's
 *  listener-error path. */
function warn(message: string, err: unknown): void {
  const c = (globalThis as { console?: { warn?: (...args: unknown[]) => void } }).console;
  c?.warn?.(`[acture-undo] ${message}`, err);
}

/** Context passed to `onEffect`. `isUndo`/`isRedo` are mutually exclusive;
 *  both `false` means a forward dispatch that just landed. */
export interface UndoEffectContext {
  readonly isUndo: boolean;
  readonly isRedo: boolean;
}

export type UndoEffectHandler = (
  effect: Effect,
  ctx: UndoEffectContext,
) => void;

export interface UndoEntry {
  /** Forward patches in application order. `applyPatches(state, patches)`
   *  re-applies the entry. */
  readonly patches: readonly Patch[];
  /** Inverse patches, pre-reversed: `applyPatches(state, inversePatches)`
   *  rolls the entry back in one call. Multiple `setStateWithPatches`
   *  calls within one entry are merged correctly (most-recent inverse
   *  applied first). */
  readonly inversePatches: readonly Patch[];
  /** Effects collected from `Result<R>.effects?` of successful
   *  dispatches in this entry. Opaque to acture-undo — only forwarded
   *  to `onEffect`. */
  readonly effects: readonly Effect[];
}

export interface CreateUndoHistoryOptions {
  /** Maximum entries retained. When exceeded, oldest are dropped.
   *  Default: 100. */
  readonly limit?: number;
  /** Called once per effect at apply (`isUndo: false, isRedo: false`),
   *  undo (`isUndo: true, isRedo: false`), and redo (`isUndo: false,
   *  isRedo: true`). The host decides what an effect MEANS (queue a
   *  network call, fire-and-forget on apply, schedule a compensating
   *  action on undo, …) — acture-undo only routes the lifecycle signal. */
  readonly onEffect?: UndoEffectHandler;
}

export interface UndoHistory {
  /** Roll back the most recent entry. No-op (returns `{ ok: false }`) if
   *  the history is empty or fully undone. */
  undo(): { readonly ok: boolean };
  /** Re-apply the next entry. No-op if at the head. */
  redo(): { readonly ok: boolean };
  canUndo(): boolean;
  canRedo(): boolean;
  /** Drop every entry. The current state is left untouched. */
  clear(): void;
  /** Group N dispatches (and any `adapter.setStateWithPatches` calls
   *  the dispatches make) into one undo entry. The callback runs to
   *  completion or throws; either way one entry is pushed for whatever
   *  was captured (partial-stays-applied semantics). Nested transactions
   *  throw. Resolves to the entry pushed, or `null` when nothing was
   *  captured (then there is nothing to undo): hand it to `undoEntry`. */
  transaction(fn: () => void | Promise<void>): Promise<UndoEntry | null>;
  /** Undo exactly this entry, and only while it is the last one applied:
   *  an undo toast bound to its own action must not undo a later edit
   *  (`not-on-top`) or an earlier one after Cmd/Ctrl+Z took this one
   *  (`already-undone`). */
  undoEntry(entry: UndoEntry): UndoEntryResult;
  /** Whether this entry is applied now (a toast can dismiss itself when
   *  Cmd/Ctrl+Z took its entry). */
  isApplied(entry: UndoEntry): boolean;
  /** Read-only snapshot of the current entries. */
  entries(): readonly UndoEntry[];
  /** Restore the adapter's `setStateWithPatches` and the registry's
   *  `dispatch` to the references captured at install time. Dispose in
   *  reverse install order if other instrumenters wrap this registry. */
  dispose(): void;
}

export type UndoEntryResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-on-top' | 'already-undone' | 'unknown' };

interface CaptureBuffer {
  patches: Patch[];
  inversePatches: Patch[];
  effects: Effect[];
}

/**
 * Build an undo history over `adapter` + `registry`. The registry and
 * adapter must be the actual instances used by command `execute`
 * handlers — acture-undo monkey-patches `setStateWithPatches` and
 * `dispatch` to observe mutations and dispatches. Calling
 * `createUndoHistory` twice on the same pair installs a second wrapper;
 * dispose in reverse install order.
 */
export function createUndoHistory<S>(
  adapter: PatchCapableAdapter<S>,
  registry: Registry,
  options: CreateUndoHistoryOptions = {},
): UndoHistory {
  // The TS type guarantees patch-capability, but a runtime caller may
  // have cast a plain StateAdapter (or omitted the patch fields from a
  // hand-rolled adapter). Without this guard the failure mode is a
  // cryptic `Cannot read properties of undefined (reading 'bind')` on
  // the next line. Surface a useful error instead.
  if (!isPatchCapable(adapter as StateAdapter<S>)) {
    throw new Error(
      'acture-undo: createUndoHistory requires a PatchCapableAdapter ' +
        '(supportsPatches: true, with setStateWithPatches and applyPatches). ' +
        'Use acture-state-zustand (with immer), acture-state-redux, or any ' +
        'adapter that implements PatchCapableAdapter<S>.',
    );
  }

  const limit = options.limit ?? 100;
  const onEffect = options.onEffect;

  let entries: UndoEntry[] = [];
  /** Index of the *next* entry to redo. Equivalently: number of
   *  currently-applied entries. */
  let cursor = 0;

  let buffer: CaptureBuffer | null = null;
  let captureOwner: 'dispatch' | 'transaction' | null = null;

  /* ── adapter.setStateWithPatches wrapper ──────────────────────────── */

  const originalSetStateWithPatches = adapter.setStateWithPatches.bind(adapter);
  (
    adapter as { setStateWithPatches: PatchCapableAdapter<S>['setStateWithPatches'] }
  ).setStateWithPatches = (recipe) => {
    const result = originalSetStateWithPatches(recipe);
    if (buffer) {
      // Forward patches: append (application order across calls).
      buffer.patches = [...buffer.patches, ...result.patches];
      // Inverse patches: PREPEND so the running list is already in
      // reverse-application order. `applyPatches(state, inversePatches)`
      // rolls back call N first, then N-1, ..., then call 1.
      buffer.inversePatches = [...result.inversePatches, ...buffer.inversePatches];
    }
    return result;
  };

  /* ── registry.dispatch wrapper ────────────────────────────────────── */

  const originalDispatch = registry.dispatch.bind(registry);
  (registry as { dispatch: Registry['dispatch'] }).dispatch =
    async function undoDispatch<R>(
      id: string,
      params?: unknown,
      ctx?: Parameters<Registry['dispatch']>[2],
      opts?: DispatchOptions,
    ): Promise<Result<R>> {
      const ownsCapture = captureOwner === null;
      if (ownsCapture) {
        buffer = { patches: [], inversePatches: [], effects: [] };
        captureOwner = 'dispatch';
      }
      try {
        const result = await originalDispatch<R>(id, params, ctx, opts);
        if (buffer && result.ok && result.effects && result.effects.length > 0) {
          buffer.effects = [...buffer.effects, ...result.effects];
        }
        return result;
      } finally {
        if (ownsCapture) {
          closeCapture();
        }
      }
    };

  /* ── capture / entry plumbing ────────────────────────────────────── */

  function closeCapture(): UndoEntry | null {
    const captured = buffer;
    buffer = null;
    captureOwner = null;
    if (!captured) return null;
    // Empty captures don't push an entry — a dispatch that performed no
    // state mutation and emitted no effects is invisible to undo.
    if (captured.patches.length === 0 && captured.effects.length === 0) return null;

    // Starting a new branch discards any pending redo entries.
    if (cursor < entries.length) {
      entries = entries.slice(0, cursor);
    }

    // Fire onEffect for the apply pass before the entry is pushed.
    if (onEffect && captured.effects.length > 0) {
      for (const eff of captured.effects) {
        try {
          onEffect(eff, { isUndo: false, isRedo: false });
        } catch (e) {
          // Effect handlers must never break dispatch. Surface to
          // console so host-side bugs aren't invisible.
          warn('onEffect threw during apply:', e);
        }
      }
    }

    const entry: UndoEntry = Object.freeze({
      patches: captured.patches,
      inversePatches: captured.inversePatches,
      effects: captured.effects,
    });
    entries.push(entry);
    cursor = entries.length;

    if (entries.length > limit) {
      const drop = entries.length - limit;
      entries = entries.slice(drop);
      cursor -= drop;
    }
    return entry;
  }

  /* ── public API ────────────────────────────────────────────────── */

  function undo(): { readonly ok: boolean } {
    if (cursor === 0) return { ok: false };
    cursor -= 1;
    const entry = entries[cursor]!;
    adapter.applyPatches(entry.inversePatches);
    if (onEffect && entry.effects.length > 0) {
      for (const eff of entry.effects) {
        try {
          onEffect(eff, { isUndo: true, isRedo: false });
        } catch (e) {
          warn('onEffect threw during undo:', e);
        }
      }
    }
    return { ok: true };
  }

  function redo(): { readonly ok: boolean } {
    if (cursor === entries.length) return { ok: false };
    const entry = entries[cursor]!;
    adapter.applyPatches(entry.patches);
    if (onEffect && entry.effects.length > 0) {
      for (const eff of entry.effects) {
        try {
          onEffect(eff, { isUndo: false, isRedo: true });
        } catch (e) {
          warn('onEffect threw during redo:', e);
        }
      }
    }
    cursor += 1;
    return { ok: true };
  }

  function canUndo(): boolean {
    return cursor > 0;
  }
  function canRedo(): boolean {
    return cursor < entries.length;
  }

  function clear(): void {
    entries = [];
    cursor = 0;
  }

  async function transaction(fn: () => void | Promise<void>): Promise<UndoEntry | null> {
    if (captureOwner !== null) {
      throw new Error('acture-undo: nested transactions are not supported');
    }
    buffer = { patches: [], inversePatches: [], effects: [] };
    captureOwner = 'transaction';
    let entry: UndoEntry | null = null;
    try {
      await fn();
    } finally {
      entry = closeCapture();
    }
    return entry;
  }

  function undoEntry(entry: UndoEntry): UndoEntryResult {
    const at = entries.indexOf(entry);
    if (at < 0) return { ok: false, reason: 'unknown' };
    if (at >= cursor) return { ok: false, reason: 'already-undone' };
    if (at !== cursor - 1) return { ok: false, reason: 'not-on-top' };
    undo(); // the entry is on top: this cannot be a no-op
    return { ok: true };
  }

  function isApplied(entry: UndoEntry): boolean {
    const at = entries.indexOf(entry);
    return at >= 0 && at < cursor;
  }

  function entriesSnapshot(): readonly UndoEntry[] {
    return entries.slice();
  }

  function dispose(): void {
    (
      adapter as { setStateWithPatches: PatchCapableAdapter<S>['setStateWithPatches'] }
    ).setStateWithPatches = originalSetStateWithPatches;
    (registry as { dispatch: Registry['dispatch'] }).dispatch = originalDispatch;
  }

  return {
    undo,
    redo,
    undoEntry,
    isApplied,
    canUndo,
    canRedo,
    clear,
    transaction,
    entries: entriesSnapshot,
    dispose,
  };
}
