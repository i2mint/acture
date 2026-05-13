/**
 * `@acture/hotkeys` — keyboard-shortcut adapter.
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
 *     import { bindHotkeys } from '@acture/hotkeys';
 *     const stop = bindHotkeys(registry, { contextProvider: () => myCtx });
 *     // ...later
 *     stop();
 *
 * Surface (React, optional sub-export):
 *
 *     import { useHotkeys } from '@acture/hotkeys/react';
 *     useHotkeys(registry, { context });
 */

export { bindHotkeys, parseKeybinding } from './bind.js';
export type {
  BindHotkeysOptions,
  HotkeyBindingDescriptor,
  HotkeyContextProvider,
  HotkeyDispatchListener,
} from './bind.js';
