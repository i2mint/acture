---
name: acture-hard-donts
description: The acture pre-merge anti-pattern checklist. Load this before merging any non-trivial change to the acture codebase, before reviewing a PR, or whenever you're about to add a feature, a field, or a package. Catches inner-platform creep, god-packaging, business logic in adapters, React coupling in core, eval of LLM strings, and the other named hard "don'ts" from redesign_takeaways.md §3. Triggers on "review this change", "pre-merge check", "is this an anti-pattern", "should I add this field", "should I create this package", "hard don'ts", "checklist", "merge checklist", "anti-pattern".
---

# acture hard don'ts — pre-merge checklist

Read before merging any non-trivial change. These are anti-patterns the reference research collectively rules out. They MUST be enforced in code review.

Source: `docs/redesign_takeaways.md` §3.

## 1. No conditional logic in command metadata

**Symptom:** `command.if`, `command.unless`, `command.when` with logical operators in flight, `command.dependsOn` with computation, command "inheritance," polymorphic command records.

**Why it's wrong:** Inner Platform Effect. Command metadata growing toward a mini-language ends in a Greenspun's-Tenth-Rule lisp.

**Fix:** If you want conditional logic, refactor into two commands OR push the conditional into `execute`. The closed `CommandRecord` shape is the structural guardrail.

**Exception:** the `when` field (DSL or `(ctx) => boolean`) — this is the upper bound of acceptable metadata complexity, and even it is a frequent source of confusion in VS Code.

## 2. No god-package

**Symptom:** A single `acture` package import gives you the palette, the AI adapter, the MCP server, the migration helpers, the form rendering, undo, telemetry, etc.

**Why it's wrong:** Tree-shaking breaks; new users pay for adapters they don't need; mode-1 users get pulled toward "purity" they don't want; the bundle becomes the bottleneck.

**Fix:** Core + per-consumer adapter packages. The default `acture` barrel re-exports the most-used pieces but stays thin. New surface lives in a new package.

## 3. No business logic in adapter packages

**Symptom:** `acture-mcp` decides which commands to expose based on user preferences. `acture-palette-react` runs an algorithm to pick command order beyond `defaultScore`. `acture-ai-vercel` validates parameters in a way that differs from the core dispatcher.

**Why it's wrong:** Logic that should be uniform across surfaces drifts. Adapters become couplers, not translators.

**Fix:** Adapters translate. They iterate the registry and emit per-target format. If you find yourself adding behavior, it belongs in `acture-core`. If the behavior is per-consumer-specific (e.g., "MCP cares about tier filtering"), it goes in core as a parameterized projection (`registry.toMCPServer({ tiers })`).

## 4. No `if (mode === ...)` in shared helpers

**Symptom:** `if (mode === 'greenfield') { ... } else if (mode === 'migration') { ... }` in core or in a shared helper.

**Why it's wrong:** The three positioning paths are a *marketing* concept and a *documentation* concept, not a runtime concept. The same registry serves all three. Mode-conditional logic in core means the core knows about the path, which couples internal code to user adoption story.

**Fix:** Composition. Mode 1 / 2 / 3 differences live in: which packages the user installs, which docs they read, which skills the agent loads. The core has no mode awareness.

## 5. No `eval()`-ing LLM-produced JSON or argument strings

**Symptom:** The MCP/AI adapter takes the LLM's tool-call JSON, parses it, and uses `eval` or `new Function` or dynamic `import` to invoke. Or: takes a string and uses it as a key into a Map without validation.

**Why it's wrong:** This is the entire LLM-prompt-injection / tool-poisoning class of attacks. Invariant Labs' April 2025 WhatsApp PoC is the documented case.

