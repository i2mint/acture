# v1.10 Reflection

**Authored:** 2026-05-15 by the v1.10 implementing agent. Two small, autonomous backlog items both surfaced by research-6. **441 package tests** (was 422; +19 from the new ESLint rule, +2 from the MCP spec-version pin) + 41 example tests, all green; every package and example builds + typechecks.

## The scope decision

`docs/next_session.md` flagged the named backlog as "nearly drained" and laid out four directions. Surfaced via `AskUserQuestion`; user picked **"smaller backlog items (autonomous)"** — the disciplined pick over pulling a post-v1 item forward (Python companion / `acture-undo` / `acture-telemetry`) without explicit user direction. The two items are independent, both research-6 follow-ups, both autonomous.

## Item 1 — `acture/require-param-describe` schema-quality lint rule

Why this matters: Zod → JSON Schema is lossy. A bare `z.string()` projects to `{ type: 'string' }` with no `description`. Every downstream consumer — MCP tool inputs (`acture-mcp-server`), AI function-calling tool args (`acture-ai-vercel` and any agent-written equivalent), autoform / rjsf form adapters — is then handed a parameter with no semantic hint. A model cannot know what to put in `query`; a form renderer has no label. `.describe('...')` carries through to JSON Schema's `description` field, which is what those consumers read. Missing it is a real quality bug, not a style preference.

### The plugin-location decision

The roadmap suggested "a future `eslint-plugin-acture` schema-quality rule." Creating a *new* one-rule plugin would be a god-package-of-one — exactly the speculative infrastructure hard-don't #2 (no god-package) and YAGNI guard against (v1.7 declined `acture-sequence` on adjacent grounds; v1.9 declined the `.d.ts` tier mirror). Renaming the existing `eslint-plugin-acture-migration` package is breaking for any consumer pinning the name.

**Decision:** add the rule to the existing `eslint-plugin-acture-migration` plugin, keep the package name (the historical `-migration` suffix is reality, not a deception — renaming is a breaking change that would yield zero functional improvement), and update the plugin's intro to clarify scope: the plugin hosts both migration-specific and schema-quality rules under the `acture/` prefix.

### The rule's detection contract

Single-file and conservative, same discipline as `acture/no-stale-wrap-mutation`:

- Tracks the locally-bound name of `defineCommand` (default imported from `'acture'`; configurable via `actureModule`).
- Tracks the locally-bound name of Zod (default `z` from `'zod'`; configurable via `zodModule`). Both named imports and namespace imports are recognised.
- Fires only when both bindings are recognised **and** the `params:` value is structurally `<z>.object({ ... })`. A `params` from a variable, a `z.discriminatedUnion(...)`, or a custom factory is left alone — false positives are louder than false negatives in lint.
- For each top-level field in the object literal, walks the value's method-call chain; reports if no `.describe(...)` appears anywhere. `.describe()` can sit anywhere in the chain (`.min(1).describe('...')` or `.describe('...').min(1)` both work).

Nested `z.object({...})` inner keys are intentionally NOT walked (a nested object without `.describe()` is flagged at the outer level only) — a future enhancement once a real codebase shows demand. 19 RuleTester cases cover the valid/invalid matrix.

`minor` changeset on `eslint-plugin-acture-migration` (1.0.0 → 1.1.0). The bundled `recommended` config now enables both rules at `'warn'`.

## Item 2 — MCP spec-version pin

The MCP protocol is date-versioned (the SDK exports `LATEST_PROTOCOL_VERSION` as a string like `'2025-11-25'`), and the spec/transport story has churned historically (SSE → streamable HTTP). Per the standing decision recorded in the roadmap, a protocol-version upgrade is **semver-major** for `acture-mcp-server` — but until v1.10 nothing enforced that. A future SDK bump could quietly raise `LATEST_PROTOCOL_VERSION` and `acture-mcp-server` would pick up the new spec on the next `pnpm install`, with no signal to the maintainer that anything had changed.

