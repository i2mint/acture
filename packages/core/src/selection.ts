/**
 * `acture/selection` — selection commands: one action applied to a selection of items.
 *
 * A **selection action** (bulk action, batch action) receives a selection, not one item. This
 * module gives it the parts every app with a list hand-rolls, and gets wrong in the same ways:
 *
 * - `Selection`: explicit ids, or a query with included and excluded ids ("all 340 matching,
 *   except these 3"), with `expectedCount` checked when it runs.
 * - a per-item gate, `appliesTo(item)`, evaluated before anything runs, so refusals ("3 are not
 *   yours") are shown before the click;
 * - `liftToSelection`: turn a per-item action into a selection action whose Undo takes back the
 *   whole operation in one step (compare-and-set per item: an item changed since is reported as
 *   a conflict, not overwritten), and still takes back the part that was done when some items
 *   failed;
 * - `planSelection`: resolve, gate, and decide whether to ask first. A bulk action asks, with the
 *   count, unless one Undo takes the whole of it back in place; it always asks when the query now
 *   matches a different number than the person saw (or that cannot be checked), or when targets
 *   are not shown (given `shown`);
 * - `createSelectionCommands`: project the actions as acture commands (palette, hotkeys, AI, MCP)
 *   that run on the current selection, or on a selection passed as a parameter. A confirmation
 *   is a token bound to what was asked: a selection that changed since asks again.
 *
 * Seams (each one keyword argument with a default that works): `resolve` (how a selection
 * becomes items; may run the query on a server), `key` (item id, default `item.id`), `shown`
 * (what the list shows now), `policy` (confirm or act-and-offer-Undo, default the rule above;
 * undo-toast's `advise` plugs in here), `offer` (the undo offer, e.g. undo-toast's `offerUndo`),
 * `transaction` (e.g. acture-undo's `history.transaction`), `lock` (one selection action at a
 * time, shared by buttons and commands), `afterRun` (e.g. clear the selection).
 *
 * The vocabulary of `Reversal` is undo-toast's: `deferred`, `compensating`, `manual`, `none`.
 */

import { z } from 'zod';
import { defineCommand } from './command.js';
import { RegistrationError } from './errors.js';
import { err, ok } from './result.js';
import type { AnyCommandRecord, Result } from './types.js';

/* ── Types ─────────────────────────────────────────────────────────────── */

export type ItemId = string;

/** What a query selection holds: a filter (app-defined, serialisable) and a search string. */
export interface SelectionQuery {
  readonly filter?: unknown;
  readonly search?: string;
}

/**
 * The items an action applies to. `ids`: explicit. `query`: implicit, evaluated when used, plus
 * `include` and `exclude` exceptions; `expectedCount` is the number of matches the person saw
 * when they chose "all matching" (before the exceptions), checked at execution.
 */
export type Selection<Q = SelectionQuery> =
  | { readonly kind: 'ids'; readonly ids: readonly ItemId[] }
  | {
      readonly kind: 'query';
      readonly query: Q;
      readonly include?: readonly ItemId[];
      readonly exclude?: readonly ItemId[];
      readonly expectedCount?: number;
    };

/** Whether two selections hold the same thing (for "clear the selection unless it changed"). */
export function sameSelection<Q>(a: Selection<Q>, b: Selection<Q>): boolean {
  if (a === b) return true;
  return stableJson(a) === stableJson(b);
}

/**
 * How the action can be taken back (undo-toast's vocabulary).
 * - `deferred`: nothing is committed until the undo window ends.
 * - `compensating`: already done; one Undo applies the inverse of the whole operation in place.
 * - `manual`: recoverable only by hand, item by item, elsewhere. Recoverable is not reversible.
 * - `none`: cannot be taken back (delete permanently, empty trash, a sent email).
 */
export type Reversal = 'deferred' | 'compensating' | 'manual' | 'none';

const REVERSAL_STRENGTH: Record<Reversal, number> = { deferred: 3, compensating: 2, manual: 1, none: 0 };

/** The weakest of several reversals (what the whole operation can promise). */
export const weakestReversal = (rs: Iterable<Reversal>, start: Reversal = 'deferred'): Reversal => {
  let out = start;
  for (const r of rs) if (REVERSAL_STRENGTH[r] < REVERSAL_STRENGTH[out]) out = r;
  return out;
};

/** One item the action did not do, and why. */
export interface ItemFailure<T> {
  readonly item: T;
  readonly error: string;
}

