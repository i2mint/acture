# Next Session — Phase 1

**Your role:** You are the Phase 1 implementing agent. Phase 0 (scaffold + name reservation + CI) is done. Your job is to ship a working `acture/core` validated end-to-end against a worked example with one consumer adapter. **Treat this as a real implementation phase, not a scaffold.**

**Phase 0 finished 2026-05-13.** Repo state at handoff:

- `acture` is published at v0.0.0 on both npm and PyPI (name-reservation stubs).
- pnpm workspace monorepo at `/Users/thorwhalen/Dropbox/py/proj/tt/acture/`.
- One package: `packages/core/` (npm name: `acture`). Exports only `defineCommand` (freeze-only smoke stub) and `__version`.
- CI at `.github/workflows/ci.yml` runs typecheck + test + build + pack on push/PR. **Not yet pushed — the first push to `main` is what verifies CI green.**
- Smoke test at `packages/core/src/index.test.ts` (3 tests, all pass).

---

## Step 1 — Orient

Read in this order (~60 minutes total reading):

1. `AGENTS.md` — orientation.
2. `docs/phase-0-reflection.md` — what Phase 0 found and the three doc-hidden-assumption notes (read carefully; they save you time).
3. `.claude/skills/acture-architecture-primer/SKILL.md` — the three primitives.
4. `.claude/skills/acture-command-record-shape/SKILL.md` — the canonical `CommandRecord` shape (this is your contract).
5. `.claude/skills/acture-state-adapter/SKILL.md` — the `StateAdapter<S>` interface.
6. `.claude/skills/acture-schema-bridge/SKILL.md` — Zod → JSON Schema, MCP emission.
7. `.claude/skills/acture-hard-donts/SKILL.md` — merge checklist (re-read before every commit).
8. `docs/v1_plan.md` §4 — `CommandRecord` shape (closed surface).
9. `docs/implementation_plan.md` §"Phase 1" — your exact scope and acceptance criteria.
10. `docs/research/acture_research_1 ...md` and `acture_research_3 ...md` — research-1 informs the CommandRecord shape, research-3 informs the StateAdapter. **Skip research-2, 4, 5** unless your work touches palette parameters, migration, or the tier system — those are Phase 2/3/4 concerns.

**Do NOT read in this session:** `parameterized_command_palette_guide.md` (Phase 2 territory); the migration skills (Phase 3 territory); research findings 2/4/5 unless directly relevant.

## Step 2 — Phase 1 scope (per `docs/implementation_plan.md`)

**Packages to build:**

1. **`packages/core/`** — replace the smoke stub with the real implementation:
   - Real `defineCommand<P, R>(spec): CommandRecord<P, R>` per `v1_plan.md` §4. Validate at registration that param schemas are in the JSON-Schema-representable subset.
   - `createRegistry(options?): Registry` — owner-scoped disposables, `commandsChanged` event, `dispatch(id, params, ctx?)`, `get(id)`, `list()`, tier-aware `list({ tiers: [...] })`.
   - `WhenClauseEvaluator` — DSL parser/evaluator for `!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~`, `in`, `not in`, plus a function escape hatch `(ctx) => boolean`.
   - `StateAdapter<S>` interface (per research-3 §5): `getState`, `setState(updater)`, `subscribe(listener)`. Plus `PatchCapableAdapter<S>` sub-interface and `isPatchCapable<S>` type guard.
   - Schema bridge: `toJsonSchema(record, options?)` accepting an injected converter; default uses Zod v4's `z.toJSONSchema`.
   - `Result<R>` discriminated union with **reserved** `patches?` and `effects?` hooks (Phase 1 ignores them; they exist so post-v1 undo is non-breaking).

