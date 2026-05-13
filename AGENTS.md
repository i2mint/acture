# AGENTS.md — acture

You are an AI coding agent contributing to **acture**, a typed schema-driven command dispatch library for frontend applications. This file orients you. Read it first.

## What acture is

A library implementing the **command dispatch architecture** described in `docs/command_dispatch_journal_article.md`. The library exposes three primitives — *state model*, *command registry*, *schema bridge* — that together power eight consumer surfaces: command palette, keyboard shortcuts, AI tool calling, MCP server, automated tests, telemetry (post-v1), undo/redo (post-v1), and macros (post-v1). A command defined once, registered once, serves every surface.

Acture is the successor to `wrapex` (npm `command-wrapex`). That name carried migration-only framing that didn't fit acture's scope. Both `acture` on npm and `acture` on PyPI are reserved.

## Three positioning paths

Same core serves all three. Adapter packages and documentation differ.

1. **Greenfield-pure** — design an app command-dispatch-first from day one.
2. **Strangler-fig migration** — incrementally adopt command dispatch in an existing codebase using `acture/migration`.
3. **Footprint-minimizer drop-in** — bolt a command palette + MCP server onto an existing app, no migration intent.

## Where to look (in this order)

1. **`docs/command_dispatch_journal_article.md`** — the central conceptual paper. Three primitives, eight consumer surfaces, strangler-fig migration, the rule of three, the risks (inner platform effect, premature generalization, performance, architecture astronaut syndrome). READ FIRST.

2. **`docs/v1_plan.md`** — the research-informed plan. What's settled, what's deferred, what each phase delivers.

3. **`docs/implementation_plan.md`** — phase-by-phase implementation guide with explicit pre-next-phase reflection checklists. **Phase boundaries are gates, not waypoints.**

4. **`docs/research/`** — five research findings (1–5) that informed the v1 plan. Read the one(s) relevant to your current task; do not read all five every session.

5. **`docs/redesign_takeaways.md`** — opinionated synthesis of design commitments. The "Hard don'ts" (§3) are the merge checklist.

6. **`docs/parameterized_command_palette_guide.md`** — implementation patterns for parameter collection. (See `docs/research/acture_research_2 ...` for the UX research that overrides any conflict here.)

7. **`docs/reference_notes.md`** — distilled per-article notes for all 51 references in the central paper.

8. **`docs/wrapex_carryover.md`** — file-by-file audit of what we kept, discarded, and what to read from wrapex when needed.

9. **`.claude/skills/`** — task-specific skills you load when working on a particular concern.

## Skills index

Skills are how you load focused context. Each is a self-contained primer for one concern. Load only what you need.

| Skill | When to load |
| --- | --- |
| `acture-architecture-primer` | Always, for any non-trivial task. The conceptual model in 5 minutes. |
| `acture-command-record-shape` | When defining or modifying the `CommandRecord` interface or its fields. |
| `acture-schema-bridge` | When working on Zod → JSON Schema projection, MCP tool emission, or AI tool definitions. |
| `acture-palette-design` | When building or modifying the command palette UI, especially parameterized commands. |
| `acture-state-adapter` | When building or modifying a state adapter (zustand, redux, etc.) or the `StateAdapter<S>` interface. |
| `acture-migration-package` | When working on `acture/migration` (wrapMutation, actureMiddleware, chooseImplementation, shadowCompare) or the migration-track skills. |
| `acture-tier-system` | When working on the @stable / @experimental / @internal / @deprecated tier system or `acture compare-schemas`. |
| `acture-hard-donts` | Read before every non-trivial PR. The merge checklist of anti-patterns. |
| `migration-diagnose` | First step in adopting acture in an existing codebase: scan source for command candidates. |
| `migration-plan` | Second step: turn the diagnosis into a phased adoption backlog with explicit decisions. |
| `migration-scaffold` | Third step: install acture into the host app and wire the registry + state adapter. |
| `migration-wrap` | Fourth step: wrap existing handlers / store actions using `wrapMutation`. |
| `migration-graduate` | Final step: retire `wrapMutation` calls once the legacy handler is no longer needed. |

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

- Shipping undo, macros, telemetry, sandboxing, or the Python companion in v1.x. These are post-v1.
- Generalizing beyond what `v1_plan.md` commits to. Rule of three.
- Modifying the central paper (`docs/command_dispatch_journal_article.md`). It is canonical.

## Current state (v1.2, Phase 4 + v1.1 + v1.2 increments DONE, 2026-05-13)

Fourteen packages ship in the workspace at versions ranging from v1.0.0 to v1.2.0 (depending on which increment touched them):

- Core: `acture@1.1.0` — `enableTierWarnings`, `deprecationReason`, `internalToken`, `DispatchOptions`.
- State: `@acture/state-zustand@1.0.0`, `@acture/state-redux@1.0.0`.
- UI: `@acture/palette-react@1.0.0`, `@acture/hotkeys@1.0.0`, `@acture/forms-autoform@1.0.0`, `@acture/forms-rjsf@1.0.0`.
- Surfaces: `@acture/mcp@1.0.0`, `@acture/ai-vercel@1.0.0` — honour the tier filter and prepend `[DEPRECATED — <reason>]`.
- Migration: `@acture/migration@1.1.0` — adds `createDomInterceptor` for DOM-event interception.
- Tooling: `@acture/build-tier@1.1.0` (regex + AST mode), `@acture/cli@1.2.0` (deep nested compare-schemas diffs), `@acture/devtools@1.0.0`.
- **New in v1.2:** `@acture/codemods@1.0.0` — single `npx`-invokable codemod CLI with manifest, `--dry-run`, `--json`.

Four worked examples: `examples/greenfield/graph-editor/`, `examples/drop-in/`, `examples/migration/zustand-wrap/{before,after}/`, and **new in v1.2** `examples/migration/redux-wrap/` (RTK + `actureMiddleware` end-to-end). See `docs/next_session.md` for the v1.3 backlog.

## Phase progression

You will be told which phase you're working in. Each phase ends with a reflection note at `docs/phase-N-reflection.md`. Do NOT skip the reflection step — it is the gate to the next phase.

## When unsure

If a design choice is irreversible (per `docs/implementation_plan.md` §"Sequencing of irreversible architectural decisions"), pause and ask the user. The cost of pausing is one message; the cost of an unwanted lock-in is rework across many phases.

## Conventions

- TypeScript monorepo via pnpm workspaces (or npm; Phase 0 picks).
- Package naming: `acture` (default barrel), `@acture/<subpackage>` (e.g. `@acture/state-zustand`, `@acture/mcp`).
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
