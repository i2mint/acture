# acture positioning — what acture is, and what it asks of you

**Status:** canonical. This document governs how every other doc, README, and skill frames acture. If something contradicts this file, this file wins. (The one document above it is the conceptual paper, `command_dispatch_journal_article.md`, which this refines but does not replace.)

Read this before writing or editing any user-facing text, before designing a new package, and before designing or editing a skill.

---

## 1. What acture is

**acture is a place developers (human or AI agent) go to get AI-agentic help building, migrating to, and maintaining a command-dispatch architecture** — the dispatch layer itself and the consumers that hang off it (palette, hotkeys, AI tools, MCP, e2e tests, macros, …).

It is delivered as two things, and the order matters:

1. **A body of skills, patterns, and codemods** — the *primary* surface. This is how an agent learns the command-dispatch architecture well enough to write it *into your project*, adapted to your stack, your constraints, and your preferences.
2. **A set of npm packages** — the *optional* surface. Tested, ready-made implementations of the pieces an agent would otherwise hand-write, so it doesn't have to.

acture is a **development tool first**. The packages are an accelerator, not the product.

## 2. The dev-tool-first principle

> **A developer must be able to use acture purely as a development tool, with no acture dependency added to their project — unless they explicitly choose to add one.**

This is the non-negotiable. An agent wielding acture's skills can stand up a complete command-dispatch architecture in a target project where `package.json` never gains a single `acture-*` line. The registry, the dispatcher, a palette, an MCP endpoint — all of it can be code the agent *wrote*, following acture's patterns, owned outright by the target project.

Adding an acture package is always a *deliberate, opt-in trade*, never a default and never a side effect of using acture.

This does **not** mean acture packages are bad or that depending on them is wrong. Code reuse is genuinely good — it spares the agent from rewriting near-identical code every time, and it means battle-tested behaviour instead of a fresh re-derivation. But reuse also has a cost: a dependency, a version to track, a surface you don't control. acture's job is to make that trade *visible and optional*, not to make it for you.

## 3. The two flexibility dimensions

Every acture engagement is positioned on two independent axes. Skills and docs must keep both open; never collapse one into a default.

### Dimension 1 — how command dispatch enters the codebase

- **Core approach** — command dispatch is a first-class architectural component, designed in (greenfield) or adopted as a deliberate core. The registry is the canonical path for operations.
- **Strangler-fig approach** — command dispatch is introduced incrementally into an existing codebase, wrapping existing handlers and graduating them over time. The legacy code keeps working throughout; acture's involvement shrinks as the migration completes.

(These two subsume the conceptual paper's three "positioning paths": greenfield-pure and footprint-minimizer are both *core*; strangler-fig is *strangler-fig*.)

### Dimension 2 — where the implementation comes from

- **Agent-written** — the agent writes the integration code directly into the project, following acture's documented patterns. Maximum adaptability, minimum dependency. The project depends on nothing from acture (or, at most, on `acture` core if the team wants the registry primitive itself).
- **Package-reuse** — the agent installs an acture package that already implements the piece. Less code to own, faster, tested — at the cost of a dependency the team must accept and track.

These are not either/or for a whole project. A team can hand-write the palette, reuse `acture-mcp-server`, and skip a state adapter entirely. The agent picks per-piece, guided by the team's preferences (including *which* third-party tool to build on — see §5).

## 4. What the acture packages are, and what they are not

The `acture-*` packages are **optional, independently-installable accelerators**. Each one is a thing an agent could have hand-written; acture ships it tested so it doesn't have to.

Rules that keep the packages honest to this positioning:

- **Every package is independently optional.** No package is load-bearing for "using acture". `acture` core itself is optional — a team can take the patterns and own every line.
- **No god-package.** (Hard-don't #2.) A package is a single accelerator, not a bundle you opt into wholesale.
- **The agent-written path is always viable and always documented.** Every package's README and every consumer skill must describe the hand-written alternative, not just the install command.
- **Packages translate; they don't decide.** (Hard-don't #3.) Business logic, command authoring, and architectural choices belong to the target project, never to an acture package.
- **`acture` core stays thin.** It is the registry + dispatcher + schema bridge and nothing else. Thinness is what makes "depend on only core, or on nothing" a real option.

## 5. Two kinds of dependency — be precise about which is which

When an agent builds a consumer integration, *some* dependency is usually unavoidable — but it is critical to be clear about **whose** dependency it is:

- **A dependency on an `acture-*` package** — optional, opt-in, the subject of the dev-tool-first principle above. Avoidable by hand-writing.
- **A dependency on a *tool* library** — e.g. Playwright for e2e, cmdk for a palette, tinykeys for hotkeys, the Vercel AI SDK for tool calling. A consumer integration almost always rests on *some* such library. **This dependency belongs to the consumer code and is chosen by the team**, not imposed by acture.

acture's per-tool packages (`acture-hotkeys` on tinykeys, `acture-palette-react` on cmdk, `acture-ai-vercel` on the Vercel AI SDK, a future `acture-e2e-playwright` on Playwright) each bundle *one* known-good integration with *one* specific tool. They exist so a team that has already chosen that tool gets a tested integration for free. They must never imply that tool is the only option — the consumer skill documents the choice and the hand-written path for other tools.

## 6. The role of skills

Skills are the primary delivery surface. They fall into three families:

- **Dev skills** (`acture-*`) — for an agent working *on* the acture repository itself. Architecture, the CommandRecord shape, the schema bridge, the tier system, the hard-don'ts.
- **Migration-track skills** (`migration-*`) — the strangler-fig workflow, step by step (diagnose → plan → scaffold → wrap → graduate).
- **Consumer-integration skills** — for an agent building a consumer *in a target project*: how to add a palette, hotkeys, an MCP endpoint, e2e testing, etc. These are *consumer-specific* (one per surface) and *tool-aware* (they name the realistic tool choices and document both the hand-written and the package-reuse path). The foundational pattern lives in the `acture-consumer-integration` skill; per-surface skills build on it.

**Standing rule for dev skills:** whenever a task touches a consumer surface or a consumer-specific package, the agent must also load `acture-consumer-integration`. The dev skills reference this rule so the positioning is enforced from inside the workflow, not just stated in docs.

## 7. The test acture must keep passing

Before merging anything user-facing, ask:

1. Could a developer accomplish this *without* installing an acture package? If the honest answer is "no", the dev-tool-first principle is being violated — fix it.
2. Does this text/skill/README present *both* dimensions (core vs strangler-fig, agent-written vs package-reuse), or does it quietly assume one?
3. If this introduces a tool dependency, is it clearly framed as the *consumer's* choice, not acture's mandate?
4. Does `acture` core stay thin enough that "depend on core only, or on nothing" remains real?

If any answer is wrong, the change has drifted from acture's positioning. Re-read this file.