2. **`packages/state-zustand/`** (NEW) — ~50 LOC. `createZustandAdapter<S>(store): PatchCapableAdapter<S>` wrapping `zustand/vanilla` `createStore`, using `zustand/middleware/immer` with `produceWithPatches`. npm package name: confirm with the user (see Step 5 #1).

3. **`packages/palette-react/`** (NEW) — minimal Phase 1 version. **Parameter-free commands only.** Wraps cmdk's `<Command>`. Iterates `registry.list()`, filters by tier (default `['stable']`), groups by `category`, shows keybinding hints. Listens for `commandsChanged`. Parameterized command UX is **Phase 2**, not your problem.

**Worked example:** `examples/greenfield/graph-editor/` with 6–8 commands per the implementation plan. All state mutations go through `registry.dispatch` — no direct `setState` outside `execute` handlers.

**Tests:**
- Property-based (fast-check) registry invariants.
- When-clause DSL parser/evaluator unit tests.
- `toJsonSchema` snapshot tests.
- Integration test: `JSON.stringify(adapter.getState())` round-trips through `JSON.parse`.

## Step 3 — Acceptance test (from `docs/implementation_plan.md` §"Phase 1")

1. Graph editor example runs (`pnpm dev` in `examples/greenfield/graph-editor/`).
2. `rg "store.setState" packages/ examples/greenfield/graph-editor/src/ -t ts` finds zero matches outside `execute` handlers.
3. Property tests pass.
4. **Second-agent test:** a fresh agent, given only `packages/core/README.md`, writes a 7th command (`app.graph.renameNode`) and the example accepts it without changes to registry or palette. Document the dialogue in `docs/phase-1-acceptance.md`.
5. State round-trips through JSON.
6. CI green.

## Step 4 — What Phase 0 surfaced that you should know

Three findings from `docs/phase-0-reflection.md` you'll otherwise re-discover the hard way:

1. **Per-package vitest config, not workspace-root.** The workspace-root `vitest.config.ts` is intentionally an inert `export default {}`. Vitest finds the per-package config first when run from inside a package directory. When you add `packages/state-zustand/` and `packages/palette-react/`, add their own `vitest.config.ts`. Do NOT try to centralize at root unless you also add `vitest` to root devDependencies (and even then, the per-package one wins for `pnpm -r test`).

2. **`pnpm-workspace.yaml` build-script gating.** pnpm 10+ blocks install-time scripts by default. The current file already approves `esbuild`. Most Phase 1 deps (`zustand`, `cmdk`, `zod`, `immer`, `react`) have no postinstall. If install errors with `[ERR_PNPM_IGNORED_BUILDS]`, add the offender to both `allowBuilds:` and `onlyBuiltDependencies:`.

3. **Sibling-package imports.** New packages MUST import from `acture` by name (`"acture": "workspace:*"` in package.json), not via relative path. The `exports` map only applies to package-name imports. Relative paths produce invalid emit and bypass the `exports` map.

Also non-obvious from the docs:

4. **`pnpm pack` auto-includes the workspace-root `LICENSE`** even when no per-package LICENSE exists. This is desirable. Don't be surprised when the tarball contains LICENSE.
5. The root `tsconfig.json` is an inert stub (`include: []`). Each package has its own. Project references were deliberately deferred — add them only if you find IDE friction across packages.

## Step 5 — Decisions you may need to escalate

These affect the public API surface. Stop and ask via `docs/escalations.md` if low confidence:

1. **Subpackage naming convention.** `docs/v1_plan.md` uses `acture/state-zustand` in some places and `@acture/state-zustand` in others — they mean different things on npm. `@acture/<name>` is the standard scoped pattern and supports independent versioning. **Ask the user before publishing the second package.** Lean toward `@acture/state-zustand`.

2. **`CommandRecord.params` schema authoring layer.** `v1_plan.md` §4 says "Standard Schema accepted at boundary, Zod is the recommended authoring layer." Decide: Phase 1 ships strict Zod-only (smaller surface, faster) or Standard Schema (broader, slower). Lean Zod-only unless the user pushes back.

3. **When-clause DSL parser depth.** The operator set is locked. Decide between hand-rolled (small, no deps) and parser combinator (clearer, ~one dep). Either is defensible; if you pick the combinator, justify the dep in the reflection.

4. **Zustand version.** Pin to zustand v5 (current stable). Confirm with `npm view zustand version` at the start.

## Step 6 — Phase 1 reflection (gates Phase 2)

When acceptance passes:

1. Write `docs/phase-1-reflection.md` answering the six questions in `docs/implementation_plan.md` §"Phase 1 → Pre-next-phase reflection checklist".
2. Update `docs/implementation_plan.md` Phase 1 with a `**Status:** ✅ DONE — <date>` marker (matching the Phase 0 marker convention).
3. Update `docs/v1_plan.md` Phase 1 with the same status marker.
4. Replace this file (`docs/next_session.md`) with a Phase 2 handoff prompt.

## Step 7 — What you are NOT doing in Phase 1

- Hotkeys integration (Phase 2).
- Parameterized palette commands (Phase 2 — `kind` field is on the record, but the palette UX is Phase 2).
- Forms adapters (Phase 2).
- RTK adapter (Phase 2).
- MCP / AI adapters (Phase 2).
- Migration package (Phase 3).
- Tier system enforcement / `acture compare-schemas` (Phase 4).
- Devtools UI (Phase 4).

If you find yourself implementing one of these, stop. Either it belongs in a later phase or your scope has crept.

## Step 8 — Don't forget to push

Phase 0 left CI unverified — the workflow exists but no commit has been pushed to `main`. **First action after the user gives go-ahead:** confirm with the user whether to commit Phase 0's scaffold first (clean commit) and push, then start Phase 1 implementation on a separate branch. Acceptance test #6 ("CI green") covers Phase 0's tail and Phase 1's head together.

## When unsure

Re-read this file, the linked skills, and `docs/implementation_plan.md` §"Phase 1". If still unsure, append a note to `docs/escalations.md` and ask the user before locking in an irreversible decision (per `implementation_plan.md` §"Sequencing of irreversible architectural decisions").

**Good luck. Phase 1 is the deepest commitment in the v1.0 timeline — the `CommandRecord` shape and the dispatcher signature are the things subsequent phases all build on. Be deliberate.**
