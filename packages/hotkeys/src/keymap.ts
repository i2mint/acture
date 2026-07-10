/**
 * End-user keymap customization — the layer that lets a *user* (not just the
 * developer) remap shortcuts and have the choice persist. Pure and composed:
 * the record's `keybinding` stays the developer default; a sparse `UserKeymap`
 * overrides it at bind time, with **no change to the closed `CommandRecord`**
 * (research-10 §5.1; reproducible reference: `docs/hand-written-keymap-override.md`).
 *
 * This module is tinykeys-free and (mostly) DOM-free — `resolveKeys` /
 * `detectConflicts` are pure; `tokenFromEvent` / `isReservedCombo` /
 * `formatKeybinding` are the capture/display primitives. `bindHotkeys`
 * (in `bind.ts`) consumes `resolveKeys` via an optional `keymap` option.
 */

/// <reference lib="dom" />

import type { AnyCommandRecord, Registry, Tier, WhenClause } from 'acture';
import { evaluateWhen } from 'acture';

/** One user override for a single command. `when` is deliberately NOT
 *  overridable — users change keys, not availability scope — which dodges
 *  VS Code's "empty-when shadows a scoped default" footgun (research-10 §3.2). */
export type KeybindingOverride =
  | { readonly kind: 'replace'; readonly keys: readonly string[] } // replace the record default
  | { readonly kind: 'add'; readonly keys: readonly string[] } // keep default AND add these
  | { readonly kind: 'remove' }; // unbind (VS Code's -command / Zed null)

/** The persisted user keymap: SPARSE — only changed commands appear. A command
 *  absent from `overrides` uses its record default. Survives registry churn:
 *  a removed command just leaves a dead entry. JSON-serializable. */
export interface UserKeymap {
  readonly version: 1; // schema version, for future migration
  readonly basePreset?: string; // e.g. 'vscode' | 'vim' — for portability
  readonly overrides: Readonly<Record<string, KeybindingOverride>>;
}

/** The empty keymap — every command uses its record default. The default for
 *  `bindHotkeys`'s `keymap` option, so existing callers are unaffected. */
export const EMPTY_KEYMAP: UserKeymap = { version: 1, overrides: {} };

/** Minimal record shape `resolveKeys` needs. `AnyCommandRecord` satisfies it. */
type Keybindable = Pick<AnyCommandRecord, 'id' | 'keybinding'>;

/** Normalize a record's `keybinding` (string | string[] | undefined) to an
 *  array. Local copy — the binder's `normalizeKeybinding` is module-private. */
function normalizeKeybinding(kb: Keybindable['keybinding']): string[] {
  if (kb === undefined) return [];
  return typeof kb === 'string' ? [kb] : [...kb];
}

/** Drop duplicate key sequences, preserving first-seen order. */
function dedupeKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

/**
 * Effective key sequences for one command, given the user layer. Returns the
 * tinykeys tokens that should now trigger this command — the record default,
 * replaced / augmented / removed per the override. The result is de-duplicated:
 * an `add` override that re-adds a key already in the default (e.g. a preset
 * that restates a binding) must not bind the command to the same key twice, nor
 * make {@link detectConflicts} report the command as conflicting with itself.
 */
export function resolveKeys(cmd: Keybindable, keymap: UserKeymap): string[] {
  const override = keymap.overrides[cmd.id];
  const base = normalizeKeybinding(cmd.keybinding);
  if (!override) return base;
  switch (override.kind) {
    case 'remove':
      return [];
    case 'replace':
      return dedupeKeys(override.keys);
    case 'add':
      return dedupeKeys([...base, ...override.keys]);
  }
}

/** A same-key clash between two or more commands, after keymap resolution. */
export interface KeymapConflict {
  readonly keySequence: string;
  readonly commandIds: string[];
  /** `'definite'` when no command on the key has a `when` (they always
   *  co-fire); `'possible'` when at least one is scoped (may be mutually
   *  exclusive — acture can only prove exclusivity when neither is scoped). */
  readonly severity: 'definite' | 'possible';
}

/**
 * Report key sequences bound by ≥2 commands, after applying `keymap`. This is
 * the highest-value customization affordance and the one most products get
 * wrong (research-10 §3.5). Surface it at assignment time ("Already assigned
 * to X — Reassign / Keep both / Cancel") and as a standing conflicts list.
 *
 * Same-key bindings whose `when` clauses are mutually exclusive are NOT a true
 * conflict; acture can only *prove* that when neither is scoped, so anything
 * with a `when` is reported `'possible'`, not `'definite'`.
 */
