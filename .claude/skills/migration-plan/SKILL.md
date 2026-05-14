---
name: migration-plan
description: Turn a diagnosis report into a phased adoption backlog with effort estimates and explicit configuration decisions. Use after `migration-diagnose` and before `migration-scaffold`. Triggers on "plan the migration", "prioritize candidates", "phase the migration", "adoption backlog". Surfaces decisions for the user (id prefix, categories, scope) instead of guessing.
---

# migration-plan

Convert `acture-output/diagnosis.md` into a prioritized, phased plan. Decide what gets wrapped first, what gets deferred, and what configuration the user must confirm. The plan is the contract the wrapping agent works against.

## Inputs

- `acture-output/diagnosis.md` (from `migration-diagnose`).
- User preferences on prefix, categories, scope (ask if not provided).

## Output

`acture-output/plan.md` containing:

1. A **decisions** section — open questions the user must answer.
2. A **Phase A — core wraps** table — 5–15 candidates to ship first.
3. A **Phase B — enrichment** table — Zod schemas, when-clauses, keybindings on the Phase A wraps + a few new candidates.
4. A **Phase C — full coverage** table — everything else.
5. A short **dependency note** (e.g. "the palette needs ≥5 commands before it's worth wiring").
6. An effort estimate per phase (hours).

## Steps

### 1. Load the diagnosis

Parse `acture-output/diagnosis.md`. If missing or malformed, instruct the user to run `migration-diagnose` first.

### 2. Surface decisions to the user

Ask explicit decisions; do NOT silently choose defaults that are hard to reverse. Use `AskUserQuestion` for the high-leverage ones.

Decision points:

- **Id prefix.** Options: `app`, the project name, custom. Default: `app`.
- **Categories.** Show the categories that emerged from the diagnosis; offer merge / rename. Categories surface in the palette grouping.
- **State adapter.** If zustand → `acture-state-zustand`. If RTK → `acture-state-redux`. If neither, ask.
- **Phase A scope.** Conservative (5–8) / moderate (8–12) / aggressive (12–20). Default: moderate.
- **Surface ambitions.** Which of palette / hotkeys / MCP / AI will be wired in this migration? Determines which `migration-wire-*` follow-ons matter.

### 3. Assign phases

**Phase A — core wraps** (immediate user-visible value):
- Priority 4–5 candidates from the diagnosis.
- Simple or moderate complexity.
- Has a user-facing surface today (button, hotkey, menu item).
- Target: 5–15 commands depending on chosen scope.

**Phase B — enrichment**:
- Add Zod schemas with `.describe()` to Phase A wraps that need parameter UI (palette form, AI tool calling).
- Add when-clauses for context-dependent commands.
- Add keybindings to the highest-frequency commands.
- Pull in Priority 3 candidates that have parameters.

**Phase C — full coverage**:
- Remaining candidates, complex async flows, internal actions.
- Anything that needs deeper refactoring before it can be a clean command.

### 4. Estimate effort

| Complexity | Pattern | Per-command effort |
|---|---|---|
| simple | store action wrap | 5 min |
| moderate | store action with Zod params | 15 min |
| moderate | API call wrap | 20 min |
| complex | async multi-step | 30–60 min |

Plus one-time setup costs (assume the agent is doing them):
- `migration-scaffold` for registry + adapter + index file: 15 min.
- Wire palette: 10 min.
- Wire hotkeys: 5 min.
- Wire MCP/AI: 20 min each.

Sum Phase A effort and report it.

### 5. Note dependencies

Quick text notes — no DAG required:

- "Wire palette only after ≥5 commands are wrapped (otherwise it looks empty)."
- "Wire MCP/AI only after Phase B (Zod schemas matter)."
- "Commands that delete data — add a confirmation hook in Phase B (deferred until the host knows what UX it wants)."

### 6. Write the plan

`acture-output/plan.md`. Keep tables compact — the agent reads this file repeatedly.

## Validation

- [ ] Every candidate in `diagnosis.md` appears in exactly one phase OR an explicit "intentionally deferred" list.
- [ ] Decisions have defaults stated AND explicitly ask the user where the cost of being wrong is high.
- [ ] Phase A has 5–15 commands.
- [ ] Effort estimates sum cleanly.

## Hand-off

After the user signs off on the plan, run `migration-scaffold` to set up the registry. Then iterate `migration-wrap` per Phase A candidate.
