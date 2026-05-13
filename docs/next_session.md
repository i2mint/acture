# Next Session — Phase 2

**Your role:** You are the Phase 2 implementing agent. Phase 1 (core + state-zustand + minimal palette-react + graph-editor example) is **DONE** as of 2026-05-13. Your job is to ship the consumer-adapter buildout that makes acture useful across all three positioning paths (greenfield, strangler-fig, drop-in).

**Phase 1 finished 2026-05-13.** Repo state at handoff:

- `acture` v0.1.0-dev published to the workspace with the closed-surface `CommandRecord`, `createRegistry`, `defineCommand`, when-clause DSL, `StateAdapter<S>` types, `toJsonSchema`, `Result<R>`.
- `@acture/state-zustand` v0.1.0-dev wraps zustand+immer as a `PatchCapableAdapter<S>`.
- `@acture/palette-react` v0.1.0-dev ships a minimal cmdk-based palette. Parameterized commands show a "Phase 2" badge and are NOT dispatchable from the palette yet — that is YOUR job.
- `examples/greenfield/graph-editor/` worked example: 8 commands (7 user-facing + 1 internal reset for tests), Vite dev server, all mutations flow through `registry.dispatch`.
- 94 tests pass (72 core + 7 state-zustand + 8 palette-react + 7 example).
- Phase 0 CI verified green on `main`.

---

## Step 1 — Orient

Read in this order (~60 minutes total):

