# acture

> One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.

Acture is a typed, schema-driven command dispatch library for TypeScript/React applications. Define an operation once; it becomes available as a command palette entry, a keyboard shortcut, an AI tool call, an MCP server tool, a test action, and (post-v1) a macro step.

## Install

```bash
pnpm add acture                   # core
pnpm add @acture/state-zustand    # state adapter (or @acture/state-redux)
pnpm add @acture/palette-react    # command palette UI
pnpm add @acture/hotkeys          # keyboard shortcuts
pnpm add @acture/mcp              # MCP server projection
pnpm add @acture/ai-vercel        # Vercel AI tool definitions
pnpm add @acture/migration        # strangler-fig adoption primitives
# …plus @acture/forms-autoform and @acture/forms-rjsf for parameterized commands.

# Dev / CI tooling (post-v1.0):
pnpm add -D @acture/build-tier    # build-step @stable/@experimental/@internal/@deprecated mirror
pnpm add -D @acture/cli           # `acture compare-schemas` / `acture snapshot` CLI
pnpm add -D @acture/devtools      # embeddable <Inspector /> for dev builds
```

> The `acture` name is also reserved on PyPI as a placeholder; a real Python companion is post-v1. `pip install acture` gives you a no-op package whose only purpose is to keep the name ours.

## Status

**v1.3.0 (Phase 4 DONE + v1.1 + v1.2 + v1.3 increments, 2026-05-13).** Fourteen packages ship in the workspace:

| Package | Role |
| --- | --- |
| [`acture`](packages/core) | core registry, dispatcher, when-clause DSL, schema bridge, `enableTierWarnings` |
| [`@acture/state-zustand`](packages/state-zustand) | StateAdapter for zustand+immer |
| [`@acture/state-redux`](packages/state-redux) | StateAdapter for Redux Toolkit |
| [`@acture/palette-react`](packages/palette-react) | command palette with parameterized-command UX |
| [`@acture/hotkeys`](packages/hotkeys) | tinykeys-backed keyboard bindings |
| [`@acture/forms-autoform`](packages/forms-autoform) | Zod-native form adapter |
| [`@acture/forms-rjsf`](packages/forms-rjsf) | JSON-Schema form adapter (rjsf) |
| [`@acture/mcp`](packages/mcp) | MCP server projection |
| [`@acture/ai-vercel`](packages/ai-vercel) | Vercel AI SDK tool definitions |
| [`@acture/migration`](packages/migration) | strangler-fig primitives: `wrapMutation`, `actureMiddleware`, `createDomInterceptor`, `chooseImplementation`, `shadowCompare` |
| [`@acture/build-tier`](packages/build-tier) | build-step plugin that mirrors `@stable`/`@experimental`/`@internal`/`@deprecated` JSDoc into runtime `tier`; regex default + AST mode polish |
| [`@acture/cli`](packages/cli) | `acture compare-schemas` (CI gating, deep nested diffs) + `acture snapshot` (registry → JSON) |
| [`@acture/devtools`](packages/devtools) | embeddable `<Inspector />` and `instrumentRegistry` dispatch log |
| [`@acture/codemods`](packages/codemods) | Codemod CLI: all five research-4 §B.5 codemods now shipped (`wrap-handler-with-mutation`, `extract-onclick-to-command`, `redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`). `--dry-run` + `--json` for agents |

Worked examples:

- [`examples/greenfield/graph-editor/`](examples/greenfield/graph-editor) — greenfield path. Now wires `@acture/devtools`.
- [`examples/drop-in/`](examples/drop-in) — 5-minute bolt-on path.
- [`examples/migration/zustand-wrap/`](examples/migration/zustand-wrap) — strangler-fig path with side-by-side [`before/`](examples/migration/zustand-wrap/before) and [`after/`](examples/migration/zustand-wrap/after) apps. 6 wrapped commands + 2 graduated.
- [`examples/migration/redux-wrap/`](examples/migration/redux-wrap) — **new in v1.2.** Redux Toolkit cart with `actureMiddleware` end-to-end. UI dispatch and palette dispatch converge on the same store, observed as one stream.

Agent skills live under [`.claude/skills/`](.claude/skills/): five migration-track skills (`migration-diagnose`, `migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`) plus the architecture / tier / schema / hard-don'ts primer skills.

What's new in v1.3:

- **Codemod set complete.** Three new codemods finish research-4 §B.5: `redux-action-to-command` (RTK action calls → registry.dispatch), `usestate-mutation-to-command` (setX-only handlers → wrapMutation), `rtk-thunk-to-command` (`createAsyncThunk` → `defineCommand`). +30 tests; manifest now has zero `status: 'planned'` entries.

What's new in v1.2:

- **`@acture/codemods` package.** `npx @acture/codemods <name>` with two shipped transforms (`wrap-handler-with-mutation`, `extract-onclick-to-command`), a manifest of planned ones, and `--dry-run` + `--json` so agents can preview before applying.
- **`createDomInterceptor`.** Companion to `actureMiddleware` — a delegated DOM listener routes `data-acture-command` events through the registry. Plain TS, works in any framework, opt-in scoping per root.
- **RTK worked example.** `examples/migration/redux-wrap/` closes the documentation gap for `actureMiddleware`. UI dispatch + palette dispatch converge on the same store, observed as one event stream.
- **AST mode for `@acture/build-tier`.** Second entry point at `@acture/build-tier/ast` uses ts-morph for projects where the regex's 4000-char lookahead is insufficient. ts-morph is an optional peer dep.
- **Deep nested diffs in `compare-schemas`.** The classifier now recurses through nested object properties and array `items`. Change paths read `inputSchema.properties.user.properties.email` instead of stopping at the top level.

Previously in v1.0 / v1.1:

- **Tier system enforced.** Mark a command `@experimental`, `@internal`, or `@deprecated <reason>` in JSDoc; the build step mirrors the tag into runtime metadata. `registry.list({ tiers })` and the MCP / AI / palette projections filter accordingly. `@internal` commands carry a module-scoped Symbol token and reject cross-module `dispatch`.
- **`acture compare-schemas`.** Diff two registry snapshots, classify per research-5 §6.1, gate CI with `--fail-on major`. Description changes are MAJOR by default; downgradable per-invocation via `--allow-description-edits`.
- **`acture snapshot`.** Load a registry config (`./registry.mjs` default-exporting the registry) and emit a JSON snapshot suitable for `compare-schemas`.
- **`<Inspector registry={...} />`.** Embeddable React dev-tool with a command list (tier-filterable), dispatch log, and live when-clause evaluator. Mount it behind a toggle in any greenfield app.
- **`enableTierWarnings(registry)`.** Once-per-process `console.warn` on first dispatch of each `@experimental` command. Suppress with `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`.

What's next: see [`docs/next_session.md`](docs/next_session.md) for the v1.4 backlog.

## Three paths

Acture serves three positioning paths from the same core. Same registry, dispatcher, and schema bridge — different adapter packages and different documentation.

- **Greenfield-pure** — Design your app command-dispatch-first from day one. Install `acture` + `@acture/state-zustand` + the consumer adapters you want.
- **Strangler-fig migration** — Use Claude Code with `@acture/migration` to introduce command dispatch in an existing codebase incrementally, then graduate.
- **Drop-in footprint-minimizer** — Bolt a command palette + MCP server onto an existing app in 5 minutes. No deeper migration intent.

## What it isn't

- Not a state library. Acture ships an adapter interface (`StateAdapter<S>`) and reference adapters; the user's app keeps its existing state library.
- Not a React library. Core has zero React dependencies; React lives in adapter packages.
- Not opinionated about your UI kit. Plug in your own design system via adapters.

## Documentation map

- **Conceptual:** [`docs/command_dispatch_journal_article.md`](docs/command_dispatch_journal_article.md) — the central architecture paper.
- **Plan:** [`docs/v1_plan.md`](docs/v1_plan.md) — research-informed v1 plan.
- **Implementation:** [`docs/implementation_plan.md`](docs/implementation_plan.md) — phase-by-phase guide with gates.
- **Design synthesis:** [`docs/redesign_takeaways.md`](docs/redesign_takeaways.md) — opinionated commitments and hard "don'ts."
- **Research:** [`docs/research/`](docs/research/) — five research findings (1–5) that informed the v1 plan.
- **Patterns:** [`docs/parameterized_command_palette_guide.md`](docs/parameterized_command_palette_guide.md) — implementation patterns.
- **References:** [`docs/reference_notes.md`](docs/reference_notes.md) — distilled per-article notes on the 51 sources.
- **For agents:** [`AGENTS.md`](AGENTS.md) and [`.claude/skills/`](.claude/skills/).

## License

Apache-2.0.
