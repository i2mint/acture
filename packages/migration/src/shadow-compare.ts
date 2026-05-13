/**
 * `shadowCompare` — Scientist-style A/B with a "modern wins" default.
 *
 * Always invokes `modern`. Optionally invokes `legacy` in the shadow
 * (controlled by `sample`) and logs a divergence if the results differ.
 * Errors thrown by `legacy` are caught and logged; they never propagate
 * — the caller sees the `modern` result (or its thrown error).
 *
 * Per `acture-migration-package` skill §"What `shadowCompare` does":
 * default is "use new, log if differs" — opposite of scientist.js's
 * "always return old, log if differs", because acture is an adoption
 * library, not a verification tool.
 *
 * **Async handling:** if either implementation returns a Promise, the
 * wrapper returns a Promise that resolves once `modern` resolves. The
 * `legacy` comparison runs without awaiting from the call site, so the
 * caller is never slowed by the shadow comparison.
 */

import { resolveLogger, type Logger } from './logger.js';

export interface ShadowCompareOptions<R> {
  /** Equality predicate. Default: `Object.is`. */
  compare?: (modern: R, legacy: R) => boolean;
  /** Fraction in [0, 1] of invocations that also run `legacy`. Default 1. */
  sample?: number;
  /** Logger for divergence reports. Default: console in dev, noop in prod. */
  logTo?: Logger | null;
  /** Stable label for log lines. Default: `shadowCompare`. */
  name?: string;
  /** Custom random source — overridable for deterministic tests. */
  rand?: () => number;
}

export function shadowCompare<Args extends unknown[], R>(
  modern: (...args: Args) => R,
  legacy: (...args: Args) => R,
  options: ShadowCompareOptions<Awaited<R>> = {},
): (...args: Args) => R {
  const compare = options.compare ?? (Object.is as (a: Awaited<R>, b: Awaited<R>) => boolean);
  const sample = clamp01(options.sample ?? 1);
  const name = options.name ?? 'shadowCompare';
  const logger = resolveLogger(options.logTo);
  const rand = options.rand ?? Math.random;

  return (...args: Args): R => {
    const modernResult = modern(...args);
    const shouldShadow = sample > 0 && rand() < sample;
    if (!shouldShadow) return modernResult;

    if (isPromise(modernResult)) {
      // Run legacy in a microtask; await both and compare. Do not block
      // the caller on the legacy result.
      const legacyResult = safeCall(() => legacy(...args));
      void Promise.allSettled([
        modernResult as Promise<unknown>,
        ...(isPromise(legacyResult) ? [legacyResult as Promise<unknown>] : [Promise.resolve(legacyResult)]),
      ]).then(([modernSettled, legacySettled]) => {
        compareSettled(name, logger, compare, modernSettled!, legacySettled!);
      });
      return modernResult;
    }

    const legacyResult = safeCall(() => legacy(...args));
    if (legacyResult instanceof LegacyError) {
      logger.warn?.(`[acture/migration:${name}] legacy threw:`, legacyResult.cause);
      return modernResult;
    }
    if (isPromise(legacyResult)) {
      void Promise.resolve(legacyResult).then(
        (v) => {
          if (!compare(modernResult as Awaited<R>, v as Awaited<R>)) {
            logger.warn?.(`[acture/migration:${name}] divergence:`, {
              args,
              modern: modernResult,
              legacy: v,
            });
          }
        },
        (e) => logger.warn?.(`[acture/migration:${name}] legacy rejected:`, e),
      );
      return modernResult;
    }
    if (!compare(modernResult as Awaited<R>, legacyResult as Awaited<R>)) {
      logger.warn?.(`[acture/migration:${name}] divergence:`, {
        args,
        modern: modernResult,
        legacy: legacyResult,
      });
    }
    return modernResult;
  };
}

/* ───────────────────────── internals ──────────────────────────────── */

class LegacyError {
  constructor(public readonly cause: unknown) {}
}

function safeCall<R>(fn: () => R): R | LegacyError {
  try {
    return fn();
  } catch (e) {
    return new LegacyError(e);
  }
}

function compareSettled<R>(
  name: string,
  logger: Logger,
  compare: (m: R, l: R) => boolean,
  modernSettled: PromiseSettledResult<unknown>,
  legacySettled: PromiseSettledResult<unknown>,
): void {
  if (modernSettled.status === 'rejected') {
    // The caller already saw the error; we don't compare further.
    if (legacySettled.status === 'rejected') {
      // Both rejected. Symmetric; no divergence flag, just a debug log.
      logger.debug?.(`[acture/migration:${name}] both rejected`);
      return;
    }
    logger.warn?.(`[acture/migration:${name}] modern rejected but legacy resolved:`, {
      modernReason: (modernSettled as PromiseRejectedResult).reason,
      legacy: (legacySettled as PromiseFulfilledResult<unknown>).value,
    });
    return;
  }
  if (legacySettled.status === 'rejected') {
    logger.warn?.(`[acture/migration:${name}] legacy rejected:`, (legacySettled as PromiseRejectedResult).reason);
    return;
  }
  const m = (modernSettled as PromiseFulfilledResult<unknown>).value as R;
  const l = (legacySettled as PromiseFulfilledResult<unknown>).value as R;
  if (!compare(m, l)) {
    logger.warn?.(`[acture/migration:${name}] divergence:`, {
      modern: m,
      legacy: l,
    });
  }
}

function isPromise(x: unknown): x is Promise<unknown> {
  return (
    x !== null &&
    typeof x === 'object' &&
    typeof (x as { then?: unknown }).then === 'function'
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
