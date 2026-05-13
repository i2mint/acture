# Acture Implementation Plan

**Companion to** [`v1_plan.md`](v1_plan.md). That file says *what* and *why*. This file says *how*, *who does each phase*, and — critically — *when the gate between phases closes*.

**Status:** Authored 2026-05-12 during the preparation session that established acture. Phases 0 → 4 specified.

---

## The reading contract

**Phase boundaries are gates, not waypoints.** Each phase below has:

1. **Goal** — one sentence on what shipping this phase means.
2. **Scope** — exhaustive list of what this phase does and does not include.
3. **Skills to load** — which `acture/.claude/skills/*` skills the implementing agent should read first.
4. **Acceptance test** — concrete, mechanical checks an agent (or a human) runs to confirm the phase is done.
5. **Pre-next-phase reflection checklist** — what the implementing agent or you (as the planning agent in a future session) must do **before the next phase starts**. This is where rethinking, refactoring, and design correction happen.

**A phase is not done because the acceptance test passes.** A phase is done when the acceptance test passes AND the reflection checklist has been worked through. No agent should start Phase N+1 without explicit go-ahead, captured in a paragraph at the end of the phase noting what was learned.

Each phase is **sized for a single focused agent session** (2–6 hours of agent work). If a phase looks bigger, split it.

---

## Phase 0 — Scaffold and naming

**Status:** ✅ DONE — 2026-05-13. Reflection: [`docs/phase-0-reflection.md`](phase-0-reflection.md). CI green pending first push.

**Goal:** acture exists as a publishable TypeScript monorepo. Both names (`acture` on npm, `acture` on PyPI) are reserved with v0.0.0 stubs. CI is green. Docs are in place (this is being done during the preparation session).

### Scope

**Done during the preparation session (this session, before Phase 0 begins):**
- Migrate docs from wrapex (this session).
- Reserve `acture` on npm and PyPI (this session if user authorizes).
- Author skills in `.claude/skills/`.
- Author `AGENTS.md`, `README.md`, `wrapex_carryover.md`, `next_session.md`.

**Phase 0 agent's job:**
- Scaffold a TypeScript monorepo using pnpm workspaces (or npm workspaces — pick one and document the choice).
- Create `packages/core/` package with minimal `package.json` (private = false; `exports`; `type: module`).
- Set up shared `tsconfig.base.json` and per-package `tsconfig.json`.
- Set up `tsup` (or `tshy`) for ESM/CJS dual build.
- Set up `vitest` at the workspace root.
- Add `.github/workflows/ci.yml` running typecheck + tests on PR.
- Smoke test: a `defineCommand` export that returns a frozen object; a vitest unit test that calls it.
- Update root `README.md` if it needs polish post-rename.
- Verify `npm pack -w packages/core` produces a valid tarball.
- Verify CI green.

### Skills to load

- `acture-architecture-primer` (overview of the three primitives)
- `acture-hard-donts` (the merge checklist)

### Acceptance test

```bash
# At the acture repo root:
pnpm install                       # or npm install
pnpm -r typecheck                  # all packages typecheck
pnpm -r test                       # all tests pass (only the smoke test exists)
pnpm -w pack packages/core         # produces a valid tarball
# CI runs the same and is green on main.
```

### Pre-next-phase reflection checklist

Before starting Phase 1, answer these in a markdown note at `docs/phase-0-reflection.md`:

1. **Was the monorepo tooling the right choice?** pnpm vs npm vs nx vs turborepo — what did you pick, and was it the right call given that acture will have ~10 packages by v1.0?
2. **Is the `exports` field per-package agent-friendly?** When an agent edits `packages/core/src/foo.ts` and wants to import from a sibling package in tests, does the path resolve cleanly?
3. **Is the build (`tsup`/`tshy`) producing types and runtime correctly?** Run `npm pack` and inspect the tarball. Does it match what `acture/core` consumers will receive?
4. **Did anything in Phase 0 surface a hidden assumption in the docs?** If yes, fix the doc before Phase 1 starts.

When this reflection note is committed, Phase 0 is done.

---

## Phase 1 — Minimal v0 core

**Goal:** A working `acture/core` validated end-to-end against a worked example with one consumer adapter. The command record shape, dispatcher signature, when-clause DSL, and state adapter interface are committed.

### Scope

