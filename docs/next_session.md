# Next Session — Phase 4

**Your role:** You are the Phase 4 implementing agent. Phase 3 (migration package, five migration-track skills, zustand-wrap before/after worked example, kind-heuristic stress) is **DONE** as of 2026-05-13. Your job is to ship the v1.0 stability surface: the build-step tier-system enforcement, the `acture compare-schemas` CLI, a devtools inspector, and the hardening pass that earns the v1.0 tag.

**Phase 3 finished 2026-05-13.** Repo state at handoff:

- **10 packages publishable:** `acture`, `@acture/state-zustand`, `@acture/state-redux`, `@acture/palette-react`, `@acture/hotkeys`, `@acture/forms-autoform`, `@acture/forms-rjsf`, `@acture/mcp`, `@acture/ai-vercel`, **`@acture/migration`** (new).
- **3 worked examples:** `examples/greenfield/graph-editor/`, `examples/drop-in/`, `examples/migration/zustand-wrap/{before,after}/`.
- **185 package tests** + **36 example tests** all green.
- **5 migration-track skills:** `migration-diagnose`, `migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`.
- All packages typecheck and build via tsup; all examples typecheck and build via vite.
- Phase 3 reflection: [`docs/phase-3-reflection.md`](phase-3-reflection.md). No escalations outstanding.

---

## Step 1 — Orient

Read in this order (~45 minutes total):

1. `docs/phase-3-reflection.md` — what Phase 3 found. Specifically:
   - §1–2: `chooseImplementation` and `shadowCompare` were not exercised in the worked migration (correct outcome for a 1–2K LoC fixture). The drop-candidate trigger is "no use within four weeks of public release" — we're not there.
   - §3: `actureMiddleware` ships as one standard Redux middleware (works with plain Redux and RTK). The RTK-specific listener-middleware split was deferred until three callers demand it.
   - §4: `migration-wrap` could benefit from a 3-rule params-vs-positional cheat sheet — not blocking, fold in if a second agent stumbles.
   - §7 observations 1–3 (no RTK example, `wrapMutation` bound-method quirk, kind heuristic at 0% override against the 8 tested shapes).
2. `.claude/skills/acture-tier-system/SKILL.md` — the canonical tier-system spec. Build-step mirror, runtime gating, `@deprecated` banner prefixing, `@internal` symbol-token enforcement. **§7 is your primary spec.**
3. `.claude/skills/acture-schema-bridge/SKILL.md` — needed for the schema-diff classifier in `acture compare-schemas`.
4. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before every commit.
5. `docs/implementation_plan.md` §"Phase 4 — Stability, tier system, devtools" — your exact scope and acceptance criteria.
6. `docs/research/acture_research_5 ...md` — the tier system + schema diff research. **§6 (compare-schemas) and §7 (tier system) are canonical.**

**Do NOT read in this session unless directly relevant:** the migration package, codemod design, Python companion — all Phase 3 / post-v1.

## Step 2 — Phase 4 scope

Per `docs/implementation_plan.md` §"Phase 4 — Stability, tier system, devtools":

**Tier-system enforcement (per research-5 §7):**
- Build step (tsup plugin or esbuild plugin) that scans `.ts` source for `@stable` / `@experimental` / `@internal` / `@deprecated` JSDoc tags on `defineCommand` calls and mirrors them into the command's `tier` metadata field at build time.
- Runtime gating: `registry.toMCPServer({ tiers })`, `registry.toAITools({ tiers })`, `registry.toPaletteCommands({ tiers })`. Defaults: `['stable']`.
- `@deprecated` banner prepending in `description` for MCP / AI surfaces.
- `@internal` symbol-token enforcement: runtime throws if dispatched from outside the registering module (research-5 §7.5).

**`acture compare-schemas` CLI (per research-5 §6):**
- New `packages/cli/` package with bin `acture`.
- `acture compare-schemas <base> [<head>]` walks the registry in both refs, projects through the schema bridge, diffs tool envelopes (not just inputSchema).
- `--fail-on <severity>` for CI gating.
- `--allow-description-edits` (per-invocation, NOT a config setting) to downgrade description-only diffs to MINOR.
- `--format json|text` output. Text default colored, JSON for machines.
- Classifications per research-5 §6.1.

**`packages/devtools/`:**
- Inspector React component: registry contents, dispatch log, when-clause evaluator state, tier filter preview.
- Embeddable in dev builds; the greenfield example is the smoke-test surface.

**Hardening:**
- Audit error messages for actionability.
- JSDoc on every public export (the build step needs it anyway for tier mirroring).
- Each `core` public function: at least one happy-path test + one error-path test.
- Bump all packages to v1.0.0.

