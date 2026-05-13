/**
 * Registry instrumentation for the dispatch log. Wraps a registry's
 * `dispatch` once (idempotently) so every call is captured with
 * timestamp, params, and Result.
 *
 * The wrapper is opt-in: the host calls `instrumentRegistry(registry)`
 * once in a dev build. Production builds skip the call and pay zero
 * runtime cost. The wrapper preserves the original `dispatch` signature.
 *
 * Why this is OK in a devtools-only package: per `acture-hard-donts`
 * §6 (no React coupling in core) we cannot put dispatch interception in
 * acture/core. But a devtools adapter is allowed to mutate the registry
 * locally — the mutation is observable only by the inspector component.
 */

import type {
  AnyCommandRecord,
  Context,
  DispatchOptions,
  Registry,
  Result,
} from 'acture';

export interface DispatchLogEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly commandId: string;
  readonly params: unknown;
  readonly ctx: Context;
  readonly result: Result<unknown>;
  readonly durationMs: number;
  readonly command?: AnyCommandRecord;
}

export interface DispatchLog {
  readonly entries: readonly DispatchLogEntry[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

const ATTACHED = new WeakMap<Registry, MutableLog>();

interface MutableLog extends DispatchLog {
  entries: DispatchLogEntry[];
  listeners: Set<() => void>;
  nextId: number;
}

/**
 * Wrap `registry.dispatch` to record every call in an in-memory log.
 *
 * Idempotent: calling twice on the same registry returns the same log.
 *
 * Capacity: the log keeps the most-recent `maxEntries` entries (default
 * 200) so a long-running session doesn't pin memory.
 */
export function instrumentRegistry(
  registry: Registry,
  options: { maxEntries?: number } = {},
): DispatchLog {
  const existing = ATTACHED.get(registry);
  if (existing) return existing;

  const maxEntries = options.maxEntries ?? 200;
  const log: MutableLog = {
    entries: [],
    listeners: new Set(),
    nextId: 1,
    subscribe(listener) {
      log.listeners.add(listener);
      return () => {
        log.listeners.delete(listener);
      };
    },
    clear() {
      log.entries = [];
      emit(log);
    },
  };

  const originalDispatch = registry.dispatch.bind(registry);

  // Mutate the registry's dispatch. The mutation is local to this
  // package; production builds simply don't call instrumentRegistry.
  (registry as { dispatch: Registry['dispatch'] }).dispatch =
    async function instrumentedDispatch<R>(
      id: string,
      params?: unknown,
      ctx?: Context,
      opts?: DispatchOptions,
    ): Promise<Result<R>> {
      const t0 = now();
      const result = (await originalDispatch<R>(id, params, ctx, opts)) as Result<R>;
      const entry: DispatchLogEntry = {
        id: log.nextId++,
        timestamp: Date.now(),
        commandId: id,
        params,
        ctx: ctx ?? {},
        result,
        durationMs: now() - t0,
        ...(registry.get(id) !== undefined ? { command: registry.get(id) } : {}),
      };
      log.entries.push(entry);
      if (log.entries.length > maxEntries) {
        log.entries.splice(0, log.entries.length - maxEntries);
      }
      emit(log);
      return result;
    };

  ATTACHED.set(registry, log);
  return log;
}

function emit(log: MutableLog): void {
  const snapshot = Array.from(log.listeners);
  for (const l of snapshot) {
    try {
      l();
    } catch {
      // Devtools listener errors must never break dispatch. We swallow
      // silently — the inspector re-renders on the next event.
    }
  }
}

function now(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}