/**
 * What an Undo did. `conflicts`: items changed since the action (by the person, another tab, a
 * server), left as they are now rather than overwritten.
 */
export interface UndoReport {
  readonly restored: number;
  readonly conflicts: number;
}

/** What one item's undo returns: nothing (restored), or `'conflict'` when the item is no longer
 *  in the state the action left (compare-and-set refused). Throwing means it failed: try again. */
export type ItemUndoResult = void | 'conflict' | undefined;

/** What `run` did: the items changed, the ones that failed, and one Undo for exactly the former. */
export interface RunOutcome<T> {
  readonly done: readonly T[];
  readonly failed?: readonly ItemFailure<T>[];
  /** Take back what was done, in one step; `null` when it cannot be. Throwing means it failed. */
  readonly undo?: (() => unknown) | null;
  /** Something the person should know (e.g. some items gave no Undo). */
  readonly warnings?: readonly string[];
}

export interface SelectionAction<T, P = void> {
  /** The command id (`app.domain.action` pattern, e.g. `library.selection.moveToTrash`). */
  readonly id: string;
  /** The palette title. */
  readonly title: string;
  readonly description?: string;
  /** How the whole action can be taken back. */
  readonly reversal: Reversal;
  /** Per item, when some items are weaker than the action ("stopping a running job cannot be
   *  undone"): the plan takes the weakest over the targets. */
  reversalOf?(item: T, params: P): Reversal;
  /** Opaque context for the host's policy (an undo-toast preset name or `ActionContext`). */
  readonly policyContext?: unknown;
  /** The verb with the count, for buttons and confirmations: "Move 3 songs to Trash". */
  verb(count: number, params: P): string;
  /** Past tense, object first, for the undo offer: "3 songs moved to Trash". */
  done(count: number, params: P): string;
  /** The gate: `true` when it applies; `false` or a reason ("not yours") when it does not. */
  appliesTo?(item: T, params: P): boolean | string;
  /** Do it to the targets (already gated). Report failures in `failed`, do not throw for them. */
  run(targets: readonly T[], params: P): Promise<RunOutcome<T>> | RunOutcome<T>;
  /** The action's own parameters, as a Zod object (for the command's params). Reserved keys:
   *  `selection`, `confirmed`. */
  readonly params?: z.ZodObject;
}

/** One item's undo: compare-and-set, returning `'conflict'` when the item changed since. */
export type ItemUndo = () => ItemUndoResult | Promise<ItemUndoResult>;

/** What a per-item action does to one item, returning its own undo. */
export interface ItemAction<T, P = void> extends Omit<SelectionAction<T, P>, 'run'> {
  /** Do it to one item. Return its undo (compare-and-set), or `null` when this item cannot be
   *  taken back. Throwing marks the item failed; the others go on. */
  runItem(item: T, params: P): Promise<ItemUndo | null> | ItemUndo | null;
}

/* ── liftToSelection ───────────────────────────────────────────────────── */

