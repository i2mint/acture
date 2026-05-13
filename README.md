# acture

> One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.

Acture is a typed, schema-driven command dispatch library for TypeScript/React applications. Define an operation once; it becomes available as a command palette entry, a keyboard shortcut, an AI tool call, an MCP server tool, a test action, and (post-v1) a macro step.

## Status

**v0.0.0 — name reserved on [npm](https://www.npmjs.com/package/acture) and [PyPI](https://pypi.org/project/acture/), no functionality yet.** First functional release ships in v0.1 after Phase 1 of the implementation plan. See [`docs/v1_plan.md`](docs/v1_plan.md) and [`docs/implementation_plan.md`](docs/implementation_plan.md) for the roadmap.

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
