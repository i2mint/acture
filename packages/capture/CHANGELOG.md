# acture-capture

## 0.2.0

### Minor Changes

- 777911a: New package `acture-capture` — drive a command-dispatch app through a narrated journey, screenshot before/after each command, and emit a validated manifest that renders to an illustrated manual or a narrated video.

  Built on `acture-e2e-playwright`: a **journey is a `{commandId, params}` sequence + narration**, and capture is _replay + screenshot-around-each-step + dedup + manifest_ (the documentation sibling of "an e2e test is a macro with assertions"). The app under test exposes its registry on `window.__actureRegistry` (the e2e-playwright convention).

  - `runCapture(page, journey, opts)` — replay + before/after screenshots + byte-identical **dedup** (`collapsed`) + writes `<slug>/manifest.json` + PNGs. Never throws on a failed command (errors-as-data).
  - `screenshotsIdentical(a, b)` — the dedup predicate.
  - Zod schemas (`journeySchema`, `captureManifestSchema`, …) make the manifest a validated, cross-language, codegen-able contract.
  - Re-exports `DEFAULT_REGISTRY_KEY` so consumers wire the bridge from one source of truth.

  Positioning: an optional accelerator in the acture family (peer-deps `acture`, `acture-e2e-playwright`, `@playwright/test` optional, `zod`).
