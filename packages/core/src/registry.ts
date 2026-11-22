/**
 * Command registry: Map<string, CommandRecord> with dispatch,
 * commandsChanged event, owner-scoped disposables, and tier-aware list.
 *
 * This is the full entry's `createRegistry`: the registry core
 * (`./registry-core.ts`) with the when-clause DSL as its evaluator. The
 * byte-budgeted variant is `acture/lite` (`./lite.ts`).
 *
 * The registry is plain TypeScript — ZERO React, ZERO state-library
 * deps. It is constructible outside React (see `acture-state-adapter`
 * skill §"Case-study lessons" for the Excalidraw cautionary tale).
 */

import { createRegistryCore } from './registry-core.js';
import type { CreateRegistryOptions, Registry } from './registry-core.js';
import { evaluateWhen } from './when.js';

export { DuplicateCommandError } from './errors.js';
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

/** Create a command registry whose `when` clauses may be DSL strings or
 *  functions. */
export function createRegistry(options?: CreateRegistryOptions): Registry {
  return createRegistryCore(evaluateWhen, options);
}
