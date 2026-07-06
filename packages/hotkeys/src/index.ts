/**
 * `acture-hotkeys` — keyboard-shortcut adapter.
 *
 * Reads `record.keybinding` off every command in a registry, binds it
 * via [tinykeys](https://github.com/jamiebuilds/tinykeys), and dispatches
 * via the registry on key match. Mounts/unmounts on `commandsChanged`
 * so newly registered commands become reachable without a manual rebind.
 *
 * Conflict resolution (per Phase 2 escalation #1, user-confirmed
 * 2026-05-13): **first-registered-wins under matching context**. When
 * two commands share a key sequence, the registry-insertion order plus
 * a per-key when-clause filter determines the winner. Authors get
 * deterministic muscle-memory; later registrations can still override
 * by explicitly unregistering the earlier command first.
 *
 * Surface (plain DOM):
 *
 *     import { bindHotkeys } from 'acture-hotkeys';
 *     const stop = bindHotkeys(registry, { contextProvider: () => myCtx });
 *     // ...later
 *     stop();
 *
 * Surface (React, optional sub-export):
 *
 *     import { useHotkeys } from 'acture-hotkeys/react';
 *     useHotkeys(registry, { context });
 */

export { bindHotkeys, parseKeybinding, collectBindings } from './bind.js';
export type {
  BindHotkeysOptions,
  HotkeyBindingDescriptor,
  HotkeyContextProvider,
  HotkeyDispatchListener,
} from './bind.js';

/**
 * End-user keymap customization (research-10; `docs/hand-written-keymap-override.md`).
 * Layer a sparse `UserKeymap` over the record defaults via `bindHotkeys`'s
 * `keymap` option, and build a remap UI from the capture / conflict / display
 * primitives:
 *
 *     import { detectConflicts, tokenFromEvent, formatKeybinding } from 'acture-hotkeys';
 */
export {
  resolveKeys,
  detectConflicts,
  tokenFromEvent,
  isReservedCombo,
  formatKeybinding,
  layoutLabel,
  EMPTY_KEYMAP,
  RESERVED_COMBOS,
} from './keymap.js';
export type {
  UserKeymap,
  KeybindingOverride,
  KeymapConflict,
} from './keymap.js';
