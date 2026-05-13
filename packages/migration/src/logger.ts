/**
 * Minimal logger surface. Compatible with `console`, pino, winston, and
 * any custom shape the host already has — we only call the four
 * standard levels.
 *
 * Default behavior (per `acture-migration-package` skill §"wrapMutation"):
 * console in dev, noop in prod. We detect dev/prod via NODE_ENV at module
 * load time. The host can always pass an explicit `logTo: null` to opt
 * out, or pass their own logger to opt in.
 */

export interface Logger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

const NOOP_LOGGER: Logger = Object.freeze({});

function readNodeEnv(): string | undefined {
  // Avoid `process` references that fail in browser bundlers without a
  // shim — guard via globalThis.
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  return g.process?.env?.NODE_ENV;
}

function readConsole(): Logger {
  const g = globalThis as { console?: Logger };
  return g.console ?? NOOP_LOGGER;
}

/** Resolve the effective logger for a given `logTo` option. */
export function resolveLogger(logTo: Logger | null | undefined): Logger {
  if (logTo === null) return NOOP_LOGGER;
  if (logTo !== undefined) return logTo;
  return readNodeEnv() === 'production' ? NOOP_LOGGER : readConsole();
}
