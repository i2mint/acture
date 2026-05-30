/**
 * `acture-capture` — drive a command-dispatch app through a narrated
 * journey, screenshot before/after each command, and emit a manifest that
 * renders to an illustrated manual (PDF) or a narrated video.
 *
 * Built on `acture-e2e-playwright`: a journey *is* a `{commandId, params}`
 * sequence + narration; capture is *replay + screenshot-around-each-step +
 * dedup + manifest* (instead of replay + assert). The app under test
 * exposes its registry on `window.__actureRegistry` (the e2e-playwright
 * convention) — see `DEFAULT_REGISTRY_KEY`.
 *
 * Positioning: an *optional accelerator* in the acture family. The capture
 * loop is small enough to hand-write; installing this gets you the tested
 * dedup + the validated manifest contract. See `docs/positioning.md`.
 */

export { runCapture, screenshotsIdentical } from './capture.js';
export type { RunCaptureOptions } from './capture.js';

export {
  journeySchema,
  journeyStepSchema,
  captureManifestSchema,
  manifestStepSchema,
  dispatchOutcomeSchema,
} from './manifest.js';
export type {
  Journey,
  JourneyStep,
  CaptureManifest,
  ManifestStep,
  DispatchOutcome,
} from './manifest.js';

// The window-key convention the app under test exposes its registry on.
// Re-exported so a consumer wires the bridge from one source of truth.
export { DEFAULT_REGISTRY_KEY } from 'acture-e2e-playwright';
