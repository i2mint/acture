# acture

> Get AI-agentic help building a command-dispatch architecture — one schema, and the palette, hotkeys, AI tools, MCP, and tests fall out of it.

acture is **a development tool** for building, migrating to, and maintaining a command-dispatch architecture in TypeScript/React apps. Define an operation once as a command; it becomes a command palette entry, a keyboard shortcut, an AI tool call, an MCP server tool, a test action, and (post-v1) a macro step.

It is delivered primarily as **skills, patterns, and codemods** an AI agent uses to write command dispatch *into your project* — adapted to your stack and your preferences. The `acture-*` npm packages are an **optional accelerator**: ready-made, tested implementations the agent can reach for instead of hand-writing similar code.

**You can use acture without adding a single `acture-*` dependency to your project.** Whether you take on a dependency is always your explicit, per-piece choice — see [`docs/positioning.md`](docs/positioning.md), the canonical statement of what acture is and what it asks of you.

## Install (optional — the accelerator packages)

You only install what you decide to reuse. Every package is independently optional; the agent-written path needs none of them.

```bash
pnpm add acture                  # core registry + dispatcher + schema bridge (optional even this)
pnpm add acture-state-zustand    # state adapter (or acture-state-redux)
pnpm add acture-palette-react    # command palette UI (on cmdk)
pnpm add acture-hotkeys          # keyboard shortcuts (on tinykeys)
pnpm add acture-mcp-server              # MCP server projection
pnpm add acture-ai-vercel        # AI tool definitions (on the Vercel AI SDK)
pnpm add acture-migration        # strangler-fig adoption primitives
# …plus acture-forms-autoform and acture-forms-rjsf for parameterized commands.

# Dev / CI tooling:
pnpm add -D acture-build-tier              # build-step @stable/@experimental/@internal/@deprecated mirror
pnpm add -D acture-cli                     # `acture compare-schemas` / `acture snapshot` CLI
pnpm add -D acture-devtools                # embeddable <Inspector /> for dev builds
pnpm add -D eslint-plugin-acture-migration  # ESLint rule that flags stale wrapMutation wrappers
```

> The 13 sub-packages publish unscoped as `acture-*` — the `@acture` npm scope was unavailable. `acture` is reserved on npm and PyPI; a real Python companion is post-v1.

## Status

**v1.5 — repositioning + namespace migration (2026-05-14).** Fifteen packages ship in the workspace. v1.5 clarified the canonical positioning ([`docs/positioning.md`](docs/positioning.md)), added the `acture-consumer-integration` skill, and renamed all 13 sub-packages from `@acture/*` to unscoped `acture-*`. `acture@1.1.0` and `eslint-plugin-acture-migration@1.0.0` are live on npm; the 13 renamed packages publish next under their new names.

| Package | Role |
| --- | --- |
| [`acture`](packages/core) | core registry, dispatcher, when-clause DSL, schema bridge, `enableTierWarnings` |
| [`acture-state-zustand`](packages/state-zustand) | StateAdapter for zustand+immer |
| [`acture-state-redux`](packages/state-redux) | StateAdapter for Redux Toolkit |
| [`acture-palette-react`](packages/palette-react) | command palette with parameterized-command UX |
| [`acture-hotkeys`](packages/hotkeys) | tinykeys-backed keyboard bindings |
| [`acture-forms-autoform`](packages/forms-autoform) | Zod-native form adapter |
| [`acture-forms-rjsf`](packages/forms-rjsf) | JSON-Schema form adapter (rjsf) |
| [`acture-mcp-server`](packages/mcp) | MCP server projection |
| [`acture-ai-vercel`](packages/ai-vercel) | Vercel AI SDK tool definitions |
| [`acture-migration`](packages/migration) | strangler-fig primitives: `wrapMutation`, `actureMiddleware`, `createDomInterceptor`, `chooseImplementation`, `shadowCompare` |
| [`acture-build-tier`](packages/build-tier) | build-step plugin that mirrors `@stable`/`@experimental`/`@internal`/`@deprecated` JSDoc into runtime `tier`; regex default + AST mode polish |
| [`acture-cli`](packages/cli) | `acture compare-schemas` (CI gating, deep nested diffs) + `acture snapshot` (registry → JSON) |
| [`acture-devtools`](packages/devtools) | embeddable `<Inspector />` and `instrumentRegistry` dispatch log |
| [`acture-codemods`](packages/codemods) | Codemod CLI: all five research-4 §B.5 codemods now shipped (`wrap-handler-with-mutation`, `extract-onclick-to-command`, `redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`). `--dry-run` + `--json` for agents |
| [`eslint-plugin-acture-migration`](packages/eslint-plugin-acture-migration) | ESLint rule `acture/no-stale-wrap-mutation` — flags `wrapMutation(...)` wrappers whose result is never used (the migration has graduated; author with `defineCommand`) |

Worked examples:

- [`examples/greenfield/graph-editor/`](examples/greenfield/graph-editor) — greenfield path. Now wires `acture-devtools`.
- [`examples/drop-in/`](examples/drop-in) — 5-minute bolt-on path.
- [`examples/migration/zustand-wrap/`](examples/migration/zustand-wrap) — strangler-fig path with side-by-side [`before/`](examples/migration/zustand-wrap/before) and [`after/`](examples/migration/zustand-wrap/after) apps. 6 wrapped commands + 2 graduated.
- [`examples/migration/redux-wrap/`](examples/migration/redux-wrap) — **new in v1.2.** Redux Toolkit cart with `actureMiddleware` end-to-end. UI dispatch and palette dispatch converge on the same store, observed as one stream.

