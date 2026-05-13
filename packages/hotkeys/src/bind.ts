/**
 * Hotkey binding internals. Translates `CommandRecord.keybinding`
 * values into tinykeys bindings, with first-registered-wins
 * tiebreaking under matching when-clause context.
 */

/// <reference lib="dom" />

import { tinykeys } from 'tinykeys';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Result,
  Tier,
  WhenClause,
} from 'acture';
import { evaluateWhen } from 'acture';

/** Function that returns the current context for when-clause evaluation
 *  at hotkey-fire time. Kept as a provider (not a snapshot) so binding
 *  setup doesn't have to re-run on every selection change. */
export type HotkeyContextProvider = () => Context;

/** Called after a successful (or failed) dispatch triggered by a key
 *  match. The host can use this to close a modal, focus an output, etc. */
export type HotkeyDispatchListener = (
  cmd: AnyCommandRecord,
  result: Result<unknown>,
) => void;

export interface BindHotkeysOptions {
  /** Target element. Default: `window` (i.e. document-wide). For modal
   *  scopes, pass the modal's root element so bindings auto-scope. */
  target?: Window | HTMLElement;

  /** Source of the when-clause context at dispatch time. Default: empty. */
  contextProvider?: HotkeyContextProvider;

  /** Called after each dispatch. Use for telemetry or modal teardown. */
  onDispatched?: HotkeyDispatchListener;

  /** Predicate: return true to SKIP firing the hotkey for this event.
   *  Default: skips when the target is an input/textarea/contenteditable.
   *  Pass `() => false` to always fire. */
  shouldIgnoreEvent?: (event: KeyboardEvent) => boolean;

  /** Tier filter applied to candidate commands. Default: `['stable']`. */
  tiers?: readonly Tier[] | 'all';
}

/** Internal: a binding-table entry. */
export interface HotkeyBindingDescriptor {
  readonly keySequence: string;
  readonly commandId: string;
  readonly when?: WhenClause;
}

const DEFAULT_IGNORE: (e: KeyboardEvent) => boolean = (event) => {
  const t = event.target;
  if (t === null || !(t instanceof Element)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((t as HTMLElement).isContentEditable) return true;
  return false;
};

/**
 * Bind every keybinding-bearing command in the registry to a tinykeys
 * handler. Returns an unbind function. Rebinds automatically on
 * `commandsChanged` events.
 */
export function bindHotkeys(
  registry: Registry,
  options: BindHotkeysOptions = {},
): () => void {
  const target = options.target ?? (globalThis as { window?: Window }).window ?? globalThis;
  const contextProvider = options.contextProvider ?? (() => ({}));
  const shouldIgnoreEvent = options.shouldIgnoreEvent ?? DEFAULT_IGNORE;
  const tiers = options.tiers;

  let teardown: (() => void) | null = null;
  let disposed = false;

  function rebind(): void {
    teardown?.();
    if (disposed) return;
    const table = collectBindings(registry, tiers);
    if (table.size === 0) {
      teardown = () => {};
      return;
    }
    const bindings: Record<string, (event: KeyboardEvent) => void> = {};
    for (const [keySequence, descriptors] of table) {
      bindings[keySequence] = (event) => {
        if (shouldIgnoreEvent(event)) return;
        const ctx = contextProvider();
        // First-registered-wins under matching context (research-1; user-
        // confirmed escalation #1). Iterate insertion-ordered descriptors.
        for (const desc of descriptors) {
          if (!evaluateWhen(desc.when, ctx)) continue;
          event.preventDefault();
          void registry
            .dispatch(desc.commandId, undefined, ctx)
            .then((result) => {
              const cmd = registry.get(desc.commandId);
              if (cmd) options.onDispatched?.(cmd, result);
            });
          return;
        }
      };
    }
    teardown = tinykeys(target as Window, bindings);
  }

  const off = registry.onCommandsChanged(() => rebind());
  rebind();

  return () => {
    if (disposed) return;
    disposed = true;
    off();
    teardown?.();
    teardown = null;
  };
}

/**
 * Build the binding table: key-sequence → ordered list of candidates.
 * Exported for tests / debugging; not part of the day-to-day surface.
 */
export function collectBindings(
  registry: Registry,
  tiers?: readonly Tier[] | 'all',
): Map<string, HotkeyBindingDescriptor[]> {
  const table = new Map<string, HotkeyBindingDescriptor[]>();
  // We intentionally do NOT pass `context` to `list()` — the when-clause
  // filter happens at FIRE time, not at registration time. That's what
  // makes "first-registered-wins under matching context" work for
  // when-clauses that depend on dynamic state (selection, focus, etc.).
  const list = registry.list(tiers !== undefined ? { tiers } : undefined);
  for (const cmd of list) {
    const kbs = normalizeKeybinding(cmd.keybinding);
    for (const kb of kbs) {
      const key = parseKeybinding(kb);
      let arr = table.get(key);
      if (!arr) {
        arr = [];
        table.set(key, arr);
      }
      const desc: HotkeyBindingDescriptor = cmd.when !== undefined
        ? { keySequence: key, commandId: cmd.id, when: cmd.when }
        : { keySequence: key, commandId: cmd.id };
      arr.push(desc);
    }
  }
  return table;
}

/**
 * Normalize a user-supplied keybinding to tinykeys' string syntax.
 *
 * `$mod` is preserved (tinykeys treats it as Meta on macOS, Ctrl on
 * other platforms). Trim whitespace.
 */
export function parseKeybinding(kb: string): string {
  return kb.trim();
}

function normalizeKeybinding(
  kb: AnyCommandRecord['keybinding'],
): readonly string[] {
  if (kb === undefined) return [];
  if (typeof kb === 'string') return [kb];
  return kb;
}