**Fix:** a hygiene test (`packages/mcp/src/spec-version.test.ts`) that pins `EXPECTED_PROTOCOL_VERSION = '2025-11-25'` (the SDK's current value at v1.10), asserts the SDK's `LATEST_PROTOCOL_VERSION` matches, and asserts `SUPPORTED_PROTOCOL_VERSIONS` still contains the older dates the package interoperates with (`2024-11-05`, `2025-03-26`, `2025-06-18`). When the SDK ships a new spec date, this test fails on `pnpm -r test` — the upgrade surfaces as the deliberate decision the roadmap calls for. The test file's header carries a four-step upgrade checklist (read SDK release notes → run full suite → bump `EXPECTED_PROTOCOL_VERSION` + ship as `major` → or hold the SDK at the prior minor).

The expected value lives in the test, not in source: a bump is a one-line diff in this file (reviewable), not a silent transitive-dep change. README documents the policy and points at the upgrade checklist.

`patch` changeset on `acture-mcp-server` (no API change — internal hygiene only).

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.10 increment.

1. **No conditional logic in command metadata.** ✅ No `CommandRecord` change. The lint rule *reads* command-spec source structure but doesn't add anything to the metadata surface.
2. **No god-package.** ✅ The central decision of the increment. Adding a second rule to an existing plugin instead of creating a new plugin-of-one was specifically about *not* god-packaging an empty `eslint-plugin-acture`.
3. **No business logic in adapter packages.** ✅ The MCP spec-version test is a hygiene assertion; `acture-mcp-server`'s code didn't change. The lint rule lives in a lint plugin, which by definition translates source to diagnostics rather than enacting business logic.
4. **No `if (mode === ...)` in shared helpers.** ✅ N/A.
5. **No `eval()`-ing LLM strings.** ✅ N/A.
6. **No coupling the registry to React.** ✅ N/A.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ N/A.
8. **No bundling a UI kit.** ✅ N/A.
9. **No marketing on category.** ✅ Both items lead with the concrete user win: the lint message names the field; the MCP test header names the upgrade checklist.
10. **No assuming the LLM's chosen function is authorization.** ✅ N/A.

**Scope discipline (hard-don't #2 + YAGNI).** Applied twice this increment: (a) declined to create `eslint-plugin-acture` for a single rule (god-package-of-one), and (b) the lint rule itself was scoped to top-level fields only — nested-object descent waits for a concrete need. Adding the rule to the existing plugin is the right call: the existing plugin already shipped, the new rule is a concrete capability with concrete value, and the package's broadened scope is documented honestly rather than papered over. (See `docs/redesign_takeaways.md` §6: the rule of three is a *user-facing* heuristic for application developers, not a maintainer-side gate; previous wording here invoked it incorrectly and has been replaced with the actual principles.)

**Positioning check (merge-ritual #6).** Could a developer get this value without an `acture-*` package? **Yes for both items.** The lint rule is an ESLint plugin — entirely a dev-tool, never a runtime dependency, exactly what the dev-tool-first principle calls for. The MCP spec-version pin is internal to `acture-mcp-server` — a developer using the hand-written MCP path (`docs/hand-written-registry.md` style) doesn't even encounter it. The dev-tool-first principle holds.

## Stat sheet

| Metric | v1.9 end | v1.10 end | Δ |
| --- | --- | --- | --- |
| Packages | 16 | 16 | 0 |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 422 | 441 + 2 | +21 (+19 lint rule, +2 MCP spec-version) |
| Tests (examples) | 41 | 41 | 0 |
| Skills | 22 | 22 | 0 |
| Reproducibility / recipe docs | 3 | 3 | 0 |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |
| Pending changesets | 1 (consumed) | 2 (`eslint-plugin-acture-migration` minor + `acture-mcp-server` patch) | — |

CI green across the workspace: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all pass. `changeset status` confirms the two pending changesets bump exactly those two packages, no cascade.

## Release readiness

- ✅ All 16 packages typecheck and build; 4 example apps build + pass.
- ✅ Full workspace green; hard-don'ts audit clean; positioning check passes.
- ✅ Two pending changesets — `eslint-plugin-acture-migration` `minor` (new rule) and `acture-mcp-server` `patch` (internal hygiene test). No cascade.

**v1.10 is DONE.** Next session: see `docs/next_session.md`.
