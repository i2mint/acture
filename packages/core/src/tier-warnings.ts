/**
 * Runtime tier warnings — per research-5 §7.3.
 *
 * On first dispatch of an `@experimental` command in a process, emit
 * a once-per-command `console.warn` so the operator notices that an
 * unstable surface is being exercised. Production builds that wire
 * this up should also set `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`
 * once they have validated their experimental surface.
 *
 * Idempotent — wrapping a registry twice returns the same disposer.
 * Calling the returned disposer restores the original `dispatch`.
 *
 * Pattern mirrors `@acture/devtools` `instrumentRegistry`: we mutate
 * one method on the registry. Per `acture-hard-donts` §6, this is
 * permitted because (a) it's opt-in and dev-leaning, (b) it preserves
 * the original signature exactly, (c) the wrapper is identifiable
 * via a WeakMap so callers cannot stack warnings infinitely.
 */

import type { Context, Result } from './types.js';
import type { DispatchOptions, Registry } from './registry.js';

export interface EnableTierWarningsOptions {
  /** Force warnings on or off regardless of env. Default: auto (suppressed
   *  when `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1` is set in process.env). */
  readonly enabled?: boolean;
  /** Custom warn function. Default: `console.warn`. Useful for tests
   *  and for routing warnings to a structured logger. */
  readonly warn?: (message: string) => void;
}

interface Attached {
  readonly dispose: () => void;
  readonly warnedIds: Set<string>;
}

const ATTACHED = new WeakMap<Registry, Attached>();

/**
 * Wrap `registry.dispatch` so the first dispatch of each
 * `@experimental` command emits a one-time `console.warn`.
 *
 * Returns a disposer that restores the original `dispatch` if you
 * need to roll back instrumentation (e.g., between tests).
 */
export function enableTierWarnings(
  registry: Registry,
  options: EnableTierWarningsOptions = {},
): () => void {
  const existing = ATTACHED.get(registry);
  if (existing) return existing.dispose;

  const enabled = options.enabled ?? defaultEnabled();
  if (!enabled) {
    // No-op disposer. Cache it so a second call short-circuits too.
    const noop: Attached = { dispose: () => {}, warnedIds: new Set() };
    ATTACHED.set(registry, noop);
    return noop.dispose;
  }

  const warn = options.warn ?? defaultWarn;
  const warnedIds = new Set<string>();
  const originalDispatch = registry.dispatch.bind(registry);

  (registry as { dispatch: Registry['dispatch'] }).dispatch =
    async function tierWarningDispatch<R>(
      id: string,
      params?: unknown,
      ctx?: Context,
      opts?: DispatchOptions,
    ): Promise<Result<R>> {
      const cmd = registry.get(id);
      if (cmd && cmd.tier === 'experimental' && !warnedIds.has(id)) {
        warnedIds.add(id);
        warn(
          `[acture] dispatched experimental command "${id}". ` +
            'This command may change without semver discipline. ' +
            'Pin the consumer package version to lock the schema. ' +
            'Suppress this warning with ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1.',
        );
      }
      return originalDispatch<R>(id, params, ctx, opts);
    };

  const attached: Attached = {
    warnedIds,
    dispose: () => {
      (registry as { dispatch: Registry['dispatch'] }).dispatch =
        originalDispatch;
      ATTACHED.delete(registry);
    },
  };
  ATTACHED.set(registry, attached);
  return attached.dispose;
}

function defaultEnabled(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.['ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS'] !== '1';
}

function defaultWarn(message: string): void {
  const c = (globalThis as { console?: { warn?: (m: string) => void } }).console;
  c?.warn?.(message);
}
