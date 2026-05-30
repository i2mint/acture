/**
 * The capture **manifest** — the contract between the capture engine and
 * any renderer (a PDF manual, a narrated video, …). Plain JSON,
 * cross-language: produced here in TypeScript, consumed downstream in any
 * language (e.g. reelee's Python renderers read this exact shape).
 *
 * A **journey** is a narrated command sequence — `acture-e2e-playwright`'s
 * `SequenceStep` (`{commandId, params}`) plus a `narration` line and
 * optional shot framing. Capturing a journey replays it through the page,
 * screenshots before/after each command, and emits a `CaptureManifest`.
 *
 * Schemas are Zod so the manifest is a validated, codegen-able contract.
 */

import { z } from 'zod';

/** One narrated step: a command to dispatch + how to frame its shots. */
export const journeyStepSchema = z.object({
  /** Human narration — becomes the manual caption / TTS line. */
  narration: z.string(),
  /** Dotted acture command id to dispatch (the SSOT id, not a title). */
  commandId: z.string(),
  /** Params for the command (validated by its own schema on dispatch). */
  params: z.unknown().optional(),
  /** Optional CSS selector to scope the screenshot to one element. */
  clip: z.string().optional(),
  /** Extra settle time (ms) after dispatch before the "after" shot. */
  settleMs: z.number().int().nonnegative().optional(),
});
export type JourneyStep = z.infer<typeof journeyStepSchema>;

/** An ordered, titled journey through a command-dispatch app. */
export const journeySchema = z.object({
  /** Filesystem-safe slug; names the output directory. */
  slug: z.string(),
  /** Display title for the rendered manual / video. */
  title: z.string(),
  /** Optional intro blurb rendered on the cover. */
  intro: z.string().optional(),
  steps: z.array(journeyStepSchema),
});
export type Journey = z.infer<typeof journeySchema>;

/** Outcome of a command dispatch. `success` mirrors acture's `Result.ok`;
 *  errors are data, never thrown across the capture boundary. */
export const dispatchOutcomeSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
export type DispatchOutcome = z.infer<typeof dispatchOutcomeSchema>;

/** A captured step in the emitted manifest. */
export const manifestStepSchema = journeyStepSchema.extend({
  /** 1-based position in the journey. */
  index: z.number().int().positive(),
  /** Pre-dispatch screenshot filename, relative to the manifest. */
  before: z.string(),
  /** Post-dispatch screenshot filename. Equals `before` when collapsed. */
  after: z.string(),
  /** True when before == after (no visible effect): renderers show one image. */
  collapsed: z.boolean(),
  dispatch: dispatchOutcomeSchema,
});
export type ManifestStep = z.infer<typeof manifestStepSchema>;

/** The capture output: a journey rendered to disk. */
export const captureManifestSchema = z.object({
  slug: z.string(),
  title: z.string(),
  intro: z.string().optional(),
  /** ISO-8601 timestamp the capture ran. */
  capturedAt: z.string(),
  steps: z.array(manifestStepSchema),
});
export type CaptureManifest = z.infer<typeof captureManifestSchema>;
