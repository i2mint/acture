/**
 * `acture-a11y` — accessibility projections for a command registry.
 *
 *   - `toAriaProps(cmd, { ctx })` — `aria-label`, `aria-description`,
 *     `aria-disabled` (from `when`) and `aria-keyshortcuts` (from `keybinding`).
 *   - `toAriaKeyShortcuts(keys)` — tinykeys tokens to an ARIA value.
 *   - `createAnnouncer()` + `announceDispatches(registry, { announcer })` —
 *     route every dispatch `Result` to a polite live region (WCAG 4.1.3).
 *
 * The hand-written equivalent is `docs/hand-written-a11y.md`.
 */

export { toAriaProps, toAriaKeyShortcuts, isAvailable } from './aria.js';
export type { AriaProps, ToAriaPropsOptions } from './aria.js';
export { createAnnouncer, announceDispatches, defaultFormatResult } from './announcer.js';
export type {
  Announcer,
  CreateAnnouncerOptions,
  AnnounceInfo,
  FormatResult,
  AnnounceDispatchesOptions,
} from './announcer.js';