**Packages to ship:**
- `packages/core/` (`acture` on npm) — the core. NO React, NO state library, NO UI deps.
- `packages/state-zustand/` (`@acture/state-zustand` on npm; subject to scoping decision) — production reference adapter, ~50 LOC + tests.
- `packages/palette-react/` (`@acture/palette-react`) — minimal version, parameter-free commands only.

**`acture/core` surface (Phase 1):**
- `defineCommand<P, R>(spec): CommandRecord<P, R>` — type-checked, frozen result. Validates at registration time that param schemas are in the JSON-Schema-representable subset.
- `createRegistry(options?): Registry` — owner-scoped disposables; `commandsChanged` event; `dispatch(id, params, ctx?)`; `get(id)`; `list()`; tier-aware `list({ tiers: [...] })`.
- `WhenClauseEvaluator` — DSL parser/evaluator for: `!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~`, `in`, `not in`. Plus a function escape hatch (`(ctx) => boolean`) flagged in metadata.
- `StateAdapter<S>` interface (per research-3 §5): `getState`, `setState(updater)`, `subscribe(listener)`. Plus `PatchCapableAdapter<S>` (optional sub-interface) and `isPatchCapable<S>` type guard.
- Schema bridge: `toJsonSchema(record, options?)` — accepts injected converter; default uses Zod v4's `z.toJSONSchema`.
- `Result<R>` type with **reserved** undo hooks (`patches?`, `effects?`). Phase 1 ignores them; they exist so Phase 4+ can add them non-breakingly.

**`@acture/state-zustand` surface:**
- `createZustandAdapter<S>(store): PatchCapableAdapter<S>` — wraps `zustand/vanilla` `createStore`. Uses `zustand/middleware/immer` with `produceWithPatches` for `setStateWithPatches`.

**`@acture/palette-react` surface (Phase 1, minimum):**
- Wrap cmdk's `<Command>` primitive.
- Iterate registry.list() filtering by tier.
- Group by `category`.
- Show keybinding hints from `record.keybinding`.
- On selection: if `kind === 'atomic'` and params are empty, dispatch immediately. If parameterized: **not yet** — show "parameterized commands coming in Phase 2" placeholder.
- Listen for `commandsChanged`.

**Worked example: `examples/greenfield/graph-editor/`**
- 6–8 commands: `app.graph.addNode`, `app.graph.removeNode`, `app.graph.connectNodes`, `app.graph.deleteEdge`, `app.view.zoomToFit`, `app.selection.selectAll`, `app.view.toggleGrid` (param-free toggle).
- All state mutations go through commands (no direct `setState`).
- State held in a zustand store via the new adapter.
- A `<CommandPalette>` (from `@acture/palette-react`) overlay opens on Ctrl+K and dispatches parameter-free commands.
- One parameterized command (`addNode({x, y, label})`) is registered but **explicitly noted in the README as "Phase 2 will surface this in the palette"**.

**Tests:**
- Property-based test (fast-check) for registry invariants: no duplicate IDs; dispatch of unknown ID returns `{ ok: false }`; subscribers receive `commandsChanged` events; owner disposal removes owned commands.
- Unit tests on the when-clause DSL parser/evaluator.
- Snapshot test: `toJsonSchema(addNodeCommand)` matches the expected JSON Schema.
- Integration test: the graph editor's state is `JSON.stringify`-able and round-trips through `JSON.parse`.

### Skills to load

- `acture-architecture-primer`
- `acture-command-record-shape`
- `acture-state-adapter`
- `acture-schema-bridge` (for the toJsonSchema piece)
- `acture-hard-donts` (merge checklist)

### Acceptance test

1. The graph editor example runs (`pnpm dev` in `examples/greenfield/graph-editor/`).
2. The graph editor uses no `setState` outside `execute` handlers (verifiable by a `rg "store.setState" packages/ examples/greenfield/graph-editor/src/ -t ts` audit).
3. Property tests pass.
4. A second agent, given only the API docs at `packages/core/README.md`, writes a 7th command (e.g. `app.graph.renameNode`) and the example accepts it without changes to the registry or palette. Document the test in `docs/phase-1-acceptance.md` with the dialogue trace.
5. `JSON.stringify(adapter.getState())` round-trips through `JSON.parse(...)` and produces an identical state object (deep equality check in a test).
6. CI green.

### Pre-next-phase reflection checklist

Before Phase 2:

1. **Did the command record shape feel right?** Were there fields you wanted to add but resisted (good — that's the rule of three working)? Were there fields you found yourself never using (consider deletion)? Document in `docs/phase-1-reflection.md`.
2. **Did the StateAdapter interface stretch to cover the zustand case cleanly?** Specifically: did `setState(updater)` accept both `(s) => S` and `(s) => void` (Immer-style) cleanly? If you found friction, what would Phase 2 want different before RTK adapter is added?
3. **Was the when-clause DSL parser worth the complexity?** Estimate LOC. If it's over 200, ask: is the DSL pulling weight against a `(ctx) => boolean` everywhere?
4. **Did the second-agent test surface any docs gaps?** Specifically: did the second agent need to read source instead of docs? Where? Patch docs before Phase 2.
5. **Any "hard don't" violations creep in?** Run the merge checklist from `acture-hard-donts` skill.
6. **Decisions to escalate to user:** any irreversible architectural choices made during Phase 1 that the user should ratify before Phase 2 builds on top of them?

Phase 1 is done when the acceptance test passes AND `phase-1-reflection.md` is committed AND any escalations have user sign-off.

---

## Phase 2 — Adapter buildout

**Goal:** acture is useful across all three positioning paths. Hotkeys, parameterized palette, two state adapters, AI/MCP adapters, two form adapters.

### Scope

**Packages to ship:**
- `packages/hotkeys/` — tinykeys integration; plain DOM API + optional React hook.
- `packages/palette-react/` (extend) — parameterized command support per research-2 §9: auto-derived `kind`, picker chain inside palette for `kind: "atomic"`, modal hand-off (via a form adapter) for `kind: "handoff"`. The `kind` derivation is the heuristic from research-2 §9.3.
- `packages/state-redux/` — RTK reference adapter.
- `packages/forms-autoform/` — Zod-native form adapter.
- `packages/forms-rjsf/` — JSON-Schema-native form adapter.
- `packages/mcp/` — MCP server adapter; iterates registry, exposes tier-`stable` commands as MCP tools by default; tier opt-in for experimental; deprecation banner prepending per research-5 §7.4.
- `packages/ai-vercel/` — Vercel AI SDK adapter; same tier rules.

**Worked examples added:**
- `examples/drop-in/` — mode-1 demo: existing-app skeleton + 5-minute palette + MCP bolt-on.
- `examples/greenfield/graph-editor/` extended with: keyboard shortcuts; parameterized commands now work in palette (`addNode({x, y, label})`); an MCP server runs that exposes the graph commands; an LLM (Claude or GPT-4) demo invokes commands via the Vercel AI adapter.

### Skills to load

- `acture-palette-design` (parameterized palette UX)
- `acture-schema-bridge` (MCP tool projection)
- `acture-state-adapter` (RTK adapter)
- `acture-tier-system` (filtering for MCP + AI)
- `acture-hard-donts`

### Acceptance test

1. Both worked examples (greenfield + drop-in) run.
2. Parameterized commands in the graph editor's palette work as research-2 prescribes:
   - 1-param `addNode({label})` (after `addNode` rescoped) is collected as a single inline picker step.
   - 3-param `addNode({x, y, label})` with x, y as number inputs hands off to a form by default (auto-derived `kind: "handoff"`).
   - Override demo: same command with explicit `kind: "atomic"` shows a 3-step chain instead.
3. MCP client (use `@modelcontextprotocol/inspector` CLI) lists the graph editor's commands as tools, calls one, and gets a valid `Result` response.
4. Vercel AI SDK demo: an `npx ts-node examples/greenfield/graph-editor/scripts/ai-demo.ts` runs Claude against the graph editor commands and successfully composes a multi-step action ("add three nodes labeled A, B, C and connect them in a triangle").
5. Tier filtering: a command marked `@experimental` does NOT appear in the default MCP `tools/list` output. The same command DOES appear when the MCP server is created with `tiers: ['stable', 'experimental']`.
6. CI green across the new packages.

### Pre-next-phase reflection checklist

Before Phase 3:

1. **Did research-2's auto-derived `kind` heuristic match user expectations?** Specifically: for each parameterized command in the worked examples, was the auto-derived `kind` the right call, or did you have to override? If override rate > 30%, the heuristic needs refinement.
2. **Did the StateAdapter interface stretch to RTK cleanly?** Especially: did the patch-capable interface fit Immer's `produceWithPatches` for both zustand+immer and RTK's built-in Immer? Document in `docs/phase-2-reflection.md`.
3. **Did the schema bridge survive the AI SDK contact?** Vercel AI SDK accepts Zod directly. MCP wants JSON Schema. Was the conversion path clean, or did edge cases surface? List them.
4. **What did the keyboard-shortcuts integration teach about the `keybinding` field shape?** If you needed an extra field, document why.
5. **Hard-don'ts audit:** Did any adapter package start containing business logic? Did core gain a React import?
6. **Decisions to escalate:** anything in Phase 2 that should be ratified before Phase 3 builds the migration package on top?

Phase 2 is done when these are in `phase-2-reflection.md` and any escalations are resolved.

---

## Phase 3 — Migration package and skills

**Goal:** Ship `acture/migration` per research-4 §A.6. Ship the migration-track skills. Demonstrate the end-to-end workflow against a small fixture app.

### Scope

**Package to ship:**
- `packages/migration/` exporting:
  - `wrapMutation<H>(handler: H, options?): H` — load-bearing primitive. Wrap an existing function as a command without changing call sites. Options: `id?` (defaults to `handler.name` or auto-generated), `logTo?` (defaults to console in dev, noop in prod), `onDispatch?`.
  - `actureMiddleware` — Redux/Zustand-compatible store-event interception middleware. Translates store actions into command dispatches without bypassing the registry.
  - `chooseImplementation<Args, R>(pick, impls): (...args: Args) => R` — 5-line helper. Composes with any feature-flag SDK (LaunchDarkly, Statsig, Unleash, etc.).
  - `shadowCompare<Args, R>(modern, legacy, options?)` — Scientist-style: run modern, log if legacy result differs.

**Skills to ship (in `acture/.claude/skills/`):**
- `migration-diagnose` — rewrite of wrapex `01-diagnose.md` against acture's API.
- `migration-plan` — rewrite of `02-plan.md`.
- `migration-scaffold` — rewrite of `03-scaffold.md`.
- `migration-wrap` — rewrite of `04-wrap.md` using `wrapMutation`.
- `migration-graduate` — NEW. How to retire `wrapMutation` calls once the legacy handler is no longer needed. The "let the host die" step in the strangler-fig metaphor.

**Worked example:**
- `examples/migration/zustand-wrap/` — a small existing zustand React app fixture (NOT an acture-aware app); the implementing agent uses the migration skills to introduce acture, then graduates.

### Skills to load

- `acture-migration-package`
- `acture-architecture-primer`
- `acture-hard-donts`

### Acceptance test

1. The fixture app at `examples/migration/zustand-wrap/before/` is a working React app with no acture imports.
2. Following the migration skills (`migration-diagnose` → `migration-plan` → `migration-scaffold` → `migration-wrap`), at least 5 commands are wrapped without breaking existing UI behavior.
3. The migrated app (`examples/migration/zustand-wrap/after/`) has the same behavior plus a working command palette (Ctrl+K) over the wrapped commands.
4. `migration-graduate` demonstrates retiring at least 2 of the `wrapMutation` calls (the legacy handlers are now unused).
5. CI green.

### Pre-next-phase reflection checklist

Before Phase 4:

1. **Was `chooseImplementation` actually used in the worked migration?** If no — was it because the use case didn't arise, or because the API is awkward? If awkward, redesign before declaring Phase 3 done. (research-4 said this could be the next "drop" candidate if no one uses it.)
2. **Was `shadowCompare` used?** Same question.
3. **Was `actureMiddleware` used?** Did it correctly intercept the store events without bypassing acture's `dispatch`?
4. **Did the migration skills produce a workflow Claude Code can follow without human handholding?** If you find yourself manually correcting the agent at step N consistently, fix that skill.
5. **What was the worst trap the migration agent fell into?** Document for `migration-diagnose` improvement.
6. **Hard-don'ts audit.**
7. **Decisions to escalate:** anything that needs user ratification before Phase 4 (the stability phase) commits to public-API tier marks?

Phase 3 is done when these are in `phase-3-reflection.md`.

---

## Phase 4 — Stability, tier system, devtools

**Goal:** Move from "works" to "production-ready" and ship v1.0.

### Scope

**Tier system enforcement (per research-5 §7):**
- Build step that scans `.ts` source for `@stable` / `@experimental` / `@internal` / `@deprecated` JSDoc tags on `defineCommand` calls and mirrors them into the command's `tier` metadata field at build time. (One tsup plugin or one esbuild plugin.)
- Runtime gating in `registry.toMCPServer({ tiers })`, `registry.toAITools({ tiers })`, `registry.toPaletteCommands({ tiers })`. Defaults: `['stable']`.
- `@deprecated` banner prepending in description for MCP / AI surfaces.
- `@internal` symbol-token enforcement (per research-5 §7.5): runtime throws if dispatched from outside the registering module.

**`acture compare-schemas` CLI (per research-5 §6):**
- New `packages/cli/` package with binary `acture`.
- `acture compare-schemas <base> [<head>]` walks the registry in both refs, projects through schema bridge, diffs tool envelopes (not just inputSchema).
- `--fail-on <severity>` for CI gating.
- `--allow-description-edits` (per-invocation, NOT a config setting) to downgrade description-only diffs to MINOR.
- `--format json|text` output. Text default colored, JSON for machines.
- Change classifications per research-5 §6.1 table.

**`packages/devtools/`:**
- Inspector UI: registry contents, dispatch log, when-clause evaluator state, tier filter preview.
- Use it as a React component embeddable in dev builds.

**Hardening:**
- Audit all error messages for actionability.
- Add JSDoc to every public export.
- Fill remaining test gaps (target: each `core` public function has at least one happy-path test + one error-path test).
- Bump all packages to v1.0.0.

### Skills to load

- `acture-tier-system`
- `acture-schema-bridge`
- `acture-hard-donts`

### Acceptance test

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

### Pre-next-phase reflection checklist

Before v1.0 release:

1. **Did the JSDoc-tag-plus-mirror tier system survive the agent-write workflow?** Specifically: when an agent edits a command's source, does the build step correctly re-mirror the tag? Did anything drift?
2. **Was `acture compare-schemas` ready to gate the v1 release in CI?** Per `v1_plan.md` §7, "expect schedule slip" — was the schedule met?
3. **Are there pending Phase 4 items that should defer to v1.1 instead of blocking v1.0?** Document trade-offs.
4. **Final hard-don'ts audit across the whole codebase.**
5. **Run the second-agent test again at v1.0:** a fresh agent reads `acture/AGENTS.md` and the README, then writes a command in a small new app. Does it work end-to-end without reading source?

v1.0 ships when these are answered.

---

## Cross-phase notes

### Sequencing of irreversible architectural decisions

These are decisions where reversing in a later phase costs significant rework. They are listed here so future-phase agents know what NOT to revisit:

1. **CommandRecord shape (Phase 1).** Adding a field after v1.0 is fine (minor); removing or renaming a field is a major break.
2. **StateAdapter interface (Phase 1).** Three methods plus optional capability extension. Adding a method is fine; reshaping is major.
3. **When-clause DSL grammar (Phase 1).** The operator set is locked at v1.0; adding operators is fine; redefining semantics is major.
4. **Tier metadata field's exact name and enum values (Phase 4).** `tier: "stable" | "experimental" | "internal" | "deprecated"` — these enum values are part of the public surface and `acture compare-schemas` reads them.
5. **The `kind: "atomic" | "handoff"` enum (Phase 2).** Adding a third value (e.g., `"async"` or `"streaming"`) post-v1.0 is a minor expansion only if all consumer adapters can handle the unknown value gracefully.

### Decisions deliberately deferred to later phases

- **Macro/replay system:** post-v1.
- **Telemetry middleware:** post-v1.
- **Undo subsystem:** post-v1; hooks reserved in Phase 1.
- **Python companion:** post-v1; research-6 not executed.
- **Codemods:** v1.1 per research-4.
- **DOM-event interception:** v1.1 per research-4.

### What is explicitly NOT in scope for v1.0

Same as `v1_plan.md` §5 post-v1 list. Repeated here for emphasis: macros, telemetry, sandboxing, Jotai/Valtio adapters, Python.

---

## How to use this document

- **Implementing agent:** at the start of each phase, read the corresponding section here AND the indicated skills. At the end of each phase, write the reflection note and commit it.
- **Planning agent in a future session:** start from the most recent `docs/phase-N-reflection.md` and `docs/v1_plan.md`. Re-plan only if the reflection surfaced design changes.
- **User:** the reflection notes are your check-in points. After each phase's reflection note is committed, you can audit the decision trail without re-reading source.
