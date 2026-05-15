---
name: acture-architecture-primer
description: Load the conceptual model of acture's command-dispatch architecture. Use this skill at the start of ANY non-trivial task in the acture repository — it covers the three primitives (state model, command registry, schema bridge), the eight consumer surfaces, acture's dev-tool-first positioning and its two flexibility dimensions, and the rule of three. Triggers on phrases like "what is acture", "how does the architecture work", "the three primitives", "the consumer surfaces", or when starting a new phase. Do NOT use this for narrow API/typing questions — load `acture-command-record-shape` or another targeted skill instead.
---

# acture architecture primer

You are working on **acture**, a TypeScript library implementing the command-dispatch architecture. This skill loads the conceptual model. Read carefully before starting non-trivial work.

## The three primitives

Acture is built on three interlocking primitives. They are not optional layers — they are the minimal framework.

1. **State model** — a typed schema over application state. Defines *what exists*. Acture is agnostic about the state library; an adapter interface (`StateAdapter<S>`) lets zustand, Redux Toolkit, Jotai, etc. plug in cleanly. Reference adapters: `acture-state-zustand` (Phase 1) and `acture-state-redux` (Phase 2).

2. **Command registry** — a centralized map from a string `id` to a `CommandRecord`. Defines *what can be done*. Every user-facing operation flows through `registry.dispatch(id, params, ctx?)`. Carries the rest of the metadata: title, description, parameters, when-clauses, keybindings, tier marker, atomic-or-handoff flag.

3. **Schema bridge** — connects application-level types (Zod by default) to JSON Schema for MCP tools, AI tool calling, and external consumers. `toJsonSchema(record)` is the primary export.

## The eight consumer surfaces

A single `CommandRecord` simultaneously serves:

1. **Command palette** (`acture-palette-react` + the `acture-palette-design` skill) + **keyboard shortcuts** (`acture-hotkeys` + the `acture-hotkeys` skill)
2. **AI tool calling** (`acture-ai-vercel` + the `acture-ai` skill) — schema → JSON Schema (or Zod pass-through) for LLM function calling
3. **MCP server** (`acture-mcp-server` + the `acture-mcp` skill) — `{name, description, inputSchema}` tool emission
4. **End-to-end testing** (`acture-e2e-playwright` + the `acture-e2e` skill) — same `dispatch(id, params)` used by tests at unit/component/E2E levels; an e2e test is a macro with assertions
5. **Telemetry** (post-v1) — middleware logging every dispatch
6. **Undo/redo** (post-v1) — `Result<R>` reserves `patches?` and `effects?`
7. **Macros** (the `acture-macros` skill + `docs/hand-written-command-sequence.md` — pattern, no package) — record/replay of `{commandId, params}` pairs
8. **Extensions/plugins** — third-party additions via the registry API

## Positioning: acture is a development tool first

**Read `docs/positioning.md` — it is canonical and governs every user-facing word.** The headline:

> acture is a place developers (human or agent) go to get AI-agentic help building, migrating to, and maintaining a command-dispatch architecture. It is delivered primarily as **skills, patterns, and codemods**; the `acture-*` npm packages are an **optional accelerator**, not the product. A developer must be able to use acture purely as a development tool with **no `acture-*` dependency added to their project** — unless they explicitly choose to.

Every engagement sits on **two independent dimensions** — keep both open, never collapse one into a default:

1. **Core vs strangler-fig** — is command dispatch designed in, or wrapped into an existing codebase incrementally? (The conceptual paper's three "positioning paths" — greenfield-pure, footprint-minimizer, strangler-fig — collapse onto this axis: the first two are *core*, the third is *strangler-fig*.)
2. **Agent-written vs package-reuse** — does the agent write the integration into the project (zero acture dependency, maximum adaptability), or install an `acture-*` package (less code to own, tested, at the cost of a dependency)? Decided **per consumer**, not per project.

**Standing rule:** whenever your task touches a consumer surface or a consumer-specific `acture-*` package, also load the **`acture-consumer-integration`** skill. It operationalises the positioning above; this primer only states it. When the task is standing up command dispatch in a *new* target project, load **`acture-greenfield`** — it operationalises the same positioning for the core primitive itself, backed by the `docs/hand-written-registry.md` reference (the registry is ~80 lines a project can own outright, with zero `acture-*` dependency).

## The rule of three

> An operation should only be formalized as a command when it is triggered from at least three surfaces.

Per the central paper §6.2 — but with a nuance: because the cost of formalizing a command is amortized across all surfaces it serves (palette, AI, MCP, macros, tests), the threshold is reached sooner than under ad-hoc integration. Use the rule as the guard against premature abstraction, not as a rigid count.

Applied internally to acture itself: **do not add a library feature until three real callers need it.** Undo, macros, telemetry, codemods all wait for three-caller validation.

## The four risks (and mitigations)

From the central paper §6:

1. **Inner Platform Effect** — command metadata becoming a mini-language. *Mitigation:* keep the `CommandRecord` surface closed and small (see `acture-command-record-shape` skill). Metadata is data, not code.

2. **Premature generalization** — building extension points for hypothetical consumers. *Mitigation:* rule of three. About 1/3 of features actually improve metrics (Microsoft data).

3. **Performance overhead** — dispatch indirection at hot paths. *Mitigation:* bifurcate. Dispatch is for human-frequency operations (ms–s); render-frequency operations (16ms frame budget) stay as direct calls.

4. **Architecture astronaut syndrome** — elaborate infrastructure that never gets used. *Mitigation:* immediate user value at every phase. If a phase doesn't ship user-facing value, it is a red flag.

## What you should NOT assume

- Acture does **not** ship a state library. It ships an adapter interface and reference adapters.
- Acture is **not** a React library. The core has zero React dependencies. React lives in adapter packages.
- Acture does **not** prescribe how to organize your existing app. The migration package wraps existing code; it doesn't replace it.
- The `kind` field's two values (`"atomic"` and `"handoff"`) are a **closed enum** for v1; do not add a third without three-caller validation.
- The migration package's four functions are it. `divertHandler` was scoped out per research-4.

## Where the canonical sources live

- **Conceptual:** `docs/command_dispatch_journal_article.md`
- **Positioning:** `docs/positioning.md` — canonical; governs every user-facing word (dev-tool-first, the two dimensions)
- **Forward plan + status:** `docs/roadmap.md` — what's done, what's next, what's deferred
- **Immediate handoff:** `docs/next_session.md`
- **v1 plan (historical):** `docs/v1_plan.md`
- **Execution (historical):** `docs/implementation_plan.md`
- **Don'ts:** `docs/redesign_takeaways.md` §3 (also the `acture-hard-donts` skill)
- **Research:** `docs/research/acture_research_{1..5} ...md` — load only what's relevant to your task

## When you've loaded this skill

You should now be able to answer for any acture task:
- Which primitive does this touch?
- Which consumer surfaces does this affect?
- Does this risk one of the four named anti-patterns?
- Does this honour the dev-tool-first positioning — could a developer do this with zero `acture-*` dependency?
- If it touches a consumer surface, did you also load `acture-consumer-integration`?

If you can't answer those, re-read the relevant section.
