---
name: acture-greenfield
description: The foundational pattern for standing up command dispatch in a NEW or greenfield target project — designing the state model, then writing or installing the command registry + dispatcher primitive. Load this when an agent is adding a command-dispatch architecture to a project from scratch (not migrating an existing codebase — that's the migration-* track). It encodes acture's dev-tool-first positioning for the CORE primitive itself: the registry can be ~80 lines the project owns outright (agent-written, zero acture dependency) or `acture` core installed as an optional accelerator — a deliberate per-project choice. Triggers on "build a command-dispatch app", "set up a command registry", "greenfield acture", "command dispatch from scratch", "start a new project with acture", "do I need to install acture core", "hand-write the registry".
---

# acture greenfield — standing up the core primitive

A **greenfield** engagement is the *core* positioning path (see
[`docs/positioning.md`](../../docs/positioning.md) §3, Dimension 1): command
dispatch is designed in from the start, the registry is the canonical path
for operations. This skill is the foundation for that path — it covers the
**core primitive** (state model + registry + dispatcher). Consumer surfaces
(palette, hotkeys, MCP, AI, e2e) build on top of it via the
`acture-consumer-integration` skill.

If the project is an *existing* codebase being adopted incrementally, this is
the wrong skill — load the `migration-*` track instead.

Two agent-track skills sit *below* this foundation and go deeper on the steps
that need it: **`acture-greenfield-state-model`** (the detail of Step 1) and
**`acture-greenfield-bootstrap`** (the concrete, file-by-file walk-through of
the whole sequence, grounded in the graph-editor worked example). Load them
when you are actually building, not just orienting.

## The one rule you cannot break

> The project must be able to get a working command-dispatch layer **without
> adding any `acture-*` dependency**, unless the team explicitly chooses to.

The registry primitive itself — not just the consumers — is hand-writable.
[`docs/hand-written-registry.md`](../../docs/hand-written-registry.md) is the
complete, ~80-line, zero-dependency reference. Do not reach for
`pnpm add acture` as the default move.

## The greenfield sequence

### Step 1 — Design the state model

Before any command exists, decide *what state exists*. A typed schema over
application state, owned by the project. The agent does this directly — there
is no acture package for "your state." If the project already has a state
library (zustand, Redux Toolkit, …), that is the substrate; acture core's
`StateAdapter<S>` interface (or a hand-written equivalent) is the seam the
registry talks through. **Load `acture-greenfield-state-model`** for the
detail — the four hard constraints on the state shape, the deterministic
id-generation pattern, the adapter seam — and `acture-state-adapter` for the
interface itself.

### Step 2 — Decide: hand-write the registry, or install `acture` core

This is Dimension 2 (agent-written vs package-reuse) applied to the *core
primitive*. **Surface the choice to the user — do not silently pick.**

- **Agent-written** — copy/adapt [`docs/hand-written-registry.md`](../../docs/hand-written-registry.md)
  into the project (e.g. `src/registry.ts`). ~80 lines, zero dependencies, the
  team owns every line. Maximum adaptability; the team maintains it. The
  `when`-clause is a function; there is no string DSL, no schema bridge, no
  tier system until a real need appears.
- **Package-reuse** — `pnpm add acture zod`. Tested, maintained; you also get
  the when-clause string DSL, `toJsonSchema`, the tier system and
  `compare-schemas` CLI for free. Cost: one dependency to track.

The trade table in `hand-written-registry.md` lays out the per-row
differences. If the user has a stated preference (`CLAUDE.md`, conversation),
follow it. Otherwise ask. Record the decision in the project's notes — a
later session needs to know whether the dependency was deliberate.

Either way the *shapes* are identical (`Result`, `Context`, `CommandRecord`,
`defineCommand`, `createRegistry`, the four error codes), so the project can
swap paths later mechanically.

### Step 3 — Author commands

Whichever path Step 2 took, commands are authored the same way: a closed
`CommandRecord` per operation — `id` (namespaced `app.domain.action`),
`title`, optional `params` schema, optional `when`, and `execute` returning a
`Result`. See the `acture-command-record-shape` skill for the full 15-field
surface and the closed-surface discipline. Business logic lives in `execute`
and in the project — never in metadata, never in an acture package.

Keep param schemas in the JSON-Schema-representable subset (no `transform`,
`date`, `bigint`, `set`, `map`, `custom`) so they can round-trip to JSON
Schema the day an AI/MCP surface is added.

### Step 4 — Add consumer surfaces (separately, later, per-consumer)

A palette, hotkeys, an MCP endpoint, e2e tests — each is a *projection* of the
same registry, and each is its own agent-written-vs-package-reuse decision.
**Load the `acture-consumer-integration` skill** before adding any of them.
Do not pull in consumer packages as part of "setting up acture" — the core
primitive stands alone.

## What NOT to do

- **Don't install `acture` core reflexively.** It is one of two valid paths,
  and not the default one. Hand-writing is fully supported and documented.
- **Don't widen the `CommandRecord`.** It is closed. Conditional logic goes in
  `execute` or splits into two commands — never into metadata.
- **Don't couple the registry to React** or to the state library. It is plain
  TypeScript, constructible from a script, a test, an MCP server.
- **Don't reflectively invoke handlers.** `dispatch(id, params)` routes via
  `Map.get`; an unknown id fails closed. This is the prompt-injection
  guardrail — see `acture-hard-donts` #5.
- **Don't build the DSL, schema bridge, or tier system speculatively.** Add
  each only when a real consumer in your project needs it — YAGNI applied
  softly.

## Checklist before you finish

- [ ] Did you design the state model before authoring commands?
- [ ] Did you present (or follow a stated preference for) the hand-write vs.
      install-`acture`-core choice — rather than defaulting to install?
- [ ] If you added the `acture` core dependency, was it an explicit, recorded
      user decision?
- [ ] Could the project have gotten a working registry with zero acture
      dependency? (If no — you drifted. Fix it.)
- [ ] Is the registry plain TypeScript — no React, no state-library import?
- [ ] For any consumer surface, did you load `acture-consumer-integration`?

## See also

- `acture-greenfield-state-model` — Step 1 in detail: the state-shape constraints, id generation, the adapter seam.
- `acture-greenfield-bootstrap` — the concrete file-by-file walk-through of this whole sequence, grounded in the graph-editor worked example.
- [`docs/hand-written-registry.md`](../../docs/hand-written-registry.md) — the zero-dependency reference implementation.
- [`docs/positioning.md`](../../docs/positioning.md) — canonical; the dev-tool-first principle and the two dimensions.
- `acture-consumer-integration` — the per-consumer foundation for Step 4.
- `acture-command-record-shape` — the closed 15-field `CommandRecord` surface for Step 3.
- `acture-state-adapter` — the state-model seam for Step 1.
- `acture-architecture-primer` — the three primitives and eight consumer surfaces.
- `acture-hard-donts` — the anti-patterns the "What NOT to do" list draws from.
