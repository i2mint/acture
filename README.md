# acture

> Get AI-agentic help building a command-dispatch architecture — one schema, and the palette, hotkeys, AI tools, MCP, and tests fall out of it.

acture is **a development tool** for building, migrating to, and maintaining a command-dispatch architecture in TypeScript/React apps. Define an operation once as a command; it becomes a command palette entry, a keyboard shortcut, an AI tool call, an MCP server tool, a macro step, an end-to-end test action, an undo entry, and a telemetry event — and, via the [`acture`](https://pypi.org/project/acture/) PyPI client, a Python call.

It is delivered primarily as **skills, patterns, and codemods** an AI agent uses to write command dispatch *into your project* — adapted to your stack and your preferences. The `acture-*` npm packages are an **optional accelerator**: ready-made, tested implementations the agent can reach for instead of hand-writing similar code.

**You can use acture without adding a single `acture-*` dependency to your project.** Whether you take on a dependency is always your explicit, per-piece choice — see [`docs/positioning.md`](docs/positioning.md), the canonical statement of what acture is and what it asks of you.

## Install (optional — the accelerator packages)

You only install what you decide to reuse. Every package is independently optional; the agent-written path needs none of them.

```bash
pnpm add acture                  # core registry + dispatcher + schema bridge (optional even this)
pnpm add acture-state-zustand    # state adapter (or acture-state-redux)
pnpm add acture-palette-react    # command palette UI (on cmdk)
pnpm add acture-hotkeys          # keyboard shortcuts (on tinykeys)
pnpm add acture-mcp-server       # MCP server projection
pnpm add acture-ai-vercel        # AI tool definitions (on the Vercel AI SDK)
pnpm add acture-migration        # strangler-fig adoption primitives
pnpm add acture-telemetry        # observe every dispatch via a sink
pnpm add acture-undo             # patch-based undo/redo over a PatchCapableAdapter
# …plus acture-forms-autoform and acture-forms-rjsf for parameterized commands.

# Dev / CI tooling:
pnpm add -D acture-build-tier              # build-step @stable/@experimental/@internal/@deprecated mirror
pnpm add -D acture-cli                     # `acture compare-schemas` / `acture snapshot` CLI
pnpm add -D acture-devtools                # embeddable <Inspector /> for dev builds
pnpm add -D acture-e2e-playwright          # macro / e2e sequence engine + Playwright fixture
pnpm add -D acture-test-property           # fast-check property tests over the registry
pnpm add -D eslint-plugin-acture-migration  # ESLint rules: stale wrapMutation, .describe() discipline
```

Python:

```bash
pip install acture  # MCP client facade — Mapping[str, Command] over any acture-mcp-server
```

> The 18 sub-packages publish unscoped as `acture-*` — the `@acture` npm scope was unavailable. The MCP adapter is published as `acture-mcp-server` because the unscoped `acture-mcp` collided with an unrelated project. `acture` is the single namespace on both npm (the core registry) and PyPI (the Python MCP client).

## Status

**v1.13 — chain end (2026-05-15).** 19 npm packages live + 1 PyPI package (`acture`, the Python MCP client). 489 npm package tests + 41 example tests + 23 Python tests, all green. 26 agent skills + 7 reproducibility docs. Phases 0–4 of the original v1 plan are complete; work since has been small, tracked increments. See [`docs/roadmap.md`](docs/roadmap.md) for the live status and the three remaining post-v1 candidates (`acture-state-jotai`, `acture-state-valtio`, `acture-sandbox`).

| Package | Role |
| --- | --- |
| [`acture`](packages/core) | core registry, dispatcher, when-clause DSL, schema bridge, state-adapter interface |
| [`acture-state-zustand`](packages/state-zustand) | StateAdapter for zustand+immer |
| [`acture-state-redux`](packages/state-redux) | StateAdapter for Redux Toolkit |
| [`acture-palette-react`](packages/palette-react) | command palette with parameterized-command UX (on cmdk) |
| [`acture-hotkeys`](packages/hotkeys) | tinykeys-backed keyboard bindings |
| [`acture-forms-autoform`](packages/forms-autoform) | Zod-native form adapter |
| [`acture-forms-rjsf`](packages/forms-rjsf) | JSON-Schema form adapter (rjsf) |
| [`acture-mcp-server`](packages/mcp) | MCP server projection (published as `acture-mcp-server`; `acture-mcp` was taken) |
| [`acture-ai-vercel`](packages/ai-vercel) | Vercel AI SDK tool definitions |
| [`acture-migration`](packages/migration) | strangler-fig primitives: `wrapMutation`, `actureMiddleware`, `createDomInterceptor`, `chooseImplementation`, `shadowCompare` |
| [`acture-telemetry`](packages/telemetry) | observe every dispatch via a sink; optional pass-through `redact` / `sampler` |
| [`acture-undo`](packages/undo) | patch-based undo/redo over a `PatchCapableAdapter`; transactions; `onEffect` host callback |
| [`acture-build-tier`](packages/build-tier) | build-step `@stable`/`@experimental`/`@internal`/`@deprecated` JSDoc → runtime `tier` mirror; regex + AST modes |
| [`acture-cli`](packages/cli) | `acture compare-schemas` (CI gating, deep nested diffs) + `acture snapshot` (registry → JSON) |
| [`acture-devtools`](packages/devtools) | embeddable `<Inspector />`, `instrumentRegistry` dispatch log, `enableTierWarnings` |
| [`acture-codemods`](packages/codemods) | five research-4 §B.5 codemods (`wrap-handler-with-mutation`, `extract-onclick-to-command`, `redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`); `--dry-run` + `--json` for agents |
| [`acture-e2e-playwright`](packages/e2e-playwright) | pure sequence engine (`recordSequence` / `replaySequence` / `replayTest`) + Playwright fixture; substrate for macros + e2e + property tests |
| [`acture-test-property`](packages/test-property) | fast-check arbitraries over the registry; random `CommandSequence`s replayed end-to-end with invariant assertions |
| [`eslint-plugin-acture-migration`](packages/eslint-plugin-acture-migration) | `acture/no-stale-wrap-mutation` + `acture/require-param-describe` |
| [`acture` (PyPI)](python) | thin MCP-client facade — `Mapping[str, Command]` over any `acture-mcp-server`; errors-as-data preserved across the language boundary |

Worked examples:

- [`examples/greenfield/graph-editor/`](examples/greenfield/graph-editor) — greenfield path; wires `acture-devtools`.
- [`examples/drop-in/`](examples/drop-in) — 5-minute bolt-on path.
- [`examples/migration/zustand-wrap/`](examples/migration/zustand-wrap) — strangler-fig path with side-by-side [`before/`](examples/migration/zustand-wrap/before) and [`after/`](examples/migration/zustand-wrap/after) apps; 6 wrapped commands + 2 graduated.
- [`examples/migration/redux-wrap/`](examples/migration/redux-wrap) — Redux Toolkit cart with `actureMiddleware` end-to-end. UI dispatch + palette dispatch converge on the same store, observed as one stream.

Agent skills live under [`.claude/skills/`](.claude/skills/): 21 `acture-*` (dev / foundation / per-consumer-surface) + 5 `migration-*` (strangler-fig workflow: `migration-diagnose` → `migration-plan` → `migration-scaffold` → `migration-wrap` → `migration-graduate`). Reproducibility references for each major package live under `docs/hand-written-*.md`.

### What's new since v1.5

- **v1.13** — `acture` on PyPI graduated from name-reservation placeholder to a real thin MCP-client facade per research-6. `ActureClient` (a `Mapping[str, Command]`), `Command`, `ActureError`, `stdio_transport` / `http_transport`. Cross-language semver is lockstep (driven by `scripts/sync-python-version.mjs`).
- **v1.12** — `acture-test-property`. fast-check arbitraries; random `CommandSequence`s replayed through the v1.7 sequence engine; invariants asserted end-of-sequence; shrunk counter-examples replayable verbatim.
- **v1.11** — `acture-telemetry` and `acture-undo`. Telemetry observes every dispatch via a configurable sink (optional `redact` / `sampler`). Undo is patch-based over a `PatchCapableAdapter`, transactions group N dispatches, `onEffect` routes effect lifecycle to the host.
- **v1.10** — `acture/require-param-describe` lint rule (Zod params missing `.describe()`) and an MCP spec-version pin test.
- **v1.9** — `acture-codemods` CLI/README polish + `docs/ai-codemod-recipe.md`; greenfield agent-track skills (`acture-greenfield-state-model`, `acture-greenfield-bootstrap`).
- **v1.8** — per-surface consumer skills for hotkeys, MCP, and AI.
- **v1.7** — `acture-e2e-playwright`; macros + e2e tooling under the same sequence engine (`docs/hand-written-command-sequence.md`).
- **v1.6** — core positioning review; `enableTierWarnings` moved to `acture-devtools`; `docs/hand-written-registry.md` + `acture-greenfield` skill.
- **v1.5** — repositioning + namespace migration (all `@acture/*` → unscoped `acture-*`).

What's next: see [`docs/roadmap.md`](docs/roadmap.md) for the forward plan and [`docs/next_session.md`](docs/next_session.md) for the active handoff.

## Two flexibility dimensions

acture adapts along two independent axes — and the agent keeps both open rather than defaulting one. (Full statement in [`docs/positioning.md`](docs/positioning.md).)

- **Core vs strangler-fig** — design command dispatch in from day one, or wrap it into an existing codebase incrementally and graduate over time.
- **Agent-written vs package-reuse** — have the agent write the integration into your project (zero acture dependency, maximum adaptability), or install an `acture-*` package (less code to own, tested — at the cost of a dependency). Decided per consumer, not per project.

## What it isn't

- **Not a framework you must depend on.** acture is a development tool first. An agent wielding its skills can stand up a full command-dispatch architecture in a project whose `package.json` never gains an `acture-*` line. Depending on a package is always your explicit, opt-in choice.
- Not a state library. acture ships an adapter interface (`StateAdapter<S>`) and reference adapters; your app keeps its existing state library.
- Not a React library. Core has zero React dependencies; React lives in adapter packages.
- Not opinionated about your UI kit or your tools. Bring your own design system, your own e2e runner, your own AI SDK — acture's per-tool packages each integrate *one* known-good choice, never the only choice.

## Documentation map

- **Positioning (canonical):** [`docs/positioning.md`](docs/positioning.md) — what acture is, the dev-tool-first principle, the two dimensions.
- **Conceptual:** [`docs/command_dispatch_journal_article.md`](docs/command_dispatch_journal_article.md) — the central architecture paper.
- **Forward plan + status:** [`docs/roadmap.md`](docs/roadmap.md) — what's done, what's next, what's deferred.
- **Design synthesis:** [`docs/redesign_takeaways.md`](docs/redesign_takeaways.md) — opinionated commitments and hard "don'ts."
- **v1 plan (historical):** [`docs/v1_plan.md`](docs/v1_plan.md) / [`docs/implementation_plan.md`](docs/implementation_plan.md) — phases 0–4, all complete.
- **Research:** [`docs/research/`](docs/research/) — six filed research findings (1–6) that informed the plan, plus a drafted Prompt 7 (extension sandboxing) gated on user opt-in.
- **Patterns:** [`docs/parameterized_command_palette_guide.md`](docs/parameterized_command_palette_guide.md) — implementation patterns.
- **For agents:** [`AGENTS.md`](AGENTS.md) and [`.claude/skills/`](.claude/skills/).

## License

Apache-2.0.
