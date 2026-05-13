/**
 * Shared public types for acture/core.
 *
 * The CommandRecord shape is the canonical contract — see
 * `docs/v1_plan.md` §4 and the `acture-command-record-shape` skill.
 * The metadata surface is CLOSED; adding fields requires three-caller
 * validation per the rule of three.
 */

import type { ZodType } from 'zod';

/** Execution / availability context. Arbitrary keys; consumers decide
 *  what to put in. The registry passes the same object through to
 *  `execute` and when-clause evaluation. */
export type Context = Record<string, unknown>;

/** API tier. Authoritative source is the JSDoc tag on the defineCommand
 *  call site; Phase 4 mirrors the tag into this field at build time.
 *  Authors normally do NOT write this manually. */
export type Tier = 'stable' | 'experimental' | 'internal' | 'deprecated';

/** Atomic vs. handoff. Auto-derived in palette Phase 2 if omitted. */
export type CommandKind = 'atomic' | 'handoff';

/** RFC 6902-compatible JSON Patch. The shape is intentionally a subset
 *  of Immer's Patch so that cross-substrate interop (Immer, MST) is
 *  trivial. Phase 1 core does NOT consume patches; they are reserved
 *  hooks for `@acture/undo` (post-v1). */
export interface Patch {
  op: 'add' | 'remove' | 'replace';
  path: readonly (string | number)[];
  value?: unknown;
}

/** Reserved hook for post-v1 effect-queue subsystems. Opaque in v1. */
export interface Effect {
  type: string;
  [key: string]: unknown;
}

/** Errors-as-data. Thrown errors inside `execute` are caught by the
 *  dispatcher and converted to `{ ok: false, error: { ... } }`. */
export interface CommandError {
  code: string;
  message: string;
  details?: unknown;
}

/** Discriminated-union result of every dispatch. `patches?` and
 *  `effects?` are reserved post-v1 hooks; v1 core ignores them on
 *  output but preserves them when handlers return them. */
export type Result<R> =
  | { ok: true; value: R; patches?: readonly Patch[]; effects?: readonly Effect[] }
  | { ok: false; error: CommandError };

/** Phase 1 schema authoring layer: Zod. Standard Schema acceptance
 *  comes in Phase 2 (per user direction). The boundary is `ZodType<P>`. */
export type ParamSchema<P> = ZodType<P>;

/** When-clause: DSL string OR function escape hatch. The function form
 *  is flagged "not exposable to AI/MCP" because its body is opaque to
 *  static projection. */
export type WhenClause = string | ((ctx: Context) => boolean);

/** Default score for palette ranking. Number OR a function of context. */
export type DefaultScore = number | ((ctx: Context) => number);

/**
 * The canonical CommandRecord. Closed surface — see
 * `acture-command-record-shape` skill before adding fields.
 *
 * Generic parameters:
 * - `P` — the params type (inferred from the Zod schema).
 * - `R` — the value type of a successful Result.
 */
export interface CommandRecord<P = unknown, R = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly params?: ParamSchema<P>;
  readonly when?: WhenClause;
  readonly keybinding?: string | readonly string[];
  readonly aliases?: readonly string[];
  readonly kind?: CommandKind;
  readonly tier?: Tier;
  /** Free-text reason populated from `@deprecated <reason text>` JSDoc by
   *  the build-step tier mirror. Adapter packages (`@acture/mcp`,
   *  `@acture/ai-vercel`) prepend `[DEPRECATED — <reason>]` to the
   *  description when projecting. `@acture/devtools` surfaces it in the
   *  inspector. (Three callers; closed-surface addition approved.) */
  readonly deprecationReason?: string;
  /** Opt-in token for `@internal` dispatch. The tier-mirror build step
   *  attaches a module-scoped `Symbol('acture.internal')` token when it
   *  marks a command `tier: 'internal'`. Cross-package callers cannot
   *  observe the token (it lives in the registering module's closure),
   *  so `registry.dispatch(id, params, ctx, { internalToken })` throws
   *  when the caller's token does not match. */
  readonly internalToken?: symbol;
  readonly defaultScore?: DefaultScore;
  readonly follow?: readonly string[];
  readonly execute: (params: P, ctx: Context) => Result<R> | Promise<Result<R>>;
}

/** Erased form for storage / iteration. Uses `any` instead of `unknown`
 *  for the type parameters so concrete `CommandRecord<P, R>` records
 *  are bivariant-assignable to this form. `unknown` would make the
 *  type un-assignable from any narrower record (function argument
 *  contravariance). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommandRecord = CommandRecord<any, any>;