export interface LiftOptions {
  /** How many items run at once (default 1: in order). Undo always runs in reverse completion
   *  order, so positional undos stay right; still, keep 1 for positional collections. */
  readonly concurrency?: number;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Turn a per-item action into a selection action. Each item runs on its own; one that throws is
 * reported in `failed` and the others go on. The returned Undo takes back every item that was
 * done, last first, in one step (see {@link composeUndo}). When an item gives no undo, the
 * whole operation offers none, and says so in `warnings`.
 */
export function liftToSelection<T, P = void>(
  action: ItemAction<T, P>,
  { concurrency = 1 }: LiftOptions = {},
): SelectionAction<T, P> {
  const { runItem, ...rest } = action;
  const width = Math.max(1, Math.floor(concurrency));
  return {
    ...rest,
    async run(targets, params) {
      const done: T[] = [];
      const failed: ItemFailure<T>[] = [];
      const undos: ItemUndo[] = []; // in completion order
      let missing = 0;
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const item = targets[next++] as T;
          try {
            const undo = await runItem(item, params);
            done.push(item);
            if (typeof undo === 'function') undos.push(undo);
            else missing++;
          } catch (e) {
            failed.push({ item, error: messageOf(e) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(width, targets.length) }, worker));
      const warnings = missing && done.length
        ? [`${missing} of the ${done.length} changed gave no Undo, so it cannot be undone in one step.`]
        : [];
      return { done, failed, undo: !missing && done.length ? composeUndo(undos) : null, warnings };
    },
  };
}

/**
 * One Undo over many item undos, last first. Each part runs at most once: one that restored or
 * reported a conflict is done; one that threw is tried again when the whole is called again.
 * Two calls at once share one run (a double click does not undo twice).
 */
export function composeUndo(undos: readonly ItemUndo[]): () => Promise<UndoReport> {
  const pending = new Set(undos.map((_, i) => i));
  let restored = 0;
  let conflicts = 0;
  let inFlight: Promise<UndoReport> | null = null;
  const runOnce = async (): Promise<UndoReport> => {
    const errors: unknown[] = [];
    for (let i = undos.length - 1; i >= 0; i--) {
      if (!pending.has(i)) continue;
      try {
        const r = await (undos[i] as ItemUndo)();
        pending.delete(i);
        if (r === 'conflict') conflicts++;
        else restored++;
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, `Undo failed for ${errors.length} of ${undos.length}; call it again to retry those.`);
    }
    return { restored, conflicts };
  };
  return () => {
    if (!inFlight) inFlight = runOnce().finally(() => { inFlight = null; });
    return inFlight;
  };
}

/* ── Policy: ask first, or act and offer Undo ──────────────────────────── */

/** What a confirmation needs: the question, the button (the verb with the count), whether to
 *  make the person type the count first, and whether to still offer Undo after a yes. */
export interface Confirmation {
  readonly question: string;
  readonly confirmLabel: string;
  readonly typeToConfirm?: boolean;
  /** Offer Undo after the person said yes (default true; undo-toast's "never both" is false). */
  readonly thenOffer?: boolean;
}

/** The facts a policy decides on. */
export interface PolicyInput {
  readonly actionId: string;
  /** The weakest reversal over the targets. */
  readonly reversal: Reversal;
  readonly count: number;
  /** The verb with the count ("Move 3 songs to Trash"). */
  readonly verb: string;
  /** Whether an Undo can be offered at all (an `offer` seam is wired). */
  readonly undoAvailable: boolean;
  /** Targets the list does not show now. */
  readonly hidden: number;
  /** The action's `policyContext` (e.g. an undo-toast preset). */
  readonly context?: unknown;
  readonly params: unknown;
}

/** `null`: act at once (and offer Undo when there is one). Otherwise ask this first. */
export type ConfirmPolicy = (input: PolicyInput) => Confirmation | null;

/**
 * The fleet's rule. A bulk action asks for confirmation, with the count, unless one Undo takes
 * the whole operation back in place (`compensating` or `deferred`, and an Undo can be offered);
 * `manual` asks above one item; `none` always asks.
 */
export const defaultConfirmPolicy: ConfirmPolicy = ({ reversal, count, verb, undoAvailable }) => {
  const reversible = reversal === 'deferred' || reversal === 'compensating';
  const asks = reversal === 'none' || (count > 1 && !(reversible && undoAvailable));
  return asks ? { question: `${verb}?`, confirmLabel: verb, typeToConfirm: false } : null;
};

/* ── planSelection ─────────────────────────────────────────────────────── */

/** What `resolve` returns: the items, and (for a query) how many the query matches now, before
 *  its exceptions. A plain array is accepted too (then an `expectedCount` cannot be checked, and
 *  the plan asks). */
export type Resolved<T> = readonly T[] | { readonly items: readonly T[]; readonly matched?: number };

/** One selection action at a time. Share one between buttons and commands. */
export interface SelectionLock {
  /** Run `fn` holding the lock, or return `null` at once when it is taken. */
  run<R>(fn: () => Promise<R>): Promise<R | null>;
  readonly busy: boolean;
}

export function createSelectionLock(): SelectionLock {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(fn) {
      if (busy) return null;
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    },
  };
}

