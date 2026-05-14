# acture-e2e-playwright

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

End-to-end testing for [acture](https://npm.im/acture) registries, bound to [Playwright](https://playwright.dev). Record, compose, and replay command sequences; an **e2e test is a macro with assertions**.

Playwright is the tool choice bound here. Cypress, Vitest browser mode, or a custom runner are equally valid — for those, the **agent-written path** applies: adapt the sequence engine ([`docs/hand-written-command-sequence.md`](../../docs/hand-written-command-sequence.md)) to the runner's page API. See the `acture-e2e` skill.

## Install

```sh
pnpm add -D acture-e2e-playwright @playwright/test acture
```

## The two layers

### 1. The sequence engine — pure, Playwright-free

Record / compose / replay of `{commandId, params}` sequences. This is the part you could hand-write and own outright (it mirrors [`docs/hand-written-command-sequence.md`](../../docs/hand-written-command-sequence.md) line-for-line) — installed here so it is tested rather than re-derived.

```ts
import { recordSequence, replaySequence, replayTest } from 'acture-e2e-playwright';

// Record: wrap dispatch, accumulate steps. Reversible — never on a prod registry.
const recording = recordSequence(registry);
// ... user (or test) drives the app ...
recording.stop();
const macro = recording.steps;          // [{ commandId, params }, ...] — plain JSON

// Compose: sequences are arrays.
const onboarding = [...createProject, ...inviteTeam];

// Replay: dispatch each step. Never throws — errors-as-data preserved.
const result = await replaySequence(registry, macro);   // { ok, results }

// Test: a sequence with assertions interleaved. Throws → the runner reports.
await replayTest(registry, [
  { commandId: 'app.count.set', params: { value: 2 } },
  { assert: (ctx) => expect(getCount(ctx)).toBe(2) },
  { commandId: 'app.count.inc' },
  { assert: (ctx) => expect(getCount(ctx)).toBe(3) },
]);
```

This layer is the **unit / component-level** adapter of the test pyramid — drive commands directly, assert state, no browser.

### 2. The Playwright glue — the tool-bound layer

`dispatchInPage`, `clickCommand`, `commandSelector`, `replaySequenceInPage`, `replayTestInPage`. The **E2E-level** adapter: drive commands through a real browser.

The app under test must expose its registry on the page in a test/dev build:

```ts
// in the app, behind an `if (import.meta.env.DEV)` guard:
window.__actureRegistry = registry;
```

Then, from a test:

```ts
import { dispatchInPage, clickCommand } from 'acture-e2e-playwright';

// Dispatch through the page's registry — unit-level intent, real browser.
const result = await dispatchInPage(page, 'app.data.applyFilter', { column: 'age' });

// Or drive it through the real UI via the data-command convention.
await clickCommand(page, 'app.data.applyFilter');   // clicks [data-command="..."]
```

`@playwright/test` is imported **type-only** in this entry — it carries zero runtime Playwright dependency.

### The `test` fixture — runtime Playwright

```ts
import { test, expect } from 'acture-e2e-playwright/fixture';

test('zoom-to-fit works from the palette', async ({ commands }) => {
  await commands.click('app.zoom.fit');
  const result = await commands.dispatch('app.count.inc');
  expect(result.ok).toBe(true);

  await commands.replayTest([
    { commandId: 'app.data.applyFilter', params: { column: 'age' } },
    { assert: (page) => expect(page.locator('.row')).toHaveCount(3) },
  ]);
});
```

Configure the registry key per-project in `playwright.config.ts`:

```ts
export default defineConfig({
  use: { registryKey: 'myApp.registry' },   // default: '__actureRegistry'
});
```

## The test pyramid, one intent

A test sequence is written **once**; only the adapter changes per pyramid level (journal article §3.4):

| Level | Adapter | API |
| --- | --- | --- |
| Unit / API | dispatch directly | `replayTest(registry, sequence)` |
| Component | dispatch through a rendered component | adapt — see the `acture-e2e` skill |
| E2E | dispatch through a real browser | `replayTestInPage(page, sequence)` / the `commands` fixture |

## Errors as data

`dispatchInPage` and `replaySequenceInPage` never throw — a failed command is `{ ok: false, error }`, preserved across the page boundary. If the app has not exposed its registry, you get an actionable `{ ok: false, error: { code: 'bridge_not_installed' } }` rather than an opaque `undefined`. `replayTest` / `replayTestInPage` *do* throw — that is the protocol every test runner speaks.

## See also

- [`docs/hand-written-command-sequence.md`](../../docs/hand-written-command-sequence.md) — the reproducible reference; hand-write the engine instead of installing.
- [`acture-e2e`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-e2e/SKILL.md) skill — the consumer-integration workflow, including other runners.
- [`acture-macros`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-macros/SKILL.md) skill — record/replay as a macros surface (no package — pattern + skill).
