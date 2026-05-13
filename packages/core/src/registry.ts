/**
 * Command registry: Map<string, CommandRecord> with dispatch,
 * commandsChanged event, owner-scoped disposables, and tier-aware list.
 *
 * The registry is plain TypeScript — ZERO React, ZERO state-library
 * deps. It is constructible outside React (see `acture-state-adapter`
 * skill §"Case-study lessons" for the Excalidraw cautionary tale).
 */

import type { ZodType } from 'zod';
import type {
  AnyCommandRecord,
  CommandRecord,
  Context,
  Result,
  Tier,
} from './types.js';
import { evaluateWhen } from './when.js';
import { err } from './result.js';

/** Reasons a `commandsChanged` event was emitted. */
export type CommandsChangedReason =
  | 'register'
  | 'unregister'
  | 'registerAll'
  | 'disposeAll';

export interface CommandsChangedEvent {
  reason: CommandsChangedReason;
  added?: readonly string[];
  removed?: readonly string[];
}

export type CommandsChangedListener = (event: CommandsChangedEvent) => void;

export interface ListOptions {
  /** Which tiers to include. Default: `['stable']`. Pass `'all'` for
   *  every tier (still excludes `@internal` unless explicitly asked). */
  tiers?: readonly Tier[] | 'all';
  /** Filter by when-clause evaluation against this context. Omitted
   *  commands (no when) always pass. */
  context?: Context;
}

/** Options accepted by `dispatch`. */
export interface DispatchOptions {
  /** Required to dispatch an `@internal` command. The build-step mirror
   *  attaches a module-scoped Symbol to every `tier: 'internal'` command;
   *  the registering module re-exports a `dispatch` wrapper that closes
   *  over this token, so cross-module callers never see it. See
   *  `acture-tier-system` skill §"What @internal does (three layers)". */
  internalToken?: symbol;
}

export interface Registry {
  register<P, R>(cmd: CommandRecord<P, R>): () => void;
  registerAll(cmds: readonly AnyCommandRecord[]): () => void;
  unregister(id: string): boolean;
  get(id: string): AnyCommandRecord | undefined;
  list(options?: ListOptions): readonly AnyCommandRecord[];
  has(id: string): boolean;
  size(): number;
  dispatch<R = unknown>(
    id: string,
    params?: unknown,
    ctx?: Context,
    options?: DispatchOptions,
  ): Promise<Result<R>>;
  onCommandsChanged(listener: CommandsChangedListener): () => void;
}

export interface CreateRegistryOptions {
  /** Default tier when a command does not declare one. Default: `'stable'`. */
  defaultTier?: Tier;
  /** If true, register() throws `DuplicateCommandError` on duplicate ID.
   *  If false, the second register silently replaces the first.
   *  Default: true. */
  strictDuplicates?: boolean;
}

export class DuplicateCommandError extends Error {
  constructor(public readonly commandId: string) {
    super(`Command "${commandId}" is already registered`);
    this.name = 'DuplicateCommandError';
  }
}