export function detectConflicts(
  registry: Registry,
  keymap: UserKeymap = EMPTY_KEYMAP,
  options: { tiers?: readonly Tier[] | 'all' } = {},
): KeymapConflict[] {
  const table = new Map<string, Array<{ commandId: string; scoped: boolean }>>();
  const list = registry.list(options.tiers !== undefined ? { tiers: options.tiers } : undefined);
  for (const cmd of list) {
    const scoped = (cmd as { when?: WhenClause }).when !== undefined;
    for (const raw of resolveKeys(cmd, keymap)) {
      const key = raw.trim();
      const arr = table.get(key) ?? [];
      arr.push({ commandId: cmd.id, scoped });
      table.set(key, arr);
    }
  }
  const conflicts: KeymapConflict[] = [];
  for (const [keySequence, entries] of table) {
    if (entries.length < 2) continue;
    conflicts.push({
      keySequence,
      commandIds: entries.map((e) => e.commandId),
      severity: entries.some((e) => e.scoped) ? 'possible' : 'definite',
    });
  }
  return conflicts;
}

/* ─────────────────────────── capture primitives ─────────────────────────── */

/**
 * Build a tinykeys token from a `keydown` event — the core of press-to-record
 * capture. Returns `null` for a lone modifier press (so the caller keeps
 * listening). Matches on `event.key` by default (the tinykeys/acture mnemonic
 * default); pass `mode: 'code'` for positional (WASD-style) tokens.
 */
export function tokenFromEvent(
  event: KeyboardEvent,
  options: { mode?: 'key' | 'code' } = {},
): string | null {
  const k = event.key;
  if (k === 'Control' || k === 'Meta' || k === 'Shift' || k === 'Alt') return null;
  const mods: string[] = [];
  if (event.metaKey || event.ctrlKey) mods.push('$mod'); // portable primary modifier
  if (event.shiftKey) mods.push('Shift');
  if (event.altKey) mods.push('Alt');
  // The spacebar's `event.key` is a literal space; tinykeys parses a binding
  // string by splitting on spaces (the chord separator), which would strip a
  // space token to an empty, never-matching key. Emit the code-name 'Space',
  // which tinykeys matches via `event.code` — so the captured shortcut fires.
  const base =
    options.mode === 'code'
      ? event.code
      : k === ' '
        ? 'Space'
        : k.length === 1
          ? k.toLowerCase()
          : k;
  return [...mods, base].join('+');
}

/** Browser/OS-reserved combos that `preventDefault()` cannot reclaim — a
 *  rebind UI must reject them (research-10 §3.8). Stored as normalized tokens
 *  (`$mod` for the primary modifier). Extend per the target environment. */
export const RESERVED_COMBOS: ReadonlySet<string> = new Set([
  '$mod+w',
  '$mod+t',
  '$mod+n',
  '$mod+r',
  '$mod+q',
  '$mod+shift+w',
  '$mod+shift+t',
  '$mod+shift+n',
  '$mod+l',
]);

/** Is this token a browser/OS-reserved combo the page cannot capture? */
export function isReservedCombo(token: string): boolean {
  const norm = token
    .trim()
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .sort()
    .join('+');
  for (const reserved of RESERVED_COMBOS) {
    const rn = reserved.toLowerCase().split('+').map((p) => p.trim()).sort().join('+');
    if (rn === norm) return true;
  }
  return false;
}

/* ──────────────────────────── display helpers ───────────────────────────── */

const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

/** Human-readable label for a tinykeys token, resolving `$mod` per platform
 *  (⌘ on Apple, Ctrl elsewhere) and using symbols for modifiers. For a
 *  chord (`"g i"`), each combo is formatted and joined with a space. */
export function formatKeybinding(token: string, options: { apple?: boolean } = {}): string {
  const apple = options.apple ?? IS_APPLE;
  const mod = apple ? '⌘' : 'Ctrl';
  const symbols: Record<string, string> = apple
    ? { $mod: mod, shift: '⇧', alt: '⌥', ctrl: '⌃', meta: '⌘' }
    : { $mod: mod, shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl', meta: 'Meta' };
  return token
    .trim()
    .split(/\s+/)
    .map((combo) =>
      combo
        .split('+')
        .map((part) => symbols[part.toLowerCase()] ?? (part.length === 1 ? part.toUpperCase() : part))
        .join(apple ? '' : '+'),
    )
    .join(' ');
}

/**
 * Layout-correct label for a **physical** (`event.code`) token, via
 * `navigator.keyboard.getLayoutMap()` — so `KeyW` reads as "Z" on AZERTY
 * (research-10 §3.4). Chromium-only and unavailable in cross-origin iframes;
 * falls back to the raw code. Async by nature of the API.
 */
export async function layoutLabel(code: string): Promise<string> {
  try {
    const kb = (navigator as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } })
      .keyboard;
    if (kb?.getLayoutMap) {
      const map = await kb.getLayoutMap();
      const label = map.get(code);
      if (label) return label.toUpperCase();
    }
  } catch {
    // getLayoutMap can reject in cross-origin iframes — fall through.
  }
  return code;
}