Agent skills live under [`.claude/skills/`](.claude/skills/): five migration-track skills (`migration-diagnose` → `migration-plan` → `migration-scaffold` → `migration-wrap` → `migration-graduate`), the `acture-consumer-integration` foundation for building consumers in a target project, plus the architecture / tier / schema / hard-don'ts dev-skill primers.

What's new in v1.5 (repositioning + namespace migration):

- **Canonical positioning.** [`docs/positioning.md`](docs/positioning.md) states what acture is — a dev-tool-first way to get AI-agentic help with command dispatch — and the two flexibility dimensions (core vs strangler-fig; agent-written vs package-reuse). It governs every user-facing word.
- **`acture-consumer-integration` skill.** The foundational pattern for building a consumer (palette, hotkeys, MCP, AI, e2e, …) in a target project: the agent-written path is always viable, packages are an opt-in accelerator, and tool-library choices belong to the user. Dev skills now load it whenever a task touches a consumer.
- **Namespace migration.** All 13 `@acture/*` packages renamed to unscoped `acture-*`.

What's new in v1.4 (release-readiness theme):

- **`eslint-plugin-acture-migration`.** One rule, `acture/no-stale-wrap-mutation`: flags `wrapMutation(...)` calls whose result is never used — the strangler-fig wrapper has graduated and should become a `defineCommand`. Single-file, conservative detection. +16 tests. Closes a research-4 backlog item carried since v1.1.
- **Fresh-agent release-gate test.** A fresh agent drove `acture-codemods` from its README alone. The codemod engine + CLI passed; the README's pre-publish `npx` invocation and undocumented `--option` keys did not. Full assessment in [`docs/fresh-agent-test-results.md`](docs/fresh-agent-test-results.md); fixes carried to v1.5.

What's new in v1.3:

- **Codemod set complete.** Three new codemods finish research-4 §B.5: `redux-action-to-command` (RTK action calls → registry.dispatch), `usestate-mutation-to-command` (setX-only handlers → wrapMutation), `rtk-thunk-to-command` (`createAsyncThunk` → `defineCommand`). +30 tests; manifest now has zero `status: 'planned'` entries.

What's new in v1.2:

- **`acture-codemods` package.** `npx acture-codemods <name>` with two shipped transforms (`wrap-handler-with-mutation`, `extract-onclick-to-command`), a manifest of planned ones, and `--dry-run` + `--json` so agents can preview before applying.
- **`createDomInterceptor`.** Companion to `actureMiddleware` — a delegated DOM listener routes `data-acture-command` events through the registry. Plain TS, works in any framework, opt-in scoping per root.
- **RTK worked example.** `examples/migration/redux-wrap/` closes the documentation gap for `actureMiddleware`. UI dispatch + palette dispatch converge on the same store, observed as one event stream.
- **AST mode for `acture-build-tier`.** Second entry point at `acture-build-tier/ast` uses ts-morph for projects where the regex's 4000-char lookahead is insufficient. ts-morph is an optional peer dep.
- **Deep nested diffs in `compare-schemas`.** The classifier now recurses through nested object properties and array `items`. Change paths read `inputSchema.properties.user.properties.email` instead of stopping at the top level.

Previously in v1.0 / v1.1:

- **Tier system enforced.** Mark a command `@experimental`, `@internal`, or `@deprecated <reason>` in JSDoc; the build step mirrors the tag into runtime metadata. `registry.list({ tiers })` and the MCP / AI / palette projections filter accordingly. `@internal` commands carry a module-scoped Symbol token and reject cross-module `dispatch`.
- **`acture compare-schemas`.** Diff two registry snapshots, classify per research-5 §6.1, gate CI with `--fail-on major`. Description changes are MAJOR by default; downgradable per-invocation via `--allow-description-edits`.
- **`acture snapshot`.** Load a registry config (`./registry.mjs` default-exporting the registry) and emit a JSON snapshot suitable for `compare-schemas`.
- **`<Inspector registry={...} />`.** Embeddable React dev-tool with a command list (tier-filterable), dispatch log, and live when-clause evaluator. Mount it behind a toggle in any greenfield app.
- **`enableTierWarnings(registry)`.** Once-per-process `console.warn` on first dispatch of each `@experimental` command. Suppress with `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`.

What's next: see [`docs/roadmap.md`](docs/roadmap.md) for the forward plan and [`docs/next_session.md`](docs/next_session.md) for the immediate next step (a positioning-alignment review of `acture` core).

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
- **Research:** [`docs/research/`](docs/research/) — six research findings (1–6) that informed the plan (research-6: the cross-language TypeScript ↔ Python story).
- **Patterns:** [`docs/parameterized_command_palette_guide.md`](docs/parameterized_command_palette_guide.md) — implementation patterns.
- **For agents:** [`AGENTS.md`](AGENTS.md) and [`.claude/skills/`](.claude/skills/).

## License

Apache-2.0.