1. `docs/phase-1-reflection.md` — what Phase 1 found. Specifically:
   - §1 on the `AnyCommandRecord = CommandRecord<any, any>` variance concession.
   - §2 on the `previous` parameter quirk that will surface again with RTK.
   - §3 on the 503-LOC when-clause parser; **don't grow it** without considering a parser combinator.
   - §4 on the four docs gaps surfaced by the second-agent test.
   - §6 observations on `Patch.op` enum (don't grow it) and Phase 1's reserved-hooks status.
2. `docs/phase-1-acceptance.md` — what passed, what was flagged.
3. `.claude/skills/acture-palette-design/SKILL.md` — parameterized-palette UX. The auto-derived `kind` heuristic per research-2 §9.3 is YOUR primary deliverable.
4. `.claude/skills/acture-schema-bridge/SKILL.md` — for the MCP and AI SDK projections.
5. `.claude/skills/acture-tier-system/SKILL.md` — for tier-aware filtering in MCP / AI surfaces.
6. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before every commit.
7. `docs/implementation_plan.md` §"Phase 2 — Adapter buildout" — your exact scope and acceptance criteria.
8. `docs/research/acture_research_2 ...md` — the parameterized-command UX research. **Read this carefully**; it informs every palette + form decision.
9. `docs/parameterized_command_palette_guide.md` — implementation patterns. Defer to research-2 §9 if there is a conflict.

**Do NOT read in this session unless directly relevant:** the migration package (`acture-migration-package` skill, research-4), the tier-system enforcement at build time (research-5 §7) — both are Phase 3 / 4 work.

## Step 2 — Phase 2 scope

Per `docs/implementation_plan.md` §"Phase 2 — Adapter buildout":

**Packages to add:**

1. **`packages/hotkeys/`** (`@acture/hotkeys`) — tinykeys integration. Plain DOM API + optional React hook.
2. **`packages/palette-react/`** — EXTEND. Add parameterized-command support per research-2 §9.3:
   - `kind` auto-derivation from the schema (0 params: atomic; 1-2 picker-typed: atomic; 3 picker-typed-with-defaults: atomic; else: handoff).
   - For `kind: "atomic"`: render an in-palette picker chain.
   - For `kind: "handoff"`: close the palette; open a form view via the host-supplied form adapter.
3. **`packages/state-redux/`** (`@acture/state-redux`) — RTK reference adapter. Same `StateAdapter<S>` interface; verify `previous` quirk from Phase 1's reflection.
4. **`packages/forms-autoform/`** (`@acture/forms-autoform`) — Zod-native form adapter implementing `paramCollector(schema): React.ComponentType<{onSubmit, onCancel}>`.
5. **`packages/forms-rjsf/`** (`@acture/forms-rjsf`) — JSON-Schema-native form adapter (same interface).
6. **`packages/mcp/`** (`@acture/mcp`) — MCP server adapter. `registry.toMCPServer({ tiers })` style. Errors-as-data. Deprecation banner prefixes per research-5 §7.4.
7. **`packages/ai-vercel/`** (`@acture/ai-vercel`) — Vercel AI SDK adapter. Same tier rules.

**Worked examples to extend:**

- `examples/greenfield/graph-editor/` — extend with hotkeys, parameterized palette (the `app.graph.addNode({x,y,label})` command should now be reachable from the palette), an MCP server demo, and a Vercel AI SDK demo.
- `examples/drop-in/` — NEW. A small existing-app skeleton with a 5-minute "add a palette + MCP server" bolt-on.

## Step 3 — Acceptance criteria (per `docs/implementation_plan.md` §"Phase 2")

1. Both worked examples (greenfield + drop-in) run.
2. Parameterized commands in the graph editor's palette work as research-2 prescribes (atomic/handoff per the heuristic; explicit override demo).
3. MCP client (`@modelcontextprotocol/inspector`) lists the graph editor's commands as tools, can call one, gets a valid `Result` response.
4. Vercel AI SDK demo: Claude or GPT invokes the graph-editor commands and composes a multi-step action.
5. Tier filtering: `@experimental` commands hidden by default in MCP `tools/list`; explicit `tiers: ['stable', 'experimental']` includes them.
6. CI green across the new packages.

## Step 4 — Phase 1 findings you should pre-load

From `docs/phase-1-reflection.md`:

1. **Variance trap.** `AnyCommandRecord` is `CommandRecord<any, any>` (NOT `<unknown, unknown>`) for sound contravariance. Don't try to "fix" the `any`; it's intentional. See `packages/core/src/types.ts`.
2. **`previous` in subscribe(listener).** zustand passes both `(next, prev)`; RTK doesn't. When you write `@acture/state-redux`, document the limitation: RTK adapters pass the current value as `previous` since RTK doesn't track it. Don't reshape the StateAdapter contract.
3. **When-clause DSL is at ~500 LOC.** Don't grow it in Phase 2 unless you're consolidating multiple use cases. Specifically: do **not** add `>` / `<` bare-operators without a three-caller justification (the rejection is intentional — see `when.ts` and `phase-1-reflection.md` §3).
4. **`Patch.op` enum is `'add' | 'remove' | 'replace'` only.** Don't grow it; Immer doesn't produce `'copy'` / `'move'`.
5. **Docs gaps logged in `phase-1-acceptance.md` §4** (factory-pattern undocumented, state-shape undocumented, `noUncheckedIndexedAccess` undocumented, `getState()` not called out) — fix them as part of Phase 2's docs deliverable. The graph-editor README should grow a "How to add a command" section.
6. **Per-package `vitest.config.ts` is the convention.** Workspace root has an inert `export default {}`.

## Step 5 — Decisions you may need to escalate

1. **Hotkeys keybinding-conflict resolution.** Multiple commands with overlapping keybindings (e.g. one `when: 'editor.focused'` and one `when: '!editor.focused'`) need a tiebreaker. Research-1 surveyed Obsidian / Raycast / Linear; they all defer to a "first registered wins under matching context" rule. Confirm with the user before locking in.
2. **Auto-derived `kind` heuristic edge cases.** Research-2 §9.3's heuristic is sharp at the cliffs (3 picker-typed-with-defaults: atomic; otherwise handoff). The override rate target is <30%; if your worked example hits >30% override, refine the heuristic before Phase 3.
3. **`@acture/forms-autoform` vs `@acture/forms-rjsf` priority.** Both ship in Phase 2 per the plan. If timeboxing forces a choice, autoform first (Zod-native = matches the recommended authoring layer).
4. **MCP transport.** Server-side `@modelcontextprotocol/sdk` (Node) vs the in-browser variant — confirm with the user which is the v1 default. Lean Node-side for greenfield, browser-side for drop-in.

## Step 6 — Phase 2 reflection (gates Phase 3)

When acceptance passes:

1. Write `docs/phase-2-reflection.md` answering the six questions in `docs/implementation_plan.md` §"Phase 2 → Pre-next-phase reflection checklist".
2. Update `docs/implementation_plan.md` Phase 2 with `**Status:** ✅ DONE — <date>`.
3. Update `docs/v1_plan.md` Phase 2 with the same status marker.
4. Replace this file (`docs/next_session.md`) with a Phase 3 handoff prompt.

## Step 7 — What you are NOT doing in Phase 2

- Migration package (Phase 3).
- Tier-system enforcement at build time (Phase 4).
- `acture compare-schemas` CLI (Phase 4).
- Devtools UI (Phase 4).
- The Python companion package (post-v1).

## Step 8 — A note on Phase 1's branch

Phase 1 lives on the `phase-1` branch. By the time you start, it should be merged to `main` via PR. If you find unmerged Phase 1 work on `main` for any reason, talk to the user before proceeding.

## When unsure

Re-read this file, the linked skills, and `docs/implementation_plan.md` §"Phase 2". If still unsure, append a note to `docs/escalations.md` and ask the user before locking in an irreversible decision.

**Good luck. Phase 2 is the phase where acture earns its name — once parameterized palette, MCP, and AI adapters land, every primitive becomes consumable from every surface for the first time.**
