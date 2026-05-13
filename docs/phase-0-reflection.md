# Phase 0 Reflection

**Authored:** 2026-05-12 by the Phase 0 implementing agent.
**Status of acceptance test:** green locally (`pnpm install`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build`, `pnpm --filter acture pack` all succeed). CI green is to be confirmed once pushed.

This file answers the four questions from `docs/implementation_plan.md` §"Phase 0 → Pre-next-phase reflection checklist." Phase 1 starts when this is committed.

---

## 1. Was the monorepo tooling the right choice?

**Picked:** pnpm workspaces (pnpm v11 installed locally; CI pins v10 via `pnpm/action-setup@v4`).

**Why this and not alternatives:**

- **vs. npm workspaces** — pnpm's content-addressable store means the "10 copies of zod" problem is avoided once `acture/state-zustand`, `acture/state-redux`, `acture/palette-react`, etc. all depend on `zod`. npm workspaces hoist but still duplicate when version ranges drift.
- **vs. Yarn Berry** — works fine but adds Plug'n'Play complications for tooling (`tsup`, `vitest`, future `tsx`-based scripts) that don't all play nicely with PnP.
- **vs. Nx / Turborepo** — both add a task-graph runner on top of a package manager. At Phase 0 with one package, that's pure overhead. We can layer Turborepo or Nx on top later if `pnpm -r` parallelism stops being enough (typical inflection point is ~15+ packages or non-trivial inter-package build dependencies). For v1.0 (~10 packages, mostly independent), `pnpm -r` is sufficient.

**Friction encountered:**

- **pnpm 10's `allowBuilds` gate.** pnpm 10+ refuses to run install-time scripts (e.g. esbuild's postinstall that fetches its native binary) unless the package is explicitly approved in `pnpm-workspace.yaml`. The default `pnpm install` error message is opaque; the fix is to add `allowBuilds: { esbuild: true }` (and any other build-script dependencies that surface) plus `onlyBuiltDependencies: [esbuild]`. Phase 1 agents will hit the same prompt when they add zustand or any package with native deps. Documented in the `pnpm-workspace.yaml` comments.

**Recommendation:** keep pnpm for v1.0. Revisit at v1.x if cross-package builds start taking >30s and we want incremental graph-aware execution.

## 2. Is the `exports` field per-package agent-friendly?

The `packages/core/package.json` `exports` field is:

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.cjs"
  },
  "./package.json": "./package.json"
}
```

**Test:** at Phase 1, when `packages/state-zustand` adds an internal import `from 'acture'`, will it resolve? With pnpm workspaces and `workspace:*` dependency declarations, sibling packages get symlinked into `node_modules` and the `exports` map applies the same way it would for an external consumer. The "types" condition fires for tsc/IDE, "import" for runtime ESM, "require" for CJS. Confirmed locally: `tar -tzf` shows `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts` all emitted as expected.

**One subtle gotcha for Phase 1 agents:** when adding a new package that imports from `acture`, declare `"acture": "workspace:*"` in its `dependencies` (or `devDependencies` for tests). Do NOT use a relative path import (`from '../core/src/index.js'`) — that bypasses the `exports` map and produces invalid emit paths when the package is built.

**Verdict:** the `exports` shape is agent-friendly. The convention to document in `AGENTS.md` (Phase 1's job) is: **always import siblings via the package name, never via relative path.**

## 3. Is the build producing types and runtime correctly?

`tsup` is producing both ESM (`dist/index.js`) and CJS (`dist/index.cjs`) bundles, plus matching declarations (`.d.ts` and `.d.cts`), plus sourcemaps. The runtime payload is correct:

- `dist/index.js` exports `defineCommand`, `__version` as ESM named exports.
- `dist/index.cjs` exposes them on `exports.*` with `'use strict'` directive.
- `dist/index.d.ts` and `dist/index.d.cts` declare `CommandSpec` as `type`, plus `defineCommand` and `__version`.

The tarball (`/tmp/acture-0.0.0.tgz`) contains exactly:

```
package/dist/index.cjs
package/dist/index.cjs.map
package/dist/index.d.cts
package/dist/index.d.ts
package/dist/index.js
package/dist/index.js.map
package/package.json
package/README.md
package/LICENSE
```

**A note on `LICENSE`:** pnpm pack auto-included the workspace-root `LICENSE` even though there is no per-package one. This is desirable behavior (every published package gets the Apache-2.0 text) and matches npm conventions — but it surprised me. If a Phase N agent ever sees the LICENSE missing from a tarball, the first thing to check is whether the workspace-root LICENSE was deleted or renamed.

**Verdict:** build is correct. No reshape needed before Phase 1.

## 4. Did anything in Phase 0 surface a hidden assumption in the docs?

Three things worth noting:

1. **Workspace-root `vitest.config.ts` is a trap.** The next-session handoff said "vitest.config.ts (workspace root config)." When `vitest run` is executed from inside `packages/core`, Vitest walks up from the cwd looking for a config and finds the root one first. The root config tried to `import from 'vitest/config'` — but `vitest` is a per-package devDependency, not a workspace-root one. Result: `ERR_MODULE_NOT_FOUND`. The fix was to add a `packages/core/vitest.config.ts` (which Vitest finds first) AND demote the root config to an inert `export default {}` stub. Phase 1 should either:
   - Add `vitest` to root devDependencies and restore a real root config, OR
   - Document explicitly that vitest configs are per-package and the root stub is intentional.
   
   The current setup is intentional but bears a comment in the root file.

2. **pnpm-workspace.yaml `allowBuilds` schema.** The next-session handoff did not mention pnpm 10's build-script gating. Phase 1 agents installing zustand, react, or any package with a postinstall hook will hit this same prompt. Pre-emptive list of likely Phase 1 candidates: `react` (no postinstall), `zustand` (no postinstall), `cmdk` (no postinstall) — actually most pure JS deps are fine. But `@biomejs/biome`, `prettier` (no), `@swc/core`, `sharp`, anything with native bindings will trigger it. The `pnpm-workspace.yaml` already has the format documented for them.

3. **The "Step 2 — Verify name reservation status" check was already a no-op.** Both `acture` (npm) and `acture` (PyPI) were already published at v0.0.0 by the preparation session. `npm view acture` returned full metadata; PyPI's `/simple/acture/` returned HTTP 200. The Phase 0 agent's job here was confirmation, not publication. The handoff doc could be tightened: "if these are already done, just confirm and move on."

None of these required doc changes that block Phase 1. They are noted here so the Phase 1 agent's `next_session_phase_1.md` handoff can preemptively warn about them.

---

## Phase 1 readiness gate

Per `docs/implementation_plan.md` §"Phase 0 acceptance test" all five checks pass locally:

1. `pnpm install` — ✅
2. `pnpm -r typecheck` — ✅ (no errors)
3. `pnpm -r test` — ✅ (3/3 tests pass: version stub, freeze, mutation-throws)
4. `pnpm -r build` — ✅ (tsup emits ESM + CJS + d.ts + sourcemaps)
5. `pnpm --filter acture pack` — ✅ (9-file tarball, dual-format, types, LICENSE, README)

CI workflow (`.github/workflows/ci.yml`) is in place but cannot self-verify without a push; the Phase 1 agent should confirm CI green on the first push.

**Phase 0 is done. Phase 1 starts when the user has reviewed this reflection and the `docs/next_session_phase_1.md` handoff.**
