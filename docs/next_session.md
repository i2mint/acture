# Next Session — Phase 3

**Your role:** You are the Phase 3 implementing agent. Phase 2 (hotkeys, parameterized palette, state-redux, two form adapters, MCP, AI-vercel, drop-in example) is **DONE** as of 2026-05-13. Your job is to ship `@acture/migration` and the migration-track skills so an agent — or a small team — can adopt acture into an existing app without a rewrite.

**Phase 2 finished 2026-05-13.** Repo state at handoff:

- 9 packages publishable (`acture`, `@acture/state-zustand`, `@acture/state-redux`, `@acture/palette-react`, `@acture/hotkeys`, `@acture/forms-autoform`, `@acture/forms-rjsf`, `@acture/mcp`, `@acture/ai-vercel`).
- 2 worked examples: `examples/greenfield/graph-editor/` (greenfield path) and `examples/drop-in/` (bolt-on path).
- 159 tests pass (72 core + 9 hotkeys + 27 palette-react + 7 state-zustand + 8 state-redux + 7 forms-autoform + 3 forms-rjsf + 10 mcp + 6 ai-vercel + 7 graph-editor + 3 drop-in).
- All packages typecheck and build via tsup. Graph-editor production bundle: ~358KB gzipped.
- Phase 2 reflection: [`docs/phase-2-reflection.md`](phase-2-reflection.md). No escalations outstanding.

---

## Step 1 — Orient

Read in this order (~45 minutes total):

1. `docs/phase-2-reflection.md` — what Phase 2 found. Specifically:
   - §1 on the auto-derived `kind` heuristic (override rate is uncalibrated until you stress it with an existing-app example).
   - §2 on the RTK `previous` quirk — relevant if your migration fixture uses RTK.
   - §6 observations 2–5 (Zod introspection brittleness, browser-only smoke-test gap, rjsf coverage gap, tinykeys type shim).
2. `.claude/skills/acture-migration-package/SKILL.md` — the migration package's four-function API. This is your primary deliverable.
3. `.claude/skills/acture-architecture-primer/SKILL.md` — re-load if rusty.
4. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before every commit.
5. `docs/implementation_plan.md` §"Phase 3 — Migration package and skills" — your exact scope and acceptance criteria.
6. `docs/research/acture_research_4 ...md` — the migration-tooling research. **§A.6 is canonical for the four-function API.**
7. `examples/drop-in/` — Phase 2 already exercised the conceptual core (wrap existing store + register existing actions as commands). Your job is to formalize that workflow with named primitives + skills.

**Do NOT read in this session unless directly relevant:** the tier-system enforcement at build time (research-5 §7), the `acture compare-schemas` CLI (research-5 §6), devtools — all Phase 4.

## Step 2 — Phase 3 scope

Per `docs/implementation_plan.md` §"Phase 3 — Migration package and skills":

**Package to ship: `packages/migration/`** exporting four primitives:

1. `wrapMutation<H>(handler, options?): H` — wrap an existing function as a command without changing call sites. Options: `id?`, `logTo?`, `onDispatch?`.
2. `actureMiddleware` — Redux/Zustand-compatible store-event interception middleware. Translates store actions into command dispatches without bypassing the registry.
3. `chooseImplementation<Args, R>(pick, impls): (...args: Args) => R` — 5-line feature-flag bridge.
4. `shadowCompare<Args, R>(modern, legacy, options?)` — Scientist-style: run modern, log if legacy result differs.

**Skills to ship in `.claude/skills/`:**

- `migration-diagnose` — adapt wrapex `01-diagnose.md` to acture's API.
- `migration-plan` — adapt `02-plan.md`.
- `migration-scaffold` — adapt `03-scaffold.md`.
- `migration-wrap` — adapt `04-wrap.md` using `wrapMutation`.
- `migration-graduate` — NEW. Retire `wrapMutation` calls once the legacy handler is no longer needed.

The wrapex carryover lives in `docs/wrapex_carryover.md` — read it first; many of the wrapex skills can port over with light rewriting.

