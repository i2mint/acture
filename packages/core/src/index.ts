/**
 * acture/core — public barrel.
 *
 * The three primitives (per `acture-architecture-primer` skill):
 *   1. State model — `StateAdapter<S>` interface (impl in adapters)
 *   2. Command registry — `defineCommand` + `createRegistry`
 *   3. Schema bridge — `toJsonSchema`
 *
 * Phase 1 surface. See `docs/v1_plan.md` §4 for the canonical
 * CommandRecord shape and `docs/implementation_plan.md` §"Phase 1"
 * for what each export commits to.
 */

export {
  defineCommand,
  RegistrationError,
} from './command.js';
export type { CommandSpec } from './command.js';

export {
  createRegistry,
  DuplicateCommandError,
} from './registry.js';
export type {
  Registry,
  CreateRegistryOptions,
  ListOptions,
  CommandsChangedEvent,
  CommandsChangedListener,
  CommandsChangedReason,
} from './registry.js';

export {
  compileWhen,
  evaluateWhen,
  isFunctionWhen,
} from './when.js';
export type { CompiledWhen } from './when.js';

export {
  isPatchCapable,
} from './state-adapter.js';
export type {
  StateAdapter,
  PatchCapableAdapter,
  SelectableAdapter,
} from './state-adapter.js';

export {
  toJsonSchema,
} from './schema-bridge.js';
export type {
  ToJsonSchemaOptions,
  JsonSchemaEnvelope,
} from './schema-bridge.js';

export {
  ok,
  err,
  isOk,
  isErr,
} from './result.js';

export type {
  // Core data shapes
  CommandRecord,
  AnyCommandRecord,
  Context,
  Result,
  CommandError,
  Patch,
  Effect,
  // Enum-shaped fields
  Tier,
  CommandKind,
  // Authoring helpers
  ParamSchema,
  WhenClause,
  DefaultScore,
} from './types.js';

/** Package version. Updated by build step at Phase 4. */
export const __version = '0.1.0-dev' as const;
