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
 *   whole operation in one step, and still takes back the part that was done when some items
 *   failed;
 * - `planSelection`: resolve, gate, and decide whether to ask first. A bulk action asks, with the
 *   count, unless one Undo takes the whole of it back in place; it always asks when the query now
 *   matches a different number than the person saw, or when some targets are not shown;
 * - `createSelectionCommands`: project the actions as acture commands (palette, hotkeys, AI, MCP)
 *   that run on the current selection, or on a selection passed as a parameter.
 *
 * Seams (each one keyword argument with a default that works): `resolve` (how a selection
 * becomes items; may run the query on a server), `key` (item id, default `item.id`), `shown`
 * (what the list shows now), `policy` (confirm or act-and-offer-Undo, default the rule above;
 * pass undo-toast's `advise` here), `offer` (the undo offer, e.g. undo-toast's `offerUndo`),
 * `transaction` (e.g. acture-undo's `history.transaction`, so local state changes are one undo
 * entry too).
 *
 * The vocabulary of `Reversal` is undo-toast's: `deferred`, `compensating`, `manual`, `none`.
 */

import { z } from 'zod';
import { defineCommand } from './command.js';
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

/**
 * How the action can be taken back (undo-toast's vocabulary).
 * - `deferred`: nothing is committed until the undo window ends.
 * - `compensating`: already done; one Undo applies the inverse of the whole operation in place.
 * - `manual`: recoverable only by hand, item by item, elsewhere. Recoverable is not reversible.
 * - `none`: cannot be taken back (delete permanently, empty trash, a sent email).
 */
export type Reversal = 'deferred' | 'compensating' | 'manual' | 'none';

/** One item the action did not do, and why. */
export interface ItemFailure<T> {
  readonly item: T;
  readonly error: string;
}

/** What `run` did: the items changed, the ones that failed, and one Undo for exactly the former. */
export interface RunOutcome<T> {
  readonly done: readonly T[];
  readonly failed?: readonly ItemFailure<T>[];
  /** Take back what was done, in one step; `null` when it cannot be. Throwing means it failed. */
  readonly undo?: (() => unknown) | null;
}

export interface SelectionAction<T, P = void> {
  /** The command id (`app.domain.action` pattern, e.g. `library.selection.moveToTrash`). */
  readonly id: string;
  /** The palette title. */
  readonly title: string;
  readonly description?: string;
  readonly reversal: Reversal;
  /** The verb with the count, for buttons and confirmations: "Move 3 songs to Trash". */
  verb(count: number, params: P): string;
  /** Past tense, object first, for the undo offer: "3 songs moved to Trash". */
  done(count: number, params: P): string;
  /** The gate: `true` when it applies; `false` or a reason ("not yours") when it does not. */
  appliesTo?(item: T, params: P): boolean | string;
  /** Do it to the targets (already gated). Report failures in `failed`, do not throw for them. */
  run(targets: readonly T[], params: P): Promise<RunOutcome<T>> | RunOutcome<T>;
  /** The action's own parameters, as a Zod object (for the command's params). */
  readonly params?: z.ZodObject;
}

/** What a per-item action does to one item, returning its own undo (or nothing). */
export interface ItemAction<T, P = void> extends Omit<SelectionAction<T, P>, 'run'> {
  runItem(item: T, params: P): Promise<(() => unknown) | null | void> | (() => unknown) | null | void;
}

/* ── liftToSelection ───────────────────────────────────────────────────── */

export interface LiftOptions {
  /** How many items run at once (default 1: in order, so the result does not depend on timing). */
  readonly concurrency?: number;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Turn a per-item action into a selection action. Each item runs on its own; one that throws is
 * reported in `failed` and the others go on. The returned Undo takes back every item that was
 * done, last first, in one step. It is idempotent: an item already taken back is skipped, so
 * after an Undo that failed half-way, calling it again finishes the job.
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
      const slots: ({ undo: (() => unknown) | null } | { error: string } | undefined)[] = new Array(targets.length);
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const i = next++;
          try {
            const undo = await runItem(targets[i] as T, params);
            slots[i] = { undo: typeof undo === 'function' ? undo : null };
          } catch (e) {
            slots[i] = { error: messageOf(e) };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(width, targets.length) }, worker));
      const done: T[] = [];
      const failed: ItemFailure<T>[] = [];
      const undos: (() => unknown)[] = [];
      let undoable = true;
      slots.forEach((slot, i) => {
        const item = targets[i] as T;
        if (!slot || 'error' in slot) {
          failed.push({ item, error: slot ? slot.error : 'not run' });
          return;
        }
        done.push(item);
        if (slot.undo) undos.push(slot.undo);
        else undoable = false;
      });
      return { done, failed, undo: undoable && done.length ? composeUndo(undos) : null };
    },
  };
}

