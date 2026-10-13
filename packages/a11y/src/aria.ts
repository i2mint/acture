/**
 * Pure projections from a `CommandRecord` to the ARIA attributes a rendering
 * surface (button, menu item, toolbar item) puts on its element
 * (research-12 §3, §4.1). No `CommandRecord` field is added: every attribute is
 * derived from fields the record already has.
 *
 *     <button {...toAriaProps(cmd, { ctx })} onClick={() => dispatch(cmd.id)}>
 *       {cmd.title}
 *     </button>
 *
 * The surface still chooses the element and the role (`button`, `menuitem`,
 * `option`); this module never does.
 */

import { evaluateWhen } from 'acture';
import type { AnyCommandRecord, Context } from 'acture';

/** The ARIA attributes projected from a command. A key is absent when the
 *  record has nothing to say, so spreading the object never writes `undefined`. */
export interface AriaProps {
  readonly 'aria-label': string;
  readonly 'aria-description'?: string;
  /** `'true'` when the command's `when` clause is false in `ctx`; absent otherwise. */
  readonly 'aria-disabled'?: 'true';
  /** The live keyboard shortcut(s), ARIA syntax. Absent when disabled or when
   *  the shortcut is a chord (ARIA cannot express key sequences). */
  readonly 'aria-keyshortcuts'?: string;
}

export interface ToAriaPropsOptions {
  /** Context for evaluating `when`. Omitted: the command counts as available. */
  readonly ctx?: Context;
  /** The tinykeys tokens that are actually bound, e.g. from `acture-hotkeys`'
   *  `resolveKeys(cmd, userKeymap)`. Default: the record's own `keybinding`.
   *  Pass `[]` when the shortcut is not live on this surface. */
  readonly keys?: readonly string[];
  /** Resolve `$mod` to `Meta` (true) or `Control` (false). Default: detected
   *  from `navigator.platform`. */
  readonly apple?: boolean;
}

/** True when the command is available in `ctx` (its `when` is true or absent). */
export function isAvailable(cmd: AnyCommandRecord, ctx: Context = {}): boolean {
  return evaluateWhen(cmd.when, ctx);
}

/**
 * Project a command to ARIA attributes: `aria-label` (the title, so the
 * accessible name contains the visible label, WCAG 2.5.3), `aria-description`,
 * `aria-disabled` from `when`, and `aria-keyshortcuts` from the live keys.
 * A disabled command advertises no shortcut.
 */
export function toAriaProps(cmd: AnyCommandRecord, options: ToAriaPropsOptions = {}): AriaProps {
  const available = isAvailable(cmd, options.ctx);
  const shortcuts = available
    ? toAriaKeyShortcuts(options.keys ?? normalizeKeybinding(cmd.keybinding), {
        ...(options.apple !== undefined ? { apple: options.apple } : {}),
      })
    : undefined;
  return {
    'aria-label': cmd.title,
    ...(cmd.description ? { 'aria-description': cmd.description } : {}),
    ...(available ? {} : { 'aria-disabled': 'true' as const }),
    ...(shortcuts ? { 'aria-keyshortcuts': shortcuts } : {}),
  };
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
};

/**
 * Convert tinykeys tokens (`"$mod+Shift+p"`) to an `aria-keyshortcuts` value
 * (`"Meta+Shift+P"`): `+`-joined UI Events key names, modifiers first,
 * alternatives space-separated. `$mod` becomes `Meta` on Apple, `Control`
 * elsewhere. Chords (`"g i"`) are dropped: ARIA cannot express key sequences.
 * Returns `undefined` when nothing remains.
 */
export function toAriaKeyShortcuts(
  keys: readonly string[],
  options: { readonly apple?: boolean } = {},
): string | undefined {
  const apple = options.apple ?? isApplePlatform();
  const out: string[] = [];
  for (const token of keys) {
    const trimmed = token.trim();
    if (trimmed === '' || /\s/.test(trimmed)) continue; // chord
    const parts = splitCombo(trimmed);
    const key = parts.pop();
    if (key === undefined) continue;
    const modifiers = parts.map((m) => modifierName(m, apple));
    const combo = [...new Set(modifiers), keyName(key)].join('+');
    if (!out.includes(combo)) out.push(combo);
  }
  return out.length > 0 ? out.join(' ') : undefined;
}

/** Split `"$mod+Shift+="` on `+`, keeping a trailing literal `+` as the key. */
function splitCombo(combo: string): string[] {
  if (combo.endsWith('++')) return [...combo.slice(0, -2).split('+'), '+'];
  return combo.split('+');
}

function modifierName(raw: string, apple: boolean): string {
  if (raw === '$mod') return apple ? 'Meta' : 'Control';
  return KEY_NAMES[raw.toLowerCase()] ?? raw;
}

function keyName(raw: string): string {
  const named = KEY_NAMES[raw.toLowerCase()];
  if (named) return named;
  return raw.length === 1 ? raw.toUpperCase() : raw;
}

function normalizeKeybinding(kb: AnyCommandRecord['keybinding']): readonly string[] {
  if (kb === undefined) return [];
  return typeof kb === 'string' ? [kb] : kb;
}

function isApplePlatform(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string } }).navigator;
  return /Mac|iPhone|iPod|iPad/.test(nav?.platform ?? '');
}