## Step 3 — Acceptance criteria

Per `docs/implementation_plan.md` §"Phase 4 → Acceptance test":

1. A command tagged `@experimental` in source is auto-mirrored to `tier: 'experimental'` at build time (verified by reading the dist `.d.ts`).
2. `registry.toMCPServer()` excludes the experimental command from `tools/list`.
3. `registry.toMCPServer({ tiers: ['stable', 'experimental'] })` includes it.
4. A `@deprecated` command's MCP description starts with `[DEPRECATED — use X instead]`.
5. An `@internal` command throws if dispatched from outside its module.
6. `acture compare-schemas v0.9.0 HEAD` correctly classifies a removed command as MAJOR.
7. `acture compare-schemas v0.9.0 HEAD --allow-description-edits` downgrades description-only changes to MINOR while still flagging structural changes as MAJOR.
8. `acture compare-schemas --fail-on major` exits non-zero when MAJOR changes are present (CI gate works).
9. Devtools inspector renders in the greenfield example.
10. v1.0.0 published to npm (dry-run with `npm pack` first).

## Step 4 — Phase 3 findings you should pre-load

From `docs/phase-3-reflection.md`:

1. **`@internal` enforcement needs a symbol token** that the registering module captures at module load and presents on dispatch (research-5 §7.5). The token cannot be a string — strings can be reverse-engineered from the bundle. A `Symbol()` per call site is the recommended technique.
2. **`acture compare-schemas` reads the registry, not the source.** It registers commands from the `<base>` ref by importing the built dist, then does the same for `<head>`, then diffs the two `registry.list()` outputs after projecting through `toJsonSchema`. This means the CLI requires both refs to be built; document this clearly.
3. **The tier mirror only runs at build time.** If a user writes `@experimental` on a `defineCommand` and ships it without running the build, the runtime `tier` field stays at the default. This is acceptable for v1.0 because the build step is documented as required. Don't add a runtime fallback "scan the .ts source for tags" — that path is too leaky.
4. **Per-package `vitest.config.ts` is the convention.** All new packages should follow.
5. **Workspace root has 10 packages + 4 examples now.** `pnpm-workspace.yaml` still globs `packages/*` and `examples/**` — no manual addition needed.
6. **Manual browser smoke tests are still owed for Phase 2 and Phase 3.** Open `examples/greenfield/graph-editor/` and `examples/migration/zustand-wrap/after/` in a browser, exercise the palette, verify forms render. The CI bundle build is not a substitute.

## Step 5 — Decisions you may need to escalate

1. **CLI distribution.** `acture compare-schemas` lives in `packages/cli/`. Does the `acture` package re-export the CLI bin (so users only `pnpm add acture`), or is `@acture/cli` a separate install? Research-5 doesn't take a side. Default if unclear: keep the bin in `acture` itself so `npx acture compare-schemas` works without a second package.
2. **Tier symbol token API.** Should `@internal` enforcement be opt-in (commands tagged `@internal` plus a dispatcher check) or automatic at registration time (the build step injects the symbol)? Lean automatic — fewer footguns. Confirm before locking.
3. **Devtools shape.** A single embeddable React component, or a route-mountable mini-app (with its own state)? Lean component — fits the "host owns rendering" pattern from `acture-hard-donts` §8.

## Step 6 — Phase 4 reflection (gates v1.0)

When acceptance passes:

1. Write `docs/phase-4-reflection.md` answering the five questions in `docs/implementation_plan.md` §"Phase 4 → Pre-next-phase reflection checklist".
2. Update `docs/implementation_plan.md` Phase 4 with `**Status:** ✅ DONE — <date>`.
3. Update `docs/v1_plan.md` Phase 4 with the same status marker.
4. Replace this file (`docs/next_session.md`) with a v1.0 release / v1.1 planning prompt.

## Step 7 — What you are NOT doing in Phase 4

- Codemods (v1.1).
- Python companion (post-v1).
- DOM-event interception (v1.1).
- `@acture/sync` for cross-process state mirroring (post-v1).
- `@acture/undo` (post-v1; hooks reserved since Phase 1).

## When unsure

Re-read this file, the linked skills, and `docs/implementation_plan.md` §"Phase 4". If still unsure, append a note to `docs/escalations.md` (create if missing) and ask the user before locking in an irreversible decision.

**Good luck. Phase 4 is the phase where acture becomes a v1.0 library — once the tier system enforces API stability and `compare-schemas` gates CI, every consumer of acture has a contract they can rely on.**
