# AGENTS.md — acture

You are an AI coding agent contributing to **acture**, a typed schema-driven command dispatch library for frontend applications. This file orients you. Read it first.

## What acture is

acture is **a place developers (human or AI agent) go to get AI-agentic help building, migrating to, and maintaining a command-dispatch architecture** — the architecture described in `docs/command_dispatch_journal_article.md`, built on three primitives (*state model*, *command registry*, *schema bridge*) that power eight consumer surfaces (command palette, keyboard shortcuts, AI tool calling, MCP server, end-to-end testing, telemetry, undo/redo, macros).

It is delivered primarily as **skills, patterns, and codemods**; the `acture-*` npm packages are an **optional accelerator**, not the product. **`docs/positioning.md` is canonical — read it before writing any user-facing text or designing any package or skill.**

Acture is the successor to `wrapex` (npm `command-wrapex`). That name carried migration-only framing that didn't fit acture's scope. `acture` is the single namespace on both npm (the core registry) and PyPI (the Python MCP client); the 18 sub-packages publish unscoped as `acture-*` (the `@acture` npm scope was unavailable). The MCP adapter is published as `acture-mcp-server` — the unscoped `acture-mcp` collided with an unrelated project.

## Positioning — the two flexibility dimensions

**Dev-tool-first principle:** a developer must be able to use acture purely as a development tool, with **no `acture-*` dependency added to their project** — unless they explicitly choose to. See `docs/positioning.md` for the full statement.

Every engagement sits on two independent dimensions; keep both open, never default one:

