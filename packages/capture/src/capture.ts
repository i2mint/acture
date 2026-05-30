/**
 * The capture runner — "replay a journey, but screenshot instead of
 * assert." The documentation sibling of `acture-e2e-playwright`'s
 * `replaySequenceInPage`: same `dispatchInPage` bridge, but each step is
 * bracketed by a before/after screenshot and the result is a manifest,
 * not a pass/fail.
 *
 * Playwright is imported **type-only** — `runCapture` takes a `Page` the
 * caller already has (from the `@playwright/test` fixture). The package
 * therefore carries no runtime Playwright dependency.
 *
 * Positioning: like the rest of acture, this is an *optional accelerator*.
 * The loop is small enough to hand-write against any browser driver; the
 * value is the tested dedup + manifest contract.
 */

import type { Page } from '@playwright/test';
import { dispatchInPage, type PageBridgeOptions } from 'acture-e2e-playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  journeySchema,
  type CaptureManifest,
  type Journey,
  type ManifestStep,
} from './manifest.js';

/** Byte-identical screenshots → the command had no visible effect. */
export function screenshotsIdentical(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface RunCaptureOptions extends PageBridgeOptions {
  /** Directory the run writes `<slug>/manifest.json` + PNGs into. */
  outDir: string;
  /**
   * URL to navigate before capturing — must attach the registry bridge
   * (`window.__actureRegistry`). Default `'/?capture=1'`. Pass `null` to
   * skip when the caller has already navigated.
   */
  url?: string | null;
  /** Default settle (ms) after each dispatch before the "after" shot. */
  settleMs?: number;
  /** ISO timestamp stamped into the manifest (inject for determinism). */
  now?: string;
  /** Per-step progress callback (e.g. to log). */
  onStep?: (step: ManifestStep) => void;
}

/**
 * Capture a journey: replay each command through the page's registry,
 * screenshot before + after, dedup byte-identical pairs (`collapsed`), and
 * write `<outDir>/<slug>/manifest.json` + the PNGs. Returns the manifest.
 *
 * Never throws on a failed command — the outcome is recorded
 * (`dispatch.success === false`); a manual that documents an error state
 * is still informative.
 */
export async function runCapture(
  page: Page,
  journey: Journey,
  options: RunCaptureOptions,
): Promise<CaptureManifest> {
  const j = journeySchema.parse(journey);
  const {
    outDir,
    url = '/?capture=1',
    settleMs = 600,
    now,
    onStep,
    ...bridge
  } = options;
  const registryKey = bridge.registryKey ?? '__actureRegistry';
  const dir = join(outDir, j.slug);
  await mkdir(dir, { recursive: true });

  if (url !== null) {
    await page.goto(url);
    await page.waitForFunction(
      (key) => Boolean((globalThis as Record<string, unknown>)[key]),
      registryKey,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1_000);
  }

  const steps: ManifestStep[] = [];
  for (const [i, step] of j.steps.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const beforeFile = `${n}-before.png`;
    const afterFile = `${n}-after.png`;

    const clip = step.clip
      ? ((await page.locator(step.clip).boundingBox()) ?? undefined)
      : undefined;

    const beforeBuf = await page.screenshot({ clip });
    const result = await dispatchInPage(page, step.commandId, step.params, bridge);
    await page.waitForTimeout(step.settleMs ?? settleMs);
    const afterBuf = await page.screenshot({ clip });

    const collapsed = screenshotsIdentical(beforeBuf, afterBuf);
    await writeFile(join(dir, beforeFile), beforeBuf);
    if (!collapsed) await writeFile(join(dir, afterFile), afterBuf);

    const manifestStep: ManifestStep = {
      ...step,
      index: i + 1,
      before: beforeFile,
      after: collapsed ? beforeFile : afterFile,
      collapsed,
      dispatch: result.ok
        ? { success: true }
        : { success: false, message: result.error.message },
    };
    steps.push(manifestStep);
    onStep?.(manifestStep);
  }

  const manifest: CaptureManifest = {
    slug: j.slug,
    title: j.title,
    intro: j.intro,
    capturedAt: now ?? new Date().toISOString(),
    steps,
  };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
