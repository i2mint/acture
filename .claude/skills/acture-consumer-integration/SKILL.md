---
name: acture-consumer-integration
description: The foundational pattern for building a command-dispatch CONSUMER in a target project — a command palette, keyboard shortcuts, AI tool calling, an MCP endpoint, e2e testing, macros, telemetry, undo. Load this whenever you are adding a consumer surface to a user's app, OR whenever you are working on a consumer-specific acture-* package (acture-palette-react, acture-hotkeys, acture-mcp-server, acture-ai-vercel, acture-e2e-playwright, …). It encodes acture's dev-tool-first positioning: the agent-written path is always viable, acture packages are an optional opt-in accelerator, and tool-library choices belong to the user. Triggers on "add a command palette", "add hotkeys", "wire up MCP", "expose commands to an AI", "set up e2e testing", "build a consumer", "which acture package should I use", "do I need to install acture".
---

# acture consumer integration — the foundational pattern

A **consumer** is anything that invokes commands from the registry: a command palette, keyboard shortcuts, AI tool calling, an MCP server, e2e tests, macros, telemetry, undo/redo, third-party extensions. Each is a *projection* of the same `CommandRecord` set.

This skill is the pattern every consumer-specific skill builds on. Load it before adding any consumer to a user's project, and before working on any consumer-specific `acture-*` package. The canonical positioning it enforces lives in `docs/positioning.md` — read that if anything here is unclear.

## The one rule you cannot break

> The user must be able to get a working consumer **without adding any `acture-*` dependency to their project**, unless they explicitly choose to.

If you find yourself reaching for `npm install acture-<something>` as the *default* move, stop. That is one of two options, and not the default one.

## Two dimensions — always keep both open

Before writing anything, locate the task on both axes (see `docs/positioning.md` §3):

1. **Core vs strangler-fig** — is command dispatch being designed in, or wrapped into an existing codebase incrementally? (If strangler-fig, also load the `migration-*` skills.)
2. **Agent-written vs package-reuse** — will you hand-write this consumer following acture's patterns, or install an acture package that implements it?

Dimension 2 is decided **per consumer**, not per project. Hand-write the palette, reuse `acture-mcp-server`, skip a state adapter — all in the same project — is normal.

## The decision procedure

For each consumer the user wants:

### Step 1 — Surface the choice to the user

Do not silently pick. Present the two paths with their real trade-offs:

- **Agent-written** — you write the integration into their codebase. They own every line, zero acture dependency, maximum adaptability to their stack. Cost: more code in their repo, and they maintain it.
- **Package-reuse** — install the relevant `acture-*` package. Less code to own, tested behaviour, faster. Cost: a dependency to track, a surface they don't control.

If the user has a stated preference (in `CLAUDE.md`, in conversation, in the migration plan), follow it. Otherwise ask.

### Step 2 — Identify the tool-library dependency (this one is usually unavoidable)

Almost every consumer rests on *some* third-party library:

| Consumer            | Typical tool libraries                          | acture's per-tool package |
| ------------------- | ----------------------------------------------- | ------------------------- |
| Command palette     | cmdk, kbar, custom                              | `acture-palette-react` (cmdk) |
| Keyboard shortcuts  | tinykeys, react-hotkeys-hook, custom            | `acture-hotkeys` (tinykeys) |
| AI tool calling     | Vercel AI SDK, Anthropic SDK, OpenAI SDK        | `acture-ai-vercel` (Vercel AI SDK) |
| MCP server          | `@modelcontextprotocol/sdk`                     | `acture-mcp-server` |
| Parameter forms     | react-hook-form + Zod, rjsf, custom             | `acture-forms-autoform`, `acture-forms-rjsf` |
| e2e testing         | Playwright, Cypress, Vitest browser, custom     | `acture-e2e-playwright` (Playwright) |
| Property testing    | fast-check, jsverify, hand-rolled               | `acture-test-property` (fast-check) |
| Macros (record/replay) | none — registry only                         | *none — pattern + `acture-macros` skill* |
| Telemetry           | structured logger, OpenTelemetry, network beacon, custom | `acture-telemetry` (one reference `consoleSink`; user's sink is the user's) |
| Undo / redo         | any `PatchCapableAdapter` (zustand+immer, RTK, MST) | `acture-undo` |
| Python consumption  | official `mcp` SDK, FastMCP, hand-rolled JSON-RPC | `acture` on PyPI (dict-like MCP-client facade) |

**This dependency belongs to the user's consumer code, and the choice of tool is theirs.** acture does not mandate cmdk or Playwright or the Vercel SDK. The per-tool `acture-*` packages each bundle *one* known-good integration with *one* tool — useful if the user already chose that tool, irrelevant if they chose another. Name the realistic options; respect the user's pick; never imply acture's choice is the only choice.

So a consumer integration may legitimately add **a tool-library dependency** while adding **zero acture dependency** — that is the agent-written path, and it fully honours the dev-tool-first principle.

### Step 3 — Build it

- **Agent-written path:** write the integration directly in the user's project. The only thing it needs from acture is the *pattern* (how to iterate the registry, how to call `dispatch(id, params)`, how to read `keybinding` / `when` / schema off a `CommandRecord`). It needs nothing *imported* from acture unless the user is also using `acture` core for the registry itself. Reference the per-surface skill and, if helpful, the corresponding `acture-*` package's source as a worked example to adapt — not to import.
- **Package-reuse path:** install the `acture-*` package, wire it to the user's registry. The package takes the registry as input and translates; it never owns business logic.

### Step 4 — Record the choice

Note in the project's migration/adoption notes (or wherever decisions are tracked) which path was taken per consumer and why. A later session — or a `migration-graduate` pass — needs to know whether a dependency was a deliberate trade or an accident.

## When you are working ON a consumer-specific acture-* package

The same positioning applies inward:

- The package is an *optional accelerator*. Its README must document the hand-written alternative, not just `npm install`.
- It **translates** the registry to its target surface; it holds no business logic and makes no architectural decisions (hard-don't #3).
- It depends on exactly one tool library, declared as a peer dependency, and its docs frame that tool as the user's choice — naming it, not selling it.
- It must be independently installable and independently optional. Nothing else in acture may assume it is present.

## Checklist before you finish

- [ ] Did you present (or follow a stated preference for) the agent-written vs package-reuse choice — rather than defaulting to install?
- [ ] If you added an `acture-*` dependency, was it an explicit, recorded user decision?
- [ ] If you added a tool-library dependency, is it framed as the user's consumer code's dependency and the user's tool choice?
- [ ] Could the user have gotten a working consumer with zero acture dependency? (If no — you drifted. Fix it.)
- [ ] Did you load the per-surface skill (palette / hotkeys / mcp / ai / e2e / …) for the specific consumer, and `migration-*` skills if this is a strangler-fig context?

## See also

- `docs/positioning.md` — the canonical positioning this skill enforces.
- `acture-architecture-primer` — the eight consumer surfaces and the three primitives.
- `acture-hard-donts` — the merge checklist; #2 (no god-package) and #3 (adapters translate) are the ones this skill operationalises.
- Per-surface skills — `acture-palette-design`, `acture-hotkeys`, `acture-mcp`, `acture-ai`, `acture-macros`, `acture-e2e`, `acture-test-property`, `acture-telemetry`, `acture-undo`, `acture-python` — for the specifics of each surface.
