/**
 * `@acture/palette-react` — Phase 1 command palette.
 *
 * Minimum-viable surface: parameter-free commands only. Wraps cmdk's
 * `<Command>` primitive, iterates `registry.list()`, filters by tier
 * (default `['stable']`) and by when-clause (if `context` is supplied),
 * groups by `category`, shows keybinding hints, and listens for
 * `commandsChanged`.
 *
 * Phase 2 adds parameterized-command UX (`kind: "atomic" | "handoff"`
 * per research-2). Until then, parameterized commands appear with a
 * "Phase 2" badge and dispatching them is a no-op (or routes to a
 * user-supplied callback via `onParameterizedSelect`).
 */

export { CommandPalette } from './palette.js';
export type {
  CommandPaletteProps,
  PaletteItemRenderer,
} from './palette.js';
export { useCommandsChanged } from './use-commands-changed.js';
