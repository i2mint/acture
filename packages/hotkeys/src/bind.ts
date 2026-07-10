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
import { resolveKeys, EMPTY_KEYMAP, type UserKeymap } from './keymap.js';

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

  /** Optional end-user keymap layered over the record defaults (research-10):
   *  a sparse `commandId → { replace | add | remove }` override map. Captured
   *  at bind time; to apply a *changed* keymap, `stop()` then re-`bindHotkeys`.
   *  Default: an empty keymap (every command uses its record `keybinding`), so
   *  existing callers are unaffected. See `./keymap.js`. */
  keymap?: UserKeymap;
}

/** Internal: a binding-table entry. */
export interface HotkeyBindingDescriptor {
  readonly keySequence: string;
  readonly commandId: string;
  readonly when?: WhenClause;
  /** True when this command carries a user keymap override. User-touched
   *  descriptors sort BEFORE untouched defaults on the same key, so a user
   *  rebinding wins the key (research-10 §5.2). Absent ⇒ default. */
  readonly userTouched?: boolean;
}

const DEFAULT_IGNORE: (e: KeyboardEvent) => boolean = (event) => {
  // Resolve the innermost real target. For an `<input>` rendered inside a web
  // component's shadow DOM, `event.target` is retargeted to the shadow HOST, so
  // a naive tagName check misses it and the hotkey fires while the user types.
  // `composedPath()[0]` pierces the shadow boundary; fall back to `event.target`
  // where composedPath is unavailable or empty (e.g. outside dispatch).
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const t = path.length > 0 ? path[0] : event.target;
  if (t === null || t === undefined || !(t instanceof Element)) return false;
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
  const keymap = options.keymap ?? EMPTY_KEYMAP;

  let teardown: (() => void) | null = null;
  let disposed = false;

  function rebind(): void {
    teardown?.();
    if (disposed) return;
    const table = collectBindings(registry, tiers, keymap);
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
          let applies: boolean;
          try {
            applies = evaluateWhen(desc.when, ctx);
          } catch {
            // A function when-clause that throws (e.g. reads a ctx slice that
            // isn't populated yet) must not crash the whole key handler and
            // swallow the remaining fallback candidates — treat it as
            // not-applicable and try the next command, mirroring the
            // fail-closed discipline of registry.dispatch.
            continue;
          }
          if (!applies) continue;
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
 *
 * `keymap` (default: empty) layers a user override over each record's default
 * `keybinding` via {@link resolveKeys} — with an empty keymap this is exactly
 * the record defaults, so the behaviour is unchanged. User-touched commands
 * sort BEFORE untouched defaults on the same key, so a user rebinding wins the
 * key while the fire-time when-clause scan (in `bindHotkeys`) is untouched.
 */
export function collectBindings(
  registry: Registry,
  tiers?: readonly Tier[] | 'all',
  keymap: UserKeymap = EMPTY_KEYMAP,
): Map<string, HotkeyBindingDescriptor[]> {
  const table = new Map<string, HotkeyBindingDescriptor[]>();
  // We intentionally do NOT pass `context` to `list()` — the when-clause
  // filter happens at FIRE time, not at registration time. That's what
  // makes "first-registered-wins under matching context" work for
  // when-clauses that depend on dynamic state (selection, focus, etc.).
  const list = registry.list(tiers !== undefined ? { tiers } : undefined);
  for (const cmd of list) {
    const userTouched = keymap.overrides[cmd.id] !== undefined;
    for (const kb of resolveKeys(cmd, keymap)) {
      const key = parseKeybinding(kb);
      let arr = table.get(key);
      if (!arr) {
        arr = [];
        table.set(key, arr);
      }
      const desc: HotkeyBindingDescriptor = cmd.when !== undefined
        ? { keySequence: key, commandId: cmd.id, when: cmd.when, userTouched }
        : { keySequence: key, commandId: cmd.id, userTouched };
      arr.push(desc);
    }
  }
  // User-touched bindings win the key (research-10 §5.2). Array.sort is stable,
  // so registration order is preserved within each group — and this is a no-op
  // when no keymap is applied (every descriptor has userTouched === false).
  for (const arr of table.values()) {
    arr.sort((a, b) => Number(b.userTouched ?? false) - Number(a.userTouched ?? false));
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