**Worked example: `examples/migration/zustand-wrap/`** — a small existing zustand React app, NOT acture-aware. Following the migration skills, introduce acture, then graduate.

## Step 3 — Acceptance criteria

1. `examples/migration/zustand-wrap/before/` runs without any acture import.
2. Following `migration-diagnose` → `migration-plan` → `migration-scaffold` → `migration-wrap`, at least 5 commands are wrapped without breaking existing UI behavior.
3. `examples/migration/zustand-wrap/after/` has identical behavior to `before/` plus a working command palette (Ctrl+K).
4. `migration-graduate` retires at least 2 of the wrapped legacy handlers (they're now unused).
5. The auto-derived `kind` heuristic is exercised against at least 5 parameterized commands of varying shapes. **Measure the override rate.** If >30%, refine `deriveKind` before declaring Phase 3 done.
6. CI green.

## Step 4 — Phase 2 findings you should pre-load

From `docs/phase-2-reflection.md`:

1. **Zod introspection is brittle.** Both `derive-kind.ts` and `forms-autoform/auto-form.tsx` reach into Zod internals (`_def.typeName` and `.def.type`). Don't add a third copy — extract a shared helper to `packages/migration/` (or `acture` core) only if a third caller arrives.
2. **`previous` in subscribe(listener) on RTK is documented.** The redux adapter tracks it explicitly; the contract permits adapters that pass `previous == current` when they can't track it.
3. **MCP scripts hold state in the Node process.** They do NOT share state with the browser. The migration example may want to demonstrate cross-process sync — but that's optional and likely belongs in a post-v1 `@acture/sync` package.
4. **No browser smoke test was performed.** Add a manual checklist item to your reflection.
5. **Per-package `vitest.config.ts` is the convention.** All new packages should follow.
6. **Workspace root has 12 packages + 2 examples now.** Add the migration package to `pnpm-workspace.yaml`'s `packages:` glob (it's `packages/*` — already covered).

## Step 5 — Decisions you may need to escalate

1. **`actureMiddleware` redux compatibility.** RTK's middleware signature differs from plain Redux. Confirm with the user whether the middleware should ship as a single function adaptable to both, or as two named exports (`actureMiddleware` for plain Redux, `actureRTKListener` for RTK's `createListenerMiddleware`).
2. **Codemod scope.** Research-4 §A.7 surveys ast-grep / jscodeshift / ts-morph for automated `wrapMutation` rewrites. v1.1 per the original plan. Phase 3 ships ONLY hand-applied wrapping; codemods are post-v1.
3. **Migration-graduate's effect on imports.** When a `wrapMutation` call is retired and the legacy handler is unused, should the skill suggest deleting the legacy function entirely, OR only the call sites? Suggest checking with the user before locking the convention.

## Step 6 — Phase 3 reflection (gates Phase 4)

When acceptance passes:

1. Write `docs/phase-3-reflection.md` answering the seven questions in `docs/implementation_plan.md` §"Phase 3 → Pre-next-phase reflection checklist".
2. Update `docs/implementation_plan.md` Phase 3 with `**Status:** ✅ DONE — <date>`.
3. Update `docs/v1_plan.md` Phase 3 with the same status marker.
4. Replace this file (`docs/next_session.md`) with a Phase 4 handoff prompt.

## Step 7 — What you are NOT doing in Phase 3

- Tier-system enforcement at build time (Phase 4).
- `acture compare-schemas` CLI (Phase 4).
- Devtools UI (Phase 4).
- Codemods (v1.1).
- Python companion (post-v1).
- DOM-event interception (v1.1).

## When unsure

Re-read this file, the linked skills, and `docs/implementation_plan.md` §"Phase 3". If still unsure, append a note to `docs/escalations.md` (create the file if missing) and ask the user before locking in an irreversible decision.

**Good luck. Phase 3 is the phase where acture's adoption story becomes credible — once an agent can walk an existing app into acture without breaking it, every other surface (palette, hotkeys, MCP, AI) becomes a one-pnpm-add away.**