export interface SelectionSeams<T, Q = SelectionQuery> {
  /** Turn a selection into the items it holds now (may run the query on a server). */
  readonly resolve: (selection: Selection<Q>) => Resolved<T> | Promise<Resolved<T>>;
  /** The item key (default `item.id`). */
  readonly key?: (item: T) => ItemId;
  /** The keys the list shows now; targets outside it make the action ask first. Without it,
   *  nothing is known about what is shown. */
  readonly shown?: () => Iterable<ItemId>;
  /** Ask first or act (default {@link defaultConfirmPolicy}). */
  readonly policy?: ConfirmPolicy;
  /** Offer the Undo (an undo toast). Called once per run that did something and can be undone.
   *  Show `UndoReport.conflicts` when the Undo resolves (items left as they are now). */
  readonly offer?: (offer: UndoOffer) => unknown;
  /** Wrap the run, e.g. acture-undo's `history.transaction`, for actions that change local
   *  state through a patch-capable adapter. Then the history entry is the Undo: give
   *  `transactionUndo` (e.g. `() => history.undo()`), and it is what is offered (the action's
   *  own `undo`, if any, is not: they would undo twice). */
  readonly transaction?: (fn: () => Promise<void>) => Promise<void>;
  /** With `transaction`: take back the transaction just recorded. */
  readonly transactionUndo?: () => unknown;
  /** One action at a time (default: none for a plan; the commands create one unless given).
   *  Pass the same `createSelectionLock()` to buttons and commands. Not reentrant. */
  readonly lock?: SelectionLock;
  /** After a run that did something (e.g. clear the selection if it is still `chosen`; see
   *  {@link sameSelection}). Its errors are reported as warnings, never as a failed action. */
  readonly afterRun?: (outcome: SelectionOutcome<T>, chosen: Selection<Q>) => unknown;
}

export interface UndoOffer {
  /** Past tense, object first: "3 songs moved to Trash". */
  readonly message: string;
  readonly undo: () => Promise<UndoReport>;
  readonly count: number;
  readonly reversal: Reversal;
}

export interface Refusal<T> {
  readonly item: T;
  readonly why: string;
}

export interface SelectionPlan<T> {
  /** The items it will act on. */
  readonly targets: readonly T[];
  /** Selected items it does not apply to, and why (shown before the click). */
  readonly refused: readonly Refusal<T>[];
  /** Targets the list does not show now. */
  readonly hidden: number;
  /** The weakest reversal over the targets. */
  readonly reversal: Reversal;
  /** The confirmation to show first, or `null` to go at once. */
  readonly confirm: Confirmation | null;
  /** A short fingerprint of what will be acted on: a confirmation holds it, and a plan made
   *  later with another token has changed since the person said yes. */
  readonly token: string;
  /** Run it (after the confirmation, if any). Resolves `null` when the lock is taken. */
  go(): Promise<SelectionOutcome<T> | null>;
}

export interface SelectionOutcome<T> {
  readonly done: readonly T[];
  readonly failed: readonly ItemFailure<T>[];
  readonly refused: readonly Refusal<T>[];
  /** The one Undo for everything done, or `null`. Already offered through `offer`. */
  readonly undo: (() => Promise<UndoReport>) | null;
  readonly warnings: readonly string[];
  /** Set when nothing ran because what would be acted on changed since the plan (or the
   *  confirmation) was made: plan again and ask again. */
  readonly stale?: string;
  /** Run the action again on the items that failed: resolved and gated again, under the lock;
   *  stale (not run) when it would now need a confirmation it did not need. `null` when the lock
   *  is taken. */
  retry(): Promise<SelectionOutcome<T> | null>;
}

const defaultKey = (item: unknown): ItemId => String((item as { id?: unknown }).id);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}

/** A short, stable hash (FNV-1a, 32 bits, base 36): a fingerprint, not a secret. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Resolve the selection, gate it, and decide whether to ask first. Nothing runs until `go()`.
 */
export async function planSelection<T, P, Q = SelectionQuery>(
  action: SelectionAction<T, P>,
  params: P,
  selection: Selection<Q>,
  seams: SelectionSeams<T, Q>,
): Promise<SelectionPlan<T>> {
  const { key = defaultKey } = seams;
  const plan = await prepare(action, params, selection, seams);
  const chosenKeys = plan.targets.map(key);
  const lockedRun = <R>(fn: () => Promise<R>): Promise<R | null> => (seams.lock ? seams.lock.run(fn) : fn());

  /** Under the lock: resolve the same items again, gate again, and run only if nothing changed. */
  const runChecked = (keys: readonly ItemId[], expected: string | null, confirmed: boolean, refusedBefore: readonly Refusal<T>[]) =>
    lockedRun(async (): Promise<SelectionOutcome<T>> => {
      const fresh = await prepare(action, params, { kind: 'ids', ids: keys }, seams);
      const changed = expected !== null ? fresh.token !== expected : !!fresh.confirm;
      if (changed) {
        return {
          done: [], failed: [], refused: fresh.refused, undo: null, warnings: [],
          stale: expected !== null ? 'What would be acted on changed since it was planned.' : 'It now needs a confirmation.',
          retry: () => runChecked(keys, expected, confirmed, refusedBefore),
        };
      }
      const outcome = await execute(action, params, fresh, seams, selection, confirmed);
      const refused = [...refusedBefore, ...fresh.refused];
      return {
        ...outcome,
        refused,
        retry: () => runChecked(outcome.failed.map((f) => key(f.item)), null, confirmed, []),
      };
    });

  return { ...plan, go: () => runChecked(chosenKeys, plan.token, plan.confirm !== null, plan.refused) };
}

