/**
 * `wrapMutation` — the load-bearing migration primitive.
 *
 * Wrap an existing function (event handler, store action, API call) so
 * that:
 *
 *   1. The call site is unchanged: the returned function has the same
 *      signature as the original.
 *   2. Every invocation is observable: `onDispatch` fires, `logTo`
 *      receives a debug entry, and (if a registry is provided) the
 *      registry's `commandsChanged` listeners see the event.
 *   3. If a registry is provided, an acture command is registered whose
 *      `execute` calls the same handler. The command becomes visible to
 *      the palette, MCP, and AI surfaces without rewriting the call
 *      site.
 *
 * From acture's perspective there is no "legacy" handler — there is
 * just a handler that we are wrapping. The wrapping IS the migration
 * signal (per `acture-migration-package` skill §"What `wrapMutation`
 * does").
 */

import type { ZodType } from 'zod';
import {
  defineCommand,
  ok,
  err,
  type CommandRecord,
  type Registry,
} from 'acture';
import { resolveLogger, type Logger } from './logger.js';

/** Function-shaped handler we can wrap. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHandler = (...args: any[]) => unknown;

export interface WrapMutationOptions<H extends AnyHandler> {
  /** Command ID. Falls back to `handler.name` mapped to dotted form
   *  (e.g. `addTodo` → `app.wrapped.addTodo`), or an auto-generated
   *  `app.wrapped.fn<N>` if the handler is anonymous. */
  id?: string;
  /** Human-readable title for palette display. Defaults to the id. */
  title?: string;
  description?: string;
  category?: string;
  /** Zod schema for the command's params. When provided:
   *   - The registered command's params surface matches this schema.
   *   - Palette / MCP / AI invocations call the handler with the parsed
   *     params object as a single argument.
   *  When omitted the registered command is parameter-free; palette / AI
   *  invocations call the handler with no arguments. */
  params?: ZodType;
  /** Logger. Default: console in dev, noop in prod (NODE_ENV). Pass
   *  `null` to silence explicitly. */
  logTo?: Logger | null;
  /** Fires on every invocation of the wrapped handler — both call-site
   *  invocations and palette / AI dispatches. */
  onDispatch?: (id: string, args: unknown[]) => void;
  /** Registry to register a wrapping command with. If omitted, the
   *  handler is observed (logTo, onDispatch fire) but no command is
   *  registered — useful for telemetry-only wrapping. */
  registry?: Registry;
}

interface WrapMutationContext {
  anonymousCounter: number;
}

const ctx: WrapMutationContext = { anonymousCounter: 0 };

/**
 * Wrap a handler. Returns a function with the same call signature.
 *
 * @example
 *   // Before
 *   const onSave = () => store.save();
 *
 *   // After — call sites unchanged
 *   const onSave = wrapMutation(() => store.save(), { registry });
 *
 *   // With explicit ID + params
 *   const onSave = wrapMutation(handleSave, {
 *     registry,
 *     id: 'app.project.save',
 *     params: z.object({ projectId: z.string() }),
 *   });
 */
export function wrapMutation<H extends AnyHandler>(
  handler: H,
  options: WrapMutationOptions<H> = {},
): H {
  const id = options.id ?? deriveId(handler);
  const logger = resolveLogger(options.logTo);
  const onDispatch = options.onDispatch;

  if (options.registry) {
    const record = buildCommandRecord(id, handler, options);
    // strictDuplicates is on by default; let the host hear if they
    // double-wrap. The throw message names the id.
    options.registry.register(record);
  }

  const wrapped = ((...args: unknown[]) => {
    logger.debug?.(`[acture/migration] dispatch ${id}`, ...args);
    onDispatch?.(id, args);
    return handler(...args);
  }) as H;

  // Preserve handler.name (debugger / stack traces stay readable) where
  // we can; falls back to a synthetic name derived from the id.
  defineNonEnumerable(wrapped, 'name', handler.name || idToFnName(id));
  // Expose the resolved id so callers can introspect (tests, devtools).
  defineNonEnumerable(wrapped, '__actureCommandId', id);

  return wrapped;
}

/** Strip `__actureCommandId` from a wrapped function. Returns the id
 *  if present, undefined otherwise. Useful for migration-graduate. */
export function readWrappedCommandId(fn: unknown): string | undefined {
  if (typeof fn !== 'function') return undefined;
  const annotated = fn as { __actureCommandId?: unknown };
  return typeof annotated.__actureCommandId === 'string'
    ? annotated.__actureCommandId
    : undefined;
}

/* ───────────────────────── internals ──────────────────────────────── */

function buildCommandRecord<H extends AnyHandler>(
  id: string,
  handler: H,
  options: WrapMutationOptions<H>,
): CommandRecord<unknown, unknown> {
  const title = options.title ?? prettifyId(id);
  const description = options.description;
  const category = options.category;
  const params = options.params;
  const onDispatch = options.onDispatch;
  const logger = resolveLogger(options.logTo);

  // Two execute shapes: with-params calls handler(parsedParams); without
  // params calls handler() with no args. We model both as one execute
  // that branches on whether a schema is configured.
  const spec: CommandRecord<unknown, unknown> = {
    id,
    title,
    ...(description !== undefined ? { description } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(params !== undefined ? { params } : {}),
    execute: (parsed) => {
      const args = params === undefined ? [] : [parsed];
      logger.debug?.(`[acture/migration] dispatch ${id}`, ...args);
      onDispatch?.(id, args);
      try {
        const out = handler(...args);
        if (isPromise(out)) {
          return out.then(
            (value) => ok(value),
            (e) => err('handler_threw', errorMessage(e), { stack: errorStack(e) }),
          );
        }
        return ok(out);
      } catch (e) {
        return err('handler_threw', errorMessage(e), { stack: errorStack(e) });
      }
    },
  };
  // defineCommand validates and freezes.
  return defineCommand(spec);
}

function isPromise(x: unknown): x is Promise<unknown> {
  return (
    x !== null &&
    typeof x === 'object' &&
    typeof (x as { then?: unknown }).then === 'function'
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function errorStack(e: unknown): string | undefined {
  if (e instanceof Error) return e.stack;
  return undefined;
}

function deriveId(handler: AnyHandler): string {
  const name = handler.name;
  if (name && /^[a-z][a-zA-Z0-9]*$/.test(name)) {
    return `app.wrapped.${name}`;
  }
  // Anonymous or non-identifier-named — bump a counter.
  ctx.anonymousCounter += 1;
  return `app.wrapped.fn${ctx.anonymousCounter}`;
}

function prettifyId(id: string): string {
  const last = id.split('.').pop() ?? id;
  // camelCase → "Title Case With Spaces".
  const spaced = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return spaced;
}

function idToFnName(id: string): string {
  return id.replace(/\./g, '_');
}

function defineNonEnumerable(target: object, key: string, value: unknown): void {
  try {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  } catch {
    // `name` on function objects is read-only in some engines/contexts.
    // Silently fall through — the wrapped function still works.
  }
}

/* Re-export the Logger type so consumers don't need a second import. */
export type { Logger } from './logger.js';
