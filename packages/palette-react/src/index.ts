/**
 * `acture-palette-react` — command palette for React.
 *
 * Phase 2 surface:
 *   - List view groups commands by category, sorted by `defaultScore`.
 *   - Parameterized commands route through `deriveKind`:
 *       atomic → in-palette picker chain (Linear/Discord-style)
 *       handoff → host-supplied form adapter (`acture-forms-autoform`
 *                 or `acture-forms-rjsf`) rendered inline, OR a
 *                 fallback callback for the host to open its own view.
 *   - Listens for `commandsChanged` and rebuilds the list incrementally.
 *
 * No bundled UI kit. Styling is the host's job; cmdk's primitives plus
 * `data-acture-*` hooks let the consumer dress everything to taste.
 */

export { CommandPalette } from './palette.js';
export type {
  CommandPaletteProps,
  PaletteItemRenderer,
  PaletteFormAdapter,
  PaletteFormAdapterProps,
} from './palette.js';
export { useCommandsChanged } from './use-commands-changed.js';
export { deriveKind, summarizeParams, isPickerSchema, readEnumOptions } from './derive-kind.js';
export type { ParamSummary } from './derive-kind.js';
export { PickerChain } from './picker-chain.js';
export type { PickerChainProps } from './picker-chain.js';