**Fix:** The dispatcher takes a `(name, args)` pair. Validate `args` against the schema (Standard Schema's `.validate`). Route via `Map<string, Command>.get(name)`. Never reflectively call. If the lookup misses, return `{ ok: false, error: { code: 'unknown_command' } }`.

## 6. No coupling the registry to React

**Symptom:** `acture/core` imports from `react`. `createRegistry()` returns something that requires a `<Provider>`. The registry is React-context-bound.

**Why it's wrong:** kbar's `<KBarProvider actions={...}>` pattern is the documented failure mode (research-3 case study 3). Acture must be invocable from: non-React code, LLM tool calls, keyboard daemons, MCP servers, test runners. Tests must not need a React renderer. The registry must outlive any Provider's lifetime.

**Fix:** Registry is plain TS. React adapters consume it. `<CommandPalette registry={...} />` accepts the registry as a prop; the registry exists independently.

## 7. No promoting `@experimental` to `@stable` without a migration story

**Symptom:** A feature was `@experimental`, ships in 1.4.0, gets promoted to `@stable` in 1.5.0 by removing the JSDoc tag.

**Why it's wrong:** Per research-5: promotion is MINOR (expands default surface), but external consumers tracking schemas WILL see a new tool appear in `tools/list`. If the experimental feature had bugs or surface changes, the promotion is the moment those bugs become a stability commitment.

**Fix:** Before promoting, document the migration story:
- What changed between the last experimental version and the proposed stable version?
- Are there any breaking changes that need to land BEFORE promotion?
- Does the description need refinement (which itself is a MAJOR change per research-5)?

Set an explicit 3–6 month deadline on every experimental feature. If it hasn't reached stable in that window, retire it.

## 8. No bundling a UI kit

**Symptom:** `acture-palette-react` imports from `@mui/material` or `shadcn/ui` directly.

**Why it's wrong:** Users have their own design systems. Bundling makes acture unusable for them.

**Fix:** Adapter packages expose unstyled components OR a `components: { Input, Button, ... }` config slot. The user plugs in their design system's components. Reference: cmdk's slot API.

## 9. No marketing on category

**Symptom:** README opens with "a unified dispatch architecture for typed schema-driven command registration across multi-surface frontend consumer interfaces."

**Why it's wrong:** Architecture astronaut. Users don't buy categories; they buy outcomes.

**Fix:** Lead with a concrete user win. *"One schema. Palette, hotkeys, AI tools, MCP, and tests — for free."* Architectural explanation goes in the "Why acture?" section.

## 10. No assuming the LLM's chosen function is authorization

**Symptom:** "The LLM is registered as a privileged caller, so we skip schema validation when the call comes from `surface: 'ai'`."

**Why it's wrong:** The LLM proposes; the registry decides. Skipping validation by surface lets prompt-injection bypass param validation. Authorization is a separate concern, gated by middleware or `when`-clause, not by the caller's identity.

**Fix:** Schema validation happens at the dispatcher, regardless of caller. Authorization is its own check. The LLM has zero special trust.

---

## The merge ritual

Before merging:

1. Run through the 10 items above. Was anything new in this PR a temptation toward one of them?
2. Re-read `docs/v1_plan.md` §3 (package layout) and confirm the PR doesn't bloat any package beyond its charter.
3. If the PR added a field to `CommandRecord`: did three concrete callers ask for it? (See `acture-command-record-shape`.)
4. If the PR added a runtime check or middleware: is it the dispatcher's concern, or did it leak into an adapter?
5. If the PR added a "mode" branch anywhere: stop. Refactor into composition.
6. **Positioning check** (`docs/positioning.md`): could a developer accomplish what this PR enables *without* installing an `acture-*` package? If the honest answer is "no", the dev-tool-first principle is violated — the agent-written path must stay viable and documented. If the PR adds or touches a consumer surface, the `acture-consumer-integration` skill's checklist also applies.

## When the answer is unclear

If you can't tell whether a PR violates a hard don't, the answer is usually yes — write a note in `docs/escalations.md` and ask the user.

## See also

- `docs/positioning.md` — canonical positioning; the source of merge-ritual item #6
- `docs/redesign_takeaways.md` §3 — the source of the ten don'ts
- `docs/command_dispatch_journal_article.md` §6 — the underlying risks (Inner Platform, premature generalization, performance, astronaut syndrome)
- `acture-consumer-integration` — the consumer-build pattern that operationalises the positioning
- Each individual `acture-*` skill for domain-specific don'ts