/** One Undo over many: last first; each runs once even when the whole is called again. */
export function composeUndo(undos: readonly (() => unknown)[]): () => Promise<void> {
  const pending = new Set(undos.map((_, i) => i));
  return async () => {
    const errors: unknown[] = [];
    for (let i = undos.length - 1; i >= 0; i--) {
      if (!pending.has(i)) continue;
      try {
        await (undos[i] as () => unknown)();
        pending.delete(i);
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, `Undo failed for ${errors.length} of ${undos.length}; call it again to retry those.`);
    }
  };
}

/* ── Policy: ask first, or act and offer Undo ──────────────────────────── */

/** What a confirmation needs: the question, the button (the verb with the count), and whether to
 *  make the person type the count first. */
export interface Confirmation {
  readonly question: string;
  readonly confirmLabel: string;
  readonly typeToConfirm?: boolean;
}

/** The facts a policy decides on. */
export interface PolicyInput {
  readonly reversal: Reversal;
  readonly count: number;
  /** The verb with the count ("Move 3 songs to Trash"). */
  readonly verb: string;
}

/** `null`: act at once (and offer Undo when there is one). Otherwise ask this first. */
export type ConfirmPolicy = (input: PolicyInput) => Confirmation | null;

/**
 * The fleet's rule. A bulk action asks for confirmation, with the count, unless one Undo takes
 * the whole operation back in place (`compensating`, `deferred`); `manual` asks above one item;
 * `none` always asks.
 */
export const defaultConfirmPolicy: ConfirmPolicy = ({ reversal, count, verb }) => {
  const asks = reversal === 'none' || (reversal === 'manual' && count > 1);
  return asks ? { question: `${verb}?`, confirmLabel: verb, typeToConfirm: false } : null;
};

/* ── planSelection ─────────────────────────────────────────────────────── */

/** What `resolve` returns: the items, and (for a query) how many the query matches now, before
 *  its exceptions. A plain array is accepted too. */
export type Resolved<T> = readonly T[] | { readonly items: readonly T[]; readonly matched?: number };

export interface SelectionSeams<T, Q = SelectionQuery> {
  /** Turn a selection into the items it holds now (may run the query on a server). */
  readonly resolve: (selection: Selection<Q>) => Resolved<T> | Promise<Resolved<T>>;
  /** The item key (default `item.id`). */
  readonly key?: (item: T) => ItemId;
  /** The keys the list shows now; targets outside it make the action ask first. */
  readonly shown?: () => Iterable<ItemId>;
  /** Ask first or act (default {@link defaultConfirmPolicy}). */
  readonly policy?: ConfirmPolicy;
  /** Offer the Undo (an undo toast). Called once per run that did something and can be undone. */
  readonly offer?: (offer: UndoOffer) => void;
  /** Wrap the run (acture-undo's `history.transaction`), so local state changes are one entry. */
  readonly transaction?: (fn: () => Promise<void>) => Promise<void>;
}

export interface UndoOffer {
  /** Past tense, object first: "3 songs moved to Trash". */
  readonly message: string;
  readonly undo: () => Promise<void>;
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
  /** The confirmation to show first, or `null` to go at once. */
  readonly confirm: Confirmation | null;
  /** Run it (after the confirmation, if any). */
  go(): Promise<SelectionOutcome<T>>;
}

export interface SelectionOutcome<T> {
  readonly done: readonly T[];
  readonly failed: readonly ItemFailure<T>[];
  readonly refused: readonly Refusal<T>[];
  /** The one Undo for everything done, or `null`. Already offered through `offer`. */
  readonly undo: (() => Promise<void>) | null;
  /** Run the action again on the items that failed (no confirmation: it was given). */
  retry(): Promise<SelectionOutcome<T>>;
}

const defaultKey = (item: unknown): ItemId => String((item as { id?: unknown }).id);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Resolve the selection, gate it, and decide whether to ask first. Nothing runs until `go()`.
 */