interface Prepared<T> extends Omit<SelectionPlan<T>, 'go'> {}

/** Resolve, gate, decide whether to ask, and fingerprint: everything but running. */
async function prepare<T, P, Q>(
  action: SelectionAction<T, P>,
  params: P,
  selection: Selection<Q>,
  seams: SelectionSeams<T, Q>,
): Promise<Prepared<T>> {
  const { resolve, key = defaultKey, shown, policy = defaultConfirmPolicy } = seams;
  const resolved = await resolve(selection);
  const items = Array.isArray(resolved) ? (resolved as readonly T[]) : (resolved as { items: readonly T[] }).items;
  const matched = Array.isArray(resolved) ? undefined : (resolved as { matched?: number }).matched;

  const targets: T[] = [];
  const refused: Refusal<T>[] = [];
  for (const item of items) {
    const verdict = action.appliesTo ? action.appliesTo(item, params) : true;
    if (verdict === true) targets.push(item);
    else refused.push({ item, why: typeof verdict === 'string' ? verdict : 'does not apply' });
  }

  const visible = shown ? new Set(shown()) : null;
  const hiddenKeys = visible ? targets.map(key).filter((k) => !visible.has(k)).sort() : [];
  const hidden = hiddenKeys.length;
  const n = targets.length;
  const verb = action.verb(n, params);
  const reversal = action.reversalOf
    ? weakestReversal(targets.map((t) => action.reversalOf!(t, params)), action.reversal)
    : action.reversal;

  // Facts about the selection always ask: the person did not see what will be acted on.
  const reasons: string[] = [];
  if (selection.kind === 'query' && selection.expectedCount !== undefined) {
    if (matched === undefined) reasons.push(`The filter's matches could not be counted (you chose ${selection.expectedCount}).`);
    else if (matched !== selection.expectedCount) reasons.push(`The filter now matches ${matched} (you chose ${selection.expectedCount}).`);
  }
  if (hidden) reasons.push(`${plural(hidden, 'of them is', 'of them are')} not shown now.`);

  const undoAvailable = !!seams.offer && (!seams.transaction || !!seams.transactionUndo);
  let confirm: Confirmation | null = null;
  if (n) {
    const byPolicy = policy({
      actionId: action.id, reversal, count: n, verb, undoAvailable, hidden,
      context: action.policyContext, params,
    });
    if (reasons.length) {
      confirm = {
        question: `${reasons.join(' ')} ${byPolicy?.question ?? `${verb}?`}`,
        confirmLabel: byPolicy?.confirmLabel ?? verb,
        typeToConfirm: byPolicy?.typeToConfirm ?? false,
        thenOffer: byPolicy?.thenOffer ?? true,
      };
    } else confirm = byPolicy;
  }
  // What the person agrees to: these targets, this weakness, these hidden ones, these params.
  const token = fingerprint(stableJson([action.id, reversal, hiddenKeys, targets.map(key).sort(), stableJson(params)]));
  return { targets, refused, hidden, reversal, confirm, token };
}

