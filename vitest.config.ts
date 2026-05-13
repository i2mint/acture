// Workspace-root Vitest placeholder.
//
// Each package owns its own `packages/*/vitest.config.ts`, which Vitest finds
// first when started from inside a package directory. This file exists only so
// editor tooling that resolves config relative to the repo root doesn't crash.
// It does NOT import from `vitest` directly — `vitest` is a per-package
// devDependency, not a workspace-root one (Phase 0 deliberately keeps the root
// install minimal). If you genuinely need cross-package vitest at the root,
// add `vitest` to the root devDependencies and replace this stub.
export default {};
