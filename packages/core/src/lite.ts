/**
 * `acture/lite` — the registry for byte-budgeted pages.
 *
 * Same `Registry` interface and `CommandRecord` shape as the full `acture`
 * entry, minus the two things that dominate its size:
 *
 * - **The when-clause DSL.** `when` is accepted as a function only. A DSL
 *   string is refused at `register` time, unless an `evaluateWhen` is
 *   injected (`createRegistry({ evaluateWhen })`), which then receives
 *   strings and functions alike. Inject acture's own `evaluateWhen` (or one
 *   reading the same DSL): the full registry, `validateCommand` and the
 *   adapters (hotkeys, MCP, AI tools) all read string clauses as acture's
 *   DSL, so a record carrying another syntax would not move between them.
 * - **`defineCommand`'s validation.** Here it only freezes the spec. Run
 *   the full entry's `validateCommand` over the same records in a test or
 *   a dev build to keep the checks without shipping them.
 *
 * Records written for this entry register unchanged in the full registry,
 * so a page upgrades by swapping the import. Size is held by
 * `scripts/size-budget.mjs` (budgets in `size-budget.json`).
 */

import type { CommandRecord } from './types.js';
import {
  createRegistryCore,
  type CreateRegistryOptions,
  type Registry,
  type WhenEvaluator,
} from './registry-core.js';
import { RegistrationError } from './errors.js';

export { DuplicateCommandError, RegistrationError } from './errors.js';
export { ok, err, isOk, isErr } from './result.js';
export type {
  CommandsChangedReason,
  CommandsChangedEvent,
  CommandsChangedListener,
  ListOptions,
  DispatchOptions,
  Registry,
  CreateRegistryOptions,
  WhenEvaluator,
} from './registry-core.js';

/** `acture/lite`'s registry options: the full entry's, plus the evaluator
 *  that lets it take string `when` clauses. */
export interface LiteRegistryOptions extends CreateRegistryOptions {
  /** Evaluates `when` (strings and functions) for `list({ context })` and
   *  `dispatch`. Without it, `when` must be a function. Use acture's DSL
   *  (`import { evaluateWhen } from 'acture'`) so records stay portable. */
  evaluateWhen?: WhenEvaluator;
}
export type {
  CommandRecord,
  AnyCommandRecord,
  Context,
  Result,
  CommandError,
  Patch,
  Effect,
  Tier,
  CommandKind,
  ParamSchema,
  WhenClause,
  DefaultScore,
} from './types.js';

const evaluateFunctionWhen: WhenEvaluator = (when, ctx) =>
  typeof when === 'function' ? Boolean(when(ctx)) : true;

/**
 * Create a command registry whose `when` clauses are functions. Without an
 * injected `evaluateWhen`, registering a record whose `when` is a string
 * throws `RegistrationError`, rather than silently treating it as true.
 */
export function createRegistry(options?: LiteRegistryOptions): Registry {
  if (options?.evaluateWhen) return createRegistryCore(options.evaluateWhen, options);
  return createRegistryCore(evaluateFunctionWhen, options, (cmd) => {
    if (typeof cmd.when === 'string') {
      throw new RegistrationError(
        `${cmd.id}: string when needs evaluateWhen (acture/lite)`,
        cmd.id,
      );
    }
  });
}

/** Freeze a command spec. Unlike the full entry's `defineCommand`, no
 *  validation runs: see `validateCommand` in `acture`. */
export function defineCommand<P, R, const Id extends string = string>(
  spec: CommandRecord<P, R, Id>,
): CommandRecord<P, R, Id> {
  return Object.freeze({ ...spec }) as CommandRecord<P, R, Id>;
}