export async function planSelection<T, P, Q = SelectionQuery>(
  action: SelectionAction<T, P>,
  params: P,
  selection: Selection<Q>,
  seams: SelectionSeams<T, Q>,
): Promise<SelectionPlan<T>> {
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
  const hidden = visible ? targets.filter((t) => !visible.has(key(t))).length : 0;
  const n = targets.length;
  const verb = action.verb(n, params);

  // Facts about the selection always ask: the person did not see what will be acted on.
  const reasons: string[] = [];
  if (selection.kind === 'query' && selection.expectedCount !== undefined && matched !== undefined && matched !== selection.expectedCount) {
    reasons.push(`The filter now matches ${matched} (you chose ${selection.expectedCount}).`);
  }
  if (hidden) reasons.push(`${plural(hidden, 'of them is', 'of them are')} not shown now.`);

  let confirm: Confirmation | null = null;
  if (n) {
    const byPolicy = policy({ reversal: action.reversal, count: n, verb });
    if (reasons.length) {
      confirm = {
        question: `${reasons.join(' ')} ${byPolicy?.question ?? `${verb}?`}`,
        confirmLabel: byPolicy?.confirmLabel ?? verb,
        typeToConfirm: byPolicy?.typeToConfirm ?? false,
      };
    } else confirm = byPolicy;
  }

  const run = async (on: readonly T[]): Promise<SelectionOutcome<T>> => {
    if (!on.length) {
      return { done: [], failed: [], refused, undo: null, retry: () => run([]) };
    }
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
    const raw = done.length && outcome.undo ? outcome.undo : null;
    const undo = raw ? async () => { await raw(); } : null;
    if (undo && seams.offer) {
      seams.offer({ message: action.done(done.length, params), undo, count: done.length, reversal: action.reversal });
    }
    return { done, failed, refused, undo, retry: () => run(failed.map((f) => f.item)) };
  };

  return { targets, refused, hidden, confirm, go: () => run(targets) };
}

/* ── Commands ──────────────────────────────────────────────────────────── */

/** A selection as a command parameter (JSON-Schema representable: AI and MCP can pass one). */
export const SelectionSchema = z.union([
  z.object({ kind: z.literal('ids'), ids: z.array(z.string()) }),
  z.object({
    kind: z.literal('query'),
    query: z.record(z.string(), z.unknown()),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    expectedCount: z.number().int().min(0).optional(),
  }),
]);

/** What a selection command returns when it ran. */
export interface SelectionCommandValue {
  readonly done: number;
  readonly failed: number;
  readonly refused: number;
  readonly failures: readonly string[];
}

export interface SelectionCommandSeams<T, Q = SelectionQuery> extends SelectionSeams<T, Q> {
  /** The current selection (what the commands act on when no `selection` param is passed). */
  readonly current: () => Selection<Q>;
  /** Called after a run that did something (e.g. clear the selection if it is still `chosen`). */
  readonly afterRun?: (outcome: SelectionOutcome<T>, chosen: Selection<Q>) => void;
  /** The command category (default `selection`). */
  readonly category?: string;
}

/**
 * The actions as acture commands. Each runs on the current selection (or a `selection` param).
 * One that needs a yes returns `err('needs-confirmation', question)` unless `confirmed: true` is
 * passed, so a palette shows the question and an AI asks the person and calls again. One command
 * runs at a time: a second one while the first is running returns `err('busy')`.
 */
export function createSelectionCommands<T, Q = SelectionQuery>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: readonly SelectionAction<T, any>[],
  seams: SelectionCommandSeams<T, Q>,
): AnyCommandRecord[] {
  let busy = false;
  const { current, afterRun, category = 'selection' } = seams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toCommand = (action: SelectionAction<T, any>): AnyCommandRecord => {
    const base = action.params ?? z.object({});
    const params = base.extend({
      selection: SelectionSchema.optional().describe('The items to act on; the current selection when absent.'),
      confirmed: z.boolean().optional().describe('The person has answered yes to the confirmation question.'),
    });
    return defineCommand({
      id: action.id,
      title: action.title,
      description: `${action.description ?? action.title} Acts on the current selection (or the one passed).`,
      category,
      params,
      async execute(input: Record<string, unknown>): Promise<Result<SelectionCommandValue>> {
        if (busy) return err('busy', 'Another selection action is still running.');
        const { selection: passed, confirmed, ...own } = input;
        const chosen = (passed as Selection<Q> | undefined) ?? current();
        busy = true;
        try {
          const plan = await planSelection(action, own, chosen, seams);
          if (!plan.targets.length) {
            if (!plan.refused.length) return err('empty', 'Nothing is selected.');
            const why = [...new Set(plan.refused.map((r) => r.why))].join('; ');
            return err('nothing-applies', `It applies to none of the ${plan.refused.length} selected (${why}).`);
          }
          if (plan.confirm && !confirmed) {
            return err('needs-confirmation', plan.confirm.question, {
              confirmLabel: plan.confirm.confirmLabel,
              count: plan.targets.length,
              hidden: plan.hidden,
            });
          }
          const outcome = await plan.go();
          if (outcome.done.length) afterRun?.(outcome, chosen);
          return ok({
            done: outcome.done.length,
            failed: outcome.failed.length,
            refused: outcome.refused.length,
            failures: outcome.failed.map((f) => f.error),
          });
        } finally {
          busy = false;
        }
      },
    }) as AnyCommandRecord;
  };
  return actions.map(toCommand);
}