export function createRegistry(options?: CreateRegistryOptions): Registry {
  const defaultTier: Tier = options?.defaultTier ?? 'stable';
  const strictDuplicates = options?.strictDuplicates ?? true;

  const commands = new Map<string, AnyCommandRecord>();
  const listeners = new Set<CommandsChangedListener>();

  function emit(event: CommandsChangedEvent): void {
    // Snapshot the listeners so a listener-induced register/unregister
    // doesn't mutate the set mid-iteration.
    const snapshot = Array.from(listeners);
    for (const l of snapshot) {
      try {
        l(event);
      } catch (e) {
        // Listener errors must not break dispatch. Surface to console
        // so they aren't swallowed silently. Resolve `console` via
        // globalThis so this file does not require dom/node lib types.
        const c = (globalThis as { console?: { error?: (...args: unknown[]) => void } }).console;
        c?.error?.('[acture] commandsChanged listener threw:', e);
      }
    }
  }

  function effectiveTier(cmd: AnyCommandRecord): Tier {
    return cmd.tier ?? defaultTier;
  }

  function register<P, R>(cmd: CommandRecord<P, R>): () => void {
    if (strictDuplicates && commands.has(cmd.id)) {
      throw new DuplicateCommandError(cmd.id);
    }
    commands.set(cmd.id, cmd as AnyCommandRecord);
    emit({ reason: 'register', added: [cmd.id] });
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      // Only remove if this exact instance is still registered (a later
      // register() under !strictDuplicates may have replaced it).
      if (commands.get(cmd.id) === cmd) {
        commands.delete(cmd.id);
        emit({ reason: 'unregister', removed: [cmd.id] });
      }
    };
  }

  function registerAll(cmds: readonly AnyCommandRecord[]): () => void {
    const added: string[] = [];
    const instances: AnyCommandRecord[] = [];
    for (const cmd of cmds) {
      if (strictDuplicates && commands.has(cmd.id)) {
        // Roll back partial registration so the registry isn't left
        // in a half-batched state.
        for (let i = 0; i < instances.length; i++) {
          const prev = instances[i]!;
          if (commands.get(prev.id) === prev) commands.delete(prev.id);
        }
        throw new DuplicateCommandError(cmd.id);
      }
      commands.set(cmd.id, cmd);
      added.push(cmd.id);
      instances.push(cmd);
    }
    if (added.length > 0) emit({ reason: 'registerAll', added });
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const removed: string[] = [];
      for (const cmd of instances) {
        if (commands.get(cmd.id) === cmd) {
          commands.delete(cmd.id);
          removed.push(cmd.id);
        }
      }
      if (removed.length > 0) emit({ reason: 'disposeAll', removed });
    };
  }

  function unregister(id: string): boolean {
    const existing = commands.get(id);
    if (!existing) return false;
    commands.delete(id);
    emit({ reason: 'unregister', removed: [id] });
    return true;
  }

  function list(opts?: ListOptions): readonly AnyCommandRecord[] {
    const wantTiers = opts?.tiers;
    const tierSet: ReadonlySet<Tier> | null =
      wantTiers === undefined
        ? new Set<Tier>(['stable'])
        : wantTiers === 'all'
          ? null
          : new Set(wantTiers);
    const ctx = opts?.context;

    const out: AnyCommandRecord[] = [];
    for (const cmd of commands.values()) {
      const tier = effectiveTier(cmd);
      // `@internal` is never listed unless explicitly named in tiers.
      // Per `acture-tier-system` skill: internal requires opt-in.
      if (tier === 'internal' && (tierSet === null || !tierSet.has('internal'))) {
        continue;
      }
      if (tierSet !== null && !tierSet.has(tier)) continue;
      if (ctx && !evaluateWhen(cmd.when, ctx)) continue;
      out.push(cmd);
    }
    return out;
  }

  async function dispatch<R = unknown>(
    id: string,
    params?: unknown,
    ctx?: Context,
    options?: DispatchOptions,
  ): Promise<Result<R>> {
    const cmd = commands.get(id);
    if (!cmd) {
      return err('unknown_command', `No command registered with id "${id}"`);
    }
    // `@internal` enforcement (research-5 §7.5). Internal commands carry
    // a Symbol token attached by the registering module. Callers from
    // outside the module never see it; the dispatch fails closed.
    if (cmd.tier === 'internal') {
      const expected = cmd.internalToken;
      if (expected !== undefined && options?.internalToken !== expected) {
        return err(
          'internal_dispatch_denied',
          `Command "${id}" is @internal and may only be dispatched from the registering module`,
          { tier: 'internal' },
        );
      }
    }
    const context: Context = ctx ?? {};
    if (cmd.when !== undefined && !evaluateWhen(cmd.when, context)) {
      return err(
        'when_clause_failed',
        `Command "${id}" not available in current context`,
        { when: typeof cmd.when === 'string' ? cmd.when : '<function>' },
      );
    }
    let parsed: unknown = params;
    if (cmd.params !== undefined) {
      const schema = cmd.params as ZodType<unknown>;
      const result = schema.safeParse(params);
      if (!result.success) {
        return err('invalid_params', `Invalid params for "${id}"`, {
          issues: result.error.issues,
        });
      }
      parsed = result.data;
    }
    try {
      const outcome = await cmd.execute(parsed, context);
      return outcome as Result<R>;
    } catch (e) {
      const error = e as Error & { code?: string };
      return err(
        error.code ?? 'execute_threw',
        error.message ?? String(e),
        { stack: error.stack },
      );
    }
  }

  function onCommandsChanged(listener: CommandsChangedListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    register,
    registerAll,
    unregister,
    get: (id) => commands.get(id),
    list,
    has: (id) => commands.has(id),
    size: () => commands.size,
    dispatch,
    onCommandsChanged,
  };
}
