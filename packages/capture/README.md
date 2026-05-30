# acture-capture

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write the capture loop against any browser driver, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code. See [`docs/positioning.md`](../../docs/positioning.md).

Drive a command-dispatch app through a **narrated journey**, screenshot the UI **before and after each command**, and emit a **manifest** that renders to an illustrated manual (PDF) or a narrated video.

A capture is *self-documenting*: because every user-actionable behaviour is an [acture](https://npm.im/acture) command (the registry is the single source of truth), the manual **exercises the real app** and so can't silently drift from it.

Built on [`acture-e2e-playwright`](../e2e-playwright): a **journey is a `{commandId, params}` sequence + narration**, and capture is *replay + screenshot-around-each-step + dedup + manifest* — the documentation sibling of "an e2e test is a macro with assertions."

## Install

```sh
pnpm add -D acture-capture acture-e2e-playwright @playwright/test acture zod
```

## The app exposes its registry

Same convention as `acture-e2e-playwright` — in a dev/test build only, put the registry on `window`:

```ts
import { DEFAULT_REGISTRY_KEY } from 'acture-capture'; // '__actureRegistry'

if (import.meta.env.DEV && new URLSearchParams(location.search).has('capture')) {
  (window as any)[DEFAULT_REGISTRY_KEY] = getRegistry();
}
```

## Capture a journey

```ts
import { test } from '@playwright/test';
import { runCapture, type Journey } from 'acture-capture';

const journey: Journey = {
  slug: 'quickstart',
  title: 'A one-minute tour',
  intro: 'Switching layouts and the shell controls.',
  steps: [
    { narration: 'Spread the storyboard across two pages.',
      commandId: 'view.layout.set', params: { mode: 'spread' } },
    { narration: 'Open the command palette.',
      commandId: 'shell.commandPalette.open' },
  ],
};

test('capture', async ({ page }) => {
  await runCapture(page, journey, { outDir: 'capture-out' });
  // → capture-out/quickstart/manifest.json + NN-before.png / NN-after.png
});
```

### Before/after dedup

When a command has no visible effect, its two screenshots are byte-identical; the step is marked `collapsed` and only one image is written (the manifest's `after` points back at `before`). Renderers show a single image for those steps.

## The manifest is the contract

`runCapture` returns (and writes) a `CaptureManifest` — plain JSON, validated by an exported [Zod](https://zod.dev) schema (`captureManifestSchema`). It is **cross-language**: produce it here in TypeScript, consume it in any renderer (e.g. a Python PDF/video pipeline reads `steps[].{narration, commandId, before, after, collapsed, dispatch.success}`).

## API

| Export | What |
|---|---|
| `runCapture(page, journey, opts)` | Replay + screenshot + dedup + write manifest. Returns the `CaptureManifest`. |
| `screenshotsIdentical(a, b)` | The dedup predicate (byte equality). |
| `journeySchema` / `captureManifestSchema` / … | Zod schemas + inferred types (`Journey`, `CaptureManifest`, `ManifestStep`, …). |
| `DEFAULT_REGISTRY_KEY` | The `window` key the app exposes its registry on. |

`runCapture` never throws on a failed command — the outcome is recorded (`dispatch.success === false`); a manual that documents an error state is still informative.