1. **Core vs strangler-fig** — command dispatch designed in, or wrapped into an existing codebase incrementally. (The conceptual paper's three "paths" — greenfield-pure, footprint-minimizer, strangler-fig — collapse onto this axis.)
2. **Agent-written vs package-reuse** — the agent writes the integration into the project (zero acture dependency, max adaptability), or installs an `acture-*` package (less code to own, tested, at the cost of a dependency). Decided **per consumer**.

**Standing rule:** any task touching a consumer surface or a consumer-specific `acture-*` package must also load the `acture-consumer-integration` skill.

## Where to look (in this order)

1. **`docs/command_dispatch_journal_article.md`** — the central conceptual paper. Three primitives, eight consumer surfaces, strangler-fig migration, the rule of three, the risks (inner platform effect, premature generalization, performance, architecture astronaut syndrome). READ FIRST.

2. **`docs/positioning.md`** — **canonical.** What acture is (dev-tool-first), the two flexibility dimensions, what the packages are for. Governs every user-facing word. READ SECOND.

3. **`docs/roadmap.md`** — the forward plan and status tracker: what's done, what's next, what's deferred. The live planning surface.

4. **`docs/next_session.md`** — the immediate handoff prompt for the current piece of work.

5. **`docs/redesign_takeaways.md`** — opinionated synthesis of design commitments. The "Hard don'ts" (§3) are the merge checklist.

6. **`docs/research/`** — six research findings (1–6) that informed the plan; research-6 is the cross-language (TypeScript ↔ Python) story. Read the one(s) relevant to your current task; do not read all six every session.

7. **`docs/v1_plan.md`** / **`docs/implementation_plan.md`** — the research-informed v1 plan and phase-by-phase guide. **Historical** — phases 0–4 are complete; forward work is tracked in `docs/roadmap.md`.

8. **`docs/parameterized_command_palette_guide.md`** — implementation patterns for parameter collection. (See `docs/research/acture_research_2 ...` for the UX research that overrides any conflict here.)

9. **`docs/reference_notes.md`** / **`docs/wrapex_carryover.md`** — distilled reference notes; the wrapex carryover audit.

10. **`.claude/skills/`** — task-specific skills you load when working on a particular concern.

## Skills index

Skills are how you load focused context. Each is a self-contained primer for one concern. Load only what you need.

| Skill | When to load |
| --- | --- |
| **Dev / foundation** | |
| `acture-architecture-primer` | Always, for any non-trivial task. The conceptual model + positioning in 5 minutes. |
| `acture-hard-donts` | Read before every non-trivial PR. The merge checklist of anti-patterns. |
| `acture-consumer-integration` | **Whenever a task touches a consumer surface or a consumer-specific `acture-*` package.** The dev-tool-first build pattern: agent-written vs package-reuse, tool-library choices belong to the user. |
| `acture-greenfield` + `acture-greenfield-state-model` + `acture-greenfield-bootstrap` | When standing up command dispatch in a **new** target project: state model first, then hand-write the registry primitive or install `acture` core. Backed by `docs/hand-written-registry.md`. |
| `acture-command-record-shape` | When defining or modifying the `CommandRecord` interface or its fields. |
| `acture-schema-bridge` | When working on Zod → JSON Schema projection, MCP tool emission, or AI tool definitions. |
| `acture-state-adapter` | When building or modifying a state adapter (zustand, redux, etc.) or the `StateAdapter<S>` interface. |
| `acture-tier-system` | When working on the @stable / @experimental / @internal / @deprecated tier system or `acture compare-schemas`. |
| `acture-migration-package` | When working on `acture-migration` (`wrapMutation`, `actureMiddleware`, `chooseImplementation`, `shadowCompare`) or the migration-track skills. |
| **Per-surface consumer skills** (build on `acture-consumer-integration`) | |
| `acture-palette-design` | When building or modifying the command palette UI, especially parameterized commands. |
| `acture-hotkeys` | When wiring keyboard shortcuts through the registry. |
| `acture-mcp` | When projecting the registry as an MCP server. |
| `acture-ai` | When projecting the registry as LLM tool definitions. |
| `acture-macros` | When recording / replaying command sequences as macros. |
| `acture-e2e` | When testing through the registry (Playwright, Cypress, vitest browser). |
| `acture-telemetry` | When observing dispatch via a sink. |
| `acture-undo` | When wiring patch-based undo/redo over a `PatchCapableAdapter`. |
| `acture-test-property` | When running fast-check property tests over the registry. |
| `acture-python` | When calling an `acture-mcp-server` from Python via the PyPI `acture` client. |
| **Migration workflow (strangler-fig, in order)** | |
| `migration-diagnose` | First step in adopting acture in an existing codebase: scan source for command candidates. |
| `migration-plan` | Second step: turn the diagnosis into a phased adoption backlog with explicit decisions. |
| `migration-scaffold` | Third step: install acture into the host app and wire the registry + state adapter. |
| `migration-wrap` | Fourth step: wrap existing handlers / store actions using `wrapMutation`. |
| `migration-graduate` | Final step: retire `wrapMutation` calls once the legacy handler is no longer needed. |

Most `acture-*` skills are **dev skills** (working *on* acture). The `migration-*` skills are the **strangler-fig workflow**. `acture-consumer-integration` is the foundation of the (growing) **consumer-integration** family — per-surface skills for building a consumer *in a target project*; `acture-greenfield` is the matching foundation for standing up the *core primitive* in a new project. Per `docs/positioning.md` §6, dev skills must load `acture-consumer-integration` whenever the work touches a consumer.

## The hard don'ts (merge checklist)

Full discussion is in `docs/redesign_takeaways.md` §3 and the `acture-hard-donts` skill. Headlines:

1. **No conditional logic in command metadata.** Command metadata is data, not code. If you want `command.if`, refactor.
2. **No god-package.** Core + per-consumer adapter packages.
3. **No business logic in adapter packages.** Adapters translate.
4. **No `if (mode === ...)` in shared helpers.**
5. **No `eval()`-ing LLM-produced strings.** Dispatcher validates and routes via `Map<string, Command>`.
6. **No coupling the registry to React.** Registry is plain TS; React adapters consume it.
7. **No promoting `@experimental` to `@stable` without a migration story.**
8. **No bundling a UI kit.** Users plug in shadcn/MUI/Mantine via adapter packages.
9. **No marketing on category** in user-facing docs. Lead with a concrete user win.
10. **No assuming the LLM's chosen function is authorization.** Schema validation at the dispatcher, regardless of caller.

## What you are *not* doing in this session unless asked

- Shipping `acture-state-jotai`, `acture-state-valtio`, or `acture-sandbox`. These are the three remaining post-v1 candidates; pull-forward requires explicit user direction. (`acture-sandbox` is also gated on a drafted-but-not-launched research-7 prompt — see `docs/research/acture_research_prompts.md`.)
- Generalizing beyond what `docs/roadmap.md` commits to. For maintainer decisions, YAGNI applies; the rule of three is for acture *users* (per `docs/redesign_takeaways.md` §6).
- Modifying the central paper (`docs/command_dispatch_journal_article.md`). It is canonical.

## Current state (v1.13 — chain end, 2026-05-15)

**19 npm packages live + 1 PyPI package; 489 npm package tests + 41 example tests + 23 Python tests, all green.** Phases 0–4 of the original v1 plan are complete; work since has been small, tracked increments. The forward plan and full done/not-done tracking live in [`docs/roadmap.md`](docs/roadmap.md); the active handoff lives in [`docs/next_session.md`](docs/next_session.md).

- Core: `acture` — registry + dispatcher + when-clause DSL + schema bridge + state-adapter interface. Stays the minimal primitive.
- State: `acture-state-zustand`, `acture-state-redux`. Both implement `PatchCapableAdapter`.
- UI: `acture-palette-react`, `acture-hotkeys`, `acture-forms-autoform`, `acture-forms-rjsf`.
- Cross-process surfaces: `acture-mcp-server`, `acture-ai-vercel`. Honour the tier filter and prepend `[DEPRECATED — <reason>]`.
- Migration: `acture-migration` — `wrapMutation`, `actureMiddleware`, `createDomInterceptor`, `chooseImplementation`, `shadowCompare`.
- Dispatch instrumentation: `acture-telemetry` (v1.11) — sink + optional `redact` / `sampler`. `acture-undo` (v1.11) — patch-based undo/redo, transactions, `onEffect` host callback. `acture-devtools` — `<Inspector />`, `instrumentRegistry`, `enableTierWarnings`.
- Tooling: `acture-build-tier` (regex + AST), `acture-cli` (`compare-schemas` + `snapshot`), `acture-codemods` (five research-4 §B.5 codemods), `eslint-plugin-acture-migration` (`acture/no-stale-wrap-mutation` + `acture/require-param-describe`).
- Testing: `acture-e2e-playwright` (v1.7) — sequence engine + Playwright fixture; substrate for macros + e2e + property tests. `acture-test-property` (v1.12) — fast-check arbitraries replayed through the sequence engine.
- Python: `acture` on PyPI (v1.13) — thin MCP client, `ActureClient` as `Mapping[str, Command]`. ~300 LoC, depends only on the official `mcp` SDK.

Hand-written equivalents (the dev-tool-first promise made reproducible) live at `docs/hand-written-{registry,command-sequence,telemetry,undo,test-property,python-client}.md` and `docs/ai-codemod-recipe.md`.

Three remaining post-v1 candidates require explicit user direction: `acture-state-jotai`, `acture-state-valtio`, `acture-sandbox`. The last is also gated on `docs/research/acture_research_prompts.md` Prompt 7 (drafted, not launched).

## Working rhythm

Phases 0–4 of the original v1 plan are **complete**. Work now proceeds as small, tracked increments rather than gated phases. The forward plan, the immediate next step, and the full done/not-done tracking live in **`docs/roadmap.md`** and **`docs/next_session.md`**. Each increment still ends with a short reflection or roadmap update — do not skip it.

## When unsure

If a design choice is irreversible (per `docs/implementation_plan.md` §"Sequencing of irreversible architectural decisions"), pause and ask the user. The cost of pausing is one message; the cost of an unwanted lock-in is rework across many phases.

## Conventions

- TypeScript monorepo via pnpm workspaces (or npm; Phase 0 picks).
- Package naming: `acture` (default barrel), `acture-<subpackage>` (e.g. `acture-state-zustand`, `acture-mcp-server`).
- Test runner: `vitest`.
- Build: `tsup` or `tshy` for ESM+CJS+types.
- Code style: standard prettier defaults; no `any` in public API; `unknown` for untyped boundaries.
- All public exports get JSDoc; all `@experimental` / `@internal` get JSDoc tags that the build step mirrors into metadata.

## Where to file questions or escalations

If you find an inconsistency between docs, or a design choice that needs user ratification, append a note to `docs/escalations.md` (create if missing) with:
- Date
- Phase
- The decision in question
- Your proposed resolution and the alternative
- Why it's irreversible or expensive to defer

Then ask the user before proceeding.
