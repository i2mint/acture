# acture-e2e-playwright

## 1.1.0

### Minor Changes

- 560fda1: New package `acture-e2e-playwright` — the e2e testing consumer surface, bound to Playwright. Two layers: a pure, Playwright-free **sequence engine** (`recordSequence` / `replaySequence` / `replayTest` over `{commandId, params}` sequences) that mirrors the new `docs/hand-written-command-sequence.md` reference line-for-line, and the **Playwright glue** (`dispatchInPage`, `clickCommand`, `commandSelector`, `replaySequenceInPage`, `replayTestInPage`, plus a `test` fixture at `acture-e2e-playwright/fixture`). Playwright is type-only in the main entry; the runtime import is isolated in `./fixture`.

  Part of the v1.7 macros + e2e increment. The shared command-sequence concept (record / compose / replay) ships as a hand-written reference doc plus the `acture-macros` and `acture-e2e` consumer skills — no `acture-macros` or `acture-sequence` package. Only the tool-bound piece earns a package.