/** Each part of an Undo runs once; two calls at once share one run; one that threw can retry. */
function onceUndo(raw: () => unknown, count: number): () => Promise<UndoReport> {
  let result: UndoReport | null = null;
  let inFlight: Promise<UndoReport> | null = null;
  return () => {
    if (result) return Promise.resolve(result);
    if (!inFlight) {
      inFlight = (async () => {
        const r = await raw();
        result = r && typeof r === 'object' && 'restored' in r ? (r as UndoReport) : { restored: count, conflicts: 0 };
        return result;
      })().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

async function execute<T, P, Q>(
  action: SelectionAction<T, P>,
  params: P,
  plan: Prepared<T>,
  seams: SelectionSeams<T, Q>,
  chosen: Selection<Q>,
  confirmed: boolean,
): Promise<SelectionOutcome<T>> {
  const on = plan.targets;
  const noRetry = () => Promise.resolve(null);
  if (!on.length) return { done: [], failed: [], refused: plan.refused, undo: null, warnings: [], retry: noRetry };
  let outcome: RunOutcome<T> = { done: [] };
  const body = async () => {
    try {
      outcome = await action.run(on, params);
    } catch (e) {
      // A run that throws did nothing it can report: every target failed.
      outcome = { done: [], failed: on.map((item) => ({ item, error: messageOf(e) })), undo: null };
    }
  };
  if (seams.transaction) await seams.transaction(body);
  else await body();
  const done = outcome.done;
  const failed = outcome.failed ?? [];
  const warnings = [...(outcome.warnings ?? [])];
  const raw = !done.length ? null : seams.transaction ? seams.transactionUndo ?? null : outcome.undo ?? null;
  const undo = raw ? onceUndo(raw, done.length) : null;
  const reversible = plan.reversal === 'compensating' || plan.reversal === 'deferred';
  if (done.length && reversible && !undo) warnings.push('It cannot be undone in one step.');
  const offerIt = !(confirmed && plan.confirm && plan.confirm.thenOffer === false);
  if (undo && seams.offer && offerIt) {
    try {
      await seams.offer({ message: action.done(done.length, params), undo, count: done.length, reversal: plan.reversal });
    } catch (e) {
      warnings.push(`The Undo could not be offered: ${messageOf(e)}`);
    }
  }
  const result: SelectionOutcome<T> = { done, failed, refused: plan.refused, undo, warnings, retry: noRetry };
  if (done.length && seams.afterRun) {
    try {
      await seams.afterRun(result, chosen);
    } catch (e) {
      warnings.push(`After the action: ${messageOf(e)}`);
    }
  }
  return result;
}

/* ── Commands ──────────────────────────────────────────────────────────── */

/** Error codes a selection command returns (snake_case, like core's). */
export const SELECTION_ERRORS = {
  needsConfirmation: 'needs_confirmation',
  emptySelection: 'empty_selection',
  nothingApplies: 'nothing_applies',
  busy: 'busy',
  declined: 'declined',
  needsPerson: 'needs_person',
} as const;

const RESERVED = ['selection', 'confirmed'] as const;

/** A selection as a command parameter (JSON-Schema representable: AI and MCP can pass one).
 *  `querySchema` validates the query (default: any object). */
export function selectionSchema(querySchema: z.ZodType = z.record(z.string(), z.unknown())) {
  return z.union([
    z.object({ kind: z.literal('ids'), ids: z.array(z.string()) }),
    z.object({
      kind: z.literal('query'),
      query: querySchema,
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
      expectedCount: z.number().int().min(0).optional(),
    }),
  ]);
}

/** What a selection command returns when it ran. */
export interface SelectionCommandValue {
  readonly done: number;
  readonly failed: number;
  readonly refused: number;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export interface SelectionCommandSeams<T, Q = SelectionQuery> extends SelectionSeams<T, Q> {
  /** The current selection (what the commands act on when no `selection` param is passed). */
  readonly current: () => Selection<Q>;
  /** Ask the person directly (a dialog) instead of returning `needs_confirmation`. When set, a
   *  `confirmed` token is not needed and not accepted as a substitute for the dialog. */
  readonly confirm?: (confirmation: Confirmation & { count: number }) => Promise<boolean>;
  /** Validates a query passed as a parameter (default: any object). */
  readonly querySchema?: z.ZodType;
  /** The command category (default `selection`). */
  readonly category?: string;
}

/**
 * The actions as acture commands. Each runs on the current selection (or a `selection` param).
 *
 * A command that needs a yes returns `err('needs_confirmation', question, { token, count, ... })`.
 * Calling it again with `confirmed: <token>` runs it only if the plan is unchanged; otherwise it
 * asks again ("changed since"). The token proves only that: the caller (an AI) is trusted to
 * have shown the person the question. So what cannot be undone (`reversal: 'none'`, or a
 * `typeToConfirm` confirmation) is never confirmed by token: it returns `needs_person` unless a
 * `confirm` seam lets the command ask the person itself (a dialog). A selection passed as a
 * parameter that the person may not have seen (a query without `expectedCount`, or ids when
 * there is no `shown`) always asks. One command runs at a time (the `lock` seam; pass the same
 * lock to buttons).
 */
export function createSelectionCommands<T, Q = SelectionQuery>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: readonly SelectionAction<T, any>[],
  seams: SelectionCommandSeams<T, Q>,
): AnyCommandRecord[] {
  const { current, category = 'selection', confirm: ask, querySchema } = seams;
  const lock = seams.lock ?? createSelectionLock();
  const planSeams: SelectionSeams<T, Q> = { ...seams, lock };
  const selectionParam = selectionSchema(querySchema);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toCommand = (action: SelectionAction<T, any>): AnyCommandRecord => {
    const base = action.params ?? z.object({});
    for (const k of RESERVED) {
      if (k in base.shape) {
        throw new RegistrationError(`SelectionAction(${action.id}).params may not declare "${k}" (reserved).`, action.id);
      }
    }
    const params = base.extend({
      selection: selectionParam.nullable().optional().describe('The items to act on; null or absent: the current selection.'),
      confirmed: z.string().nullable().optional().describe('The token from the needs_confirmation answer, after the person said yes.'),
    });
    return defineCommand({
      id: action.id,
      title: action.title,
      description: `${action.description ?? action.title} Acts on the current selection (or the one passed).`,
      category,
      params,
      async execute(input: Record<string, unknown>): Promise<Result<SelectionCommandValue>> {
        if (lock.busy) return err(SELECTION_ERRORS.busy, 'Another selection action is still running.');
        const { selection: passed, confirmed, ...own } = input;
        const fromParam = passed !== undefined && passed !== null;
        const chosen = fromParam ? (passed as Selection<Q>) : current();
        const plan = await planSelection(action, own, chosen, planSeams);
        if (!plan.targets.length) {
          if (!plan.refused.length) return err(SELECTION_ERRORS.emptySelection, 'Nothing is selected.');
          const why = [...new Set(plan.refused.map((r) => r.why))].join('; ');
          return err(SELECTION_ERRORS.nothingApplies, `It applies to none of the ${plan.refused.length} selected (${why}).`);
        }
        // A selection from a parameter the person may not have seen: a query that does not say how
        // many it expects, or ids when nothing tells what the list shows.
        const unseen = fromParam && (chosen.kind === 'query' ? chosen.expectedCount === undefined : !seams.shown);
        const confirmation = plan.confirm ?? (unseen
          ? { question: `${action.verb(plan.targets.length, own)}?`, confirmLabel: action.verb(plan.targets.length, own), typeToConfirm: false }
          : null);
        if (confirmation) {
          if (ask) {
            if (!(await ask({ ...confirmation, count: plan.targets.length }))) {
              return err(SELECTION_ERRORS.declined, 'The person said no.');
            }
          } else if (plan.reversal === 'none' || confirmation.typeToConfirm) {
            // What cannot be undone is confirmed by the person in the app, never by a token the
            // caller (an AI) could send back by itself.
            return err(SELECTION_ERRORS.needsPerson, `${confirmation.question} Only the person can confirm this, in the app.`, {
              confirmLabel: confirmation.confirmLabel,
              typeToConfirm: confirmation.typeToConfirm ?? false,
              count: plan.targets.length,
              reversal: plan.reversal,
            });
          } else if (confirmed !== plan.token) {
            const changed = typeof confirmed === 'string' && confirmed.length > 0;
            return err(
              SELECTION_ERRORS.needsConfirmation,
              changed ? `The selection changed since you confirmed. ${confirmation.question}` : confirmation.question,
              {
                token: plan.token,
                confirmLabel: confirmation.confirmLabel,
                typeToConfirm: confirmation.typeToConfirm ?? false,
                count: plan.targets.length,
                hidden: plan.hidden,
                reversal: plan.reversal,
              },
            );
          }
        }
        const outcome = await plan.go();
        if (!outcome) return err(SELECTION_ERRORS.busy, 'Another selection action is still running.');
        if (outcome.stale) return err(SELECTION_ERRORS.needsConfirmation, `${outcome.stale} Call it again to see what it would do now.`);
        return ok({
          done: outcome.done.length,
          failed: outcome.failed.length,
          refused: outcome.refused.length,
          failures: outcome.failed.map((f) => f.error),
          warnings: outcome.warnings,
        });
      },
    }) as AnyCommandRecord;
  };
  return actions.map(toCommand);
}
