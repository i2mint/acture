# acture

> One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.

Acture is a typed, schema-driven command dispatch library for TypeScript/React applications. Define an operation once; it becomes available as a command palette entry, a keyboard shortcut, an AI tool call, an MCP server tool, a test action, and (post-v1) a macro step.

## Status

**v0.1.0-dev (Phase 3 DONE, 2026-05-13).** Ten packages ship in the workspace:

| Package | Role |
| --- | --- |
| [`acture`](packages/core) | core registry, dispatcher, when-clause DSL, schema bridge |
| [`@acture/state-zustand`](packages/state-zustand) | StateAdapter for zustand+immer |
| [`@acture/state-redux`](packages/state-redux) | StateAdapter for Redux Toolkit |
| [`@acture/palette-react`](packages/palette-react) | command palette with parameterized-command UX |
| [`@acture/hotkeys`](packages/hotkeys) | tinykeys-backed keyboard bindings |
| [`@acture/forms-autoform`](packages/forms-autoform) | Zod-native form adapter |
| [`@acture/forms-rjsf`](packages/forms-rjsf) | JSON-Schema form adapter (rjsf) |
| [`@acture/mcp`](packages/mcp) | MCP server projection |
| [`@acture/ai-vercel`](packages/ai-vercel) | Vercel AI SDK tool definitions |
| [`@acture/migration`](packages/migration) | strangler-fig primitives: `wrapMutation`, `actureMiddleware`, `chooseImplementation`, `shadowCompare` |

Worked examples:

- [`examples/greenfield/graph-editor/`](examples/greenfield/graph-editor) — greenfield path.
- [`examples/drop-in/`](examples/drop-in) — 5-minute bolt-on path.
- [`examples/migration/zustand-wrap/`](examples/migration/zustand-wrap) — strangler-fig path with side-by-side [`before/`](examples/migration/zustand-wrap/before) and [`after/`](examples/migration/zustand-wrap/after) apps. 6 wrapped commands + 2 graduated.

Five migration-track agent skills live under [`.claude/skills/`](.claude/skills/): `migration-diagnose`, `migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`.

Phase 4 (tier-system enforcement, `acture compare-schemas` CLI, devtools, hardening) is next — see [`docs/next_session.md`](docs/next_session.md).

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
