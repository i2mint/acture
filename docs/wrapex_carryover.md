# wrapex → acture Carryover Triage

**Source:** `/Users/thorwhalen/Dropbox/py/proj/t/wrapex/`
**Date:** 2026-05-12
**Decision (this session):** **Discard `src/`; rewrite cleanly in Phase 1.** The `src/` code is small (~1100 LOC) and divergent enough from the new architectural commitments that rewriting is faster than reshaping. Docs were the load-bearing legacy and have been migrated.

This file is the audit-of-record. Future Phase 1 / Phase 3 agents should consult it before reinventing anything that already exists in wrapex.

---

## Per-file disposition

Legend:
- **MIGRATED** — already copied/migrated in this preparation session.
- **DISCARD** — do not carry forward. Reason given.
- **REFERENCE** — do not copy, but read during the corresponding phase as design inspiration.
- **REWRITE-IN-PHASE-N** — concept survives; implementation must be rewritten against acture's actual API.

### Docs (`wrapex/docs/`)

| File | Disposition | Notes |
| --- | --- | --- |
| `command_dispatch_journal_article.md` | MIGRATED — already at `acture/docs/` with matching SHA-256 | Canonical. Do not edit. |
| `parameterized_command_palette_guide.md` | MIGRATED — at `acture/docs/parameterized_command_palette_guide.md` with rename banner | Pattern guide. Defer to `research/acture_research_2 ...` for any UX conflict. |
| `redesign_takeaways.md` | MIGRATED — at `acture/docs/redesign_takeaways.md` with rename banner; §2.5 marked resolved | Opinionated synthesis. The five research findings now resolve most of its `🔬 RESEARCH-GATED` items; refer to `v1_plan.md` for the current state. |
| `reference_notes.md` | MIGRATED — at `acture/docs/reference_notes.md` with rename banner | Distilled per-article notes for all 51 refs. The `... -- fetched/` directory of source ref_NN_*.md files is external (see banner). |

### TypeScript runtime (`wrapex/src/`)

**Top-level decision: DISCARD.** Rewrite all of these cleanly in Phase 1. Reasons:
- `CommandDefinition` carries fields the new `CommandRecord` rejects: `inputComponent`, `metadata: PolicyMetadata` bag, `tags`, `isVisible`/`isEnabled` callbacks, top-level `requiresConfirmation`.
- Missing the new `kind: "atomic" | "handoff"` field, `tier`, and the keybinding-as-string-DSL shape.
- Zustand is baked into core (`createStore<RegistryState>`). The new design requires zustand to live behind a `StateAdapter<S>` interface, with the registry itself usable without any state library.
- `evaluateWhen` is a host-provided callback, but the new design requires a built-in DSL parser/evaluator with operators (`!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~`, `in`, `not in`) and a function escape hatch.
- `portable-schema.ts` uses prototype-chain heuristics to find zod; the new design accepts an injected converter or uses Zod v4's `z.toJSONSchema` directly.
- No tier system, no schema-diff support, no `kind` field — would need to be threaded through everywhere.

| File | LOC | Disposition | Notes |
| --- | --- | --- | --- |
| `src/define-command.ts` | ~163 | DISCARD — REFERENCE in Phase 1 | The new `CommandRecord` shape (per `v1_plan.md` §4) is the spec. Read this only to see what fields were tried; do not copy. |
| `src/command-registry.ts` | ~331 | DISCARD — REFERENCE in Phase 1 | The new core requires no state-lib dependency. The owner-scoped registration (`registerForOwner`/`unregisterForOwner`) is a concept worth preserving in the new disposable-returning shape. |
| `src/middleware-pipeline.ts` | ~110 | DISCARD — REFERENCE in Phase 1 | The middleware signature `(command, params, context, next) => Promise<Result>` is correct; rewrite against the new `CommandRecord` and `Result<R>` shapes. `errorBoundaryMiddleware` becomes the dispatcher's default catch (errors-as-data); not a separate middleware. |
| `src/portable-schema.ts` | ~87 | DISCARD | Replace with `acture/core` `toJsonSchema(schema, options)` that accepts an injected converter; default is Zod v4's `z.toJSONSchema`. |
| `src/validation-middleware.ts` | ~50 | DISCARD | Validation happens at the dispatcher (errors-as-data), not as a middleware. Pre-dispatch validation IS the dispatcher's job. |
| `src/telemetry-middleware.ts` | ~85 | DISCARD — defer to post-v1 | Telemetry middleware is explicitly deferred. |
| `src/index.ts` | ~46 | DISCARD | Will be replaced by `acture/core` entry. |
| `src/adapters/palette-adapter.ts` | ~83 | DISCARD — REFERENCE in Phase 1+2 | The cmdk-compatible entry shape is useful. Rewrite as `acture/palette-react`'s adapter. Note the new design adds `kind`-aware behavior and tier filtering. |
| `src/adapters/mcp-adapter.ts` | ~130 | DISCARD — REFERENCE in Phase 2 | The `McpServerLike` interface and the tool-name conversion are good seeds for `acture/mcp`. The new design adds tier filtering and the prepended-deprecation-banner pattern (research-5 §7.4). |
| `src/adapters/ai-tools-adapter.ts` | not read | DISCARD — REFERENCE in Phase 2 | Read in Phase 2 only if useful. |
| `src/adapters/test-generator.ts` | not read | DISCARD — REFERENCE post-v1 | `acture/test-property` is deferred. |
| `src/adapters/index.ts` | ~23 | DISCARD | Trivial re-export. |
| `src/schemas/command-candidate.schema.ts` | ~85 | DISCARD — REFERENCE in Phase 3 | Diagnose/plan/wrap workflow schemas. Useful when rewriting the migration-track skills. |
| `src/schemas/diagnosis-report.schema.ts` | ~60 | DISCARD — REFERENCE in Phase 3 | Same. |
| `src/schemas/refactoring-plan.schema.ts` | ~75 | DISCARD — REFERENCE in Phase 3 | Same. |
| `src/schemas/index.ts` | ~30 | DISCARD | Trivial re-export. |

### Templates (`wrapex/templates/`)

All templates were `// CONFIGURE:`-tagged copy-and-adapt stubs. They are bound to the old `CommandDefinition` shape. **DISCARD; reference only in Phase 3** for the *idea* of CONFIGURE-tagged templates.

| File | Disposition |
| --- | --- |
| `templates/command-definition.ts.template` | DISCARD — REFERENCE in Phase 3 |
| `templates/command-registry.ts` | DISCARD |
| `templates/define-command.ts` | DISCARD |
| `templates/middleware-pipeline.ts` | DISCARD |
| `templates/palette-adapter.ts` | DISCARD |
| `templates/mcp-adapter.ts` | DISCARD |
| `templates/ai-tools-adapter.ts` | DISCARD |
| `templates/telemetry-middleware.ts` | DISCARD |
| `templates/validation-middleware.ts` | DISCARD |
| `templates/test-generator.ts` | DISCARD |
| `templates/param-collector.ts` | DISCARD — REFERENCE in Phase 2 | 10kB. The introspect-schema + coerce + select-pattern logic is valuable seed for `acture/palette-react`'s parameter collector. |

### Tests (`wrapex/ts-tests/`)

| File | Disposition | Notes |
| --- | --- | --- |
| `command-registry.test.ts` | DISCARD — REFERENCE in Phase 1 | Test *shape* and assertions are inspiration for the new test suite. Do not port directly — the API surface has changed. |
| `define-command.test.ts` | DISCARD — REFERENCE in Phase 1 | Same. |
| `middleware.test.ts` | DISCARD — REFERENCE in Phase 1 | Same. |
| `schemas.test.ts` | DISCARD — REFERENCE in Phase 1 | Same. |

### Examples (`wrapex/examples/`)

All four examples are *migration* examples (wrapping existing state libs). They become Phase 3 inputs, not Phase 1.

| Directory | Disposition |
| --- | --- |
| `examples/zustand-store-wrap/` | REWRITE-IN-PHASE-3 — as `examples/migration/zustand-wrap/` |
| `examples/event-handler-wrap/` | REWRITE-IN-PHASE-3 — as `examples/migration/event-handler-wrap/` |
| `examples/api-call-wrap/` | REWRITE-IN-PHASE-3 — as `examples/migration/api-call-wrap/` |
| `examples/redux-action-wrap/` | REWRITE-IN-PHASE-3 — as `examples/migration/redux-wrap/` |

### Skills (`wrapex/skills/`)

These 13 skills target an agent migrating an existing codebase. They become Phase 3 inputs. **Do NOT copy them into `acture/.claude/skills/` in this preparation session.** They will be rewritten against acture's actual API once Phase 1/2 land.

| File | Disposition |
| --- | --- |
| `01-diagnose.md` | REWRITE-IN-PHASE-3 — as `acture/.claude/skills/migration-diagnose.md` |
| `02-plan.md` | REWRITE-IN-PHASE-3 — as `migration-plan.md` |
| `03-scaffold.md` | REWRITE-IN-PHASE-3 — as `migration-scaffold.md` |
| `04-wrap.md` | REWRITE-IN-PHASE-3 — as `migration-wrap.md` |
| `05-enrich.md` | REWRITE-IN-PHASE-3 — universal skill, not migration-only |
| `06-wire-palette.md` | REWRITE-IN-PHASE-2 |
| `07-wire-shortcuts.md` | REWRITE-IN-PHASE-2 |
| `08-wire-telemetry.md` | REWRITE-POST-V1 (telemetry deferred) |
| `09-wire-ai-tools.md` | REWRITE-IN-PHASE-2 |
| `10-wire-mcp.md` | REWRITE-IN-PHASE-2 |
| `11-wire-tests.md` | REWRITE-IN-PHASE-2 |
| `12-wire-feature-flags.md` | REWRITE-POST-V1 |
| `13-wire-palette-params.md` | REWRITE-IN-PHASE-2 — defer to `research/acture_research_2 ...` for new param-collection UX policy |

### Rules (`wrapex/rules/`)

These are coding conventions, not architectural decisions. They are mostly compatible with acture's design (verb-noun command IDs, category conventions, when-clause grammar). However, they were written for a specific authoring workflow that may not match acture's. Treat as REFERENCE.

| File | Disposition |
| --- | --- |
| `rules/command-naming.md` | REFERENCE in Phase 1 — most conventions are sound; the variable-name convention (`{action}Command`) is wrapex-specific and should be reconsidered |
| `rules/command-categories.md` | REFERENCE in Phase 1 — the *practice* of categorization is fine; the specific category list is example-specific |
| `rules/when-clause-conventions.md` | REFERENCE in Phase 1 — the DSL grammar described is essentially the one acture should implement; the standard context keys are example-specific |

### Schemas (`wrapex/schemas/`)

Same as `src/schemas/` (duplicate at repo root); REFERENCE in Phase 3.

### Scripts (`wrapex/scripts/`)

| File | Disposition |
| --- | --- |
| `scripts/sync-py-data.sh` | DISCARD — it syncs `src/` and `skills/` into the Python package's `wrapex/data/` directory for the bundled-skill distribution model. The acture Python companion package is post-v1; the bundling pattern itself is potentially worth knowing (see `~/.claude/skills/skill-enable/` user-skill for the canonical pattern). |

### Python package (`wrapex/python/wrapex/`)

The Python package was a thin data-access wrapper over the bundled skills/rules/examples. Its only purpose was to let `pip install wrapex` users programmatically read `wrapex.get_skill('01')`. Since acture's Python companion package is deferred to post-v1 (research-6 not executed), DISCARD entirely.

### Top-level files

| File | Disposition |
| --- | --- |
| `README.md` | DISCARD — REFERENCE for Phase 0 README author |
| `SKILL.md` | DISCARD — to be replaced by `acture/.claude/skills/` collection + `AGENTS.md` |
| `AGENTS.md` | DISCARD — to be replaced by `acture/AGENTS.md` |
| `package.json` | DISCARD — Phase 0 scaffolds a fresh monorepo `package.json` |
| `pyproject.toml` | DISCARD — Phase 0 scaffolds a fresh `pyproject.toml` |
| `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` | REFERENCE — config is fine; rebuild from scratch in Phase 0 with awareness of the monorepo layout |
| `LICENSE` | COPY — Apache-2.0; same license is fine for acture |
| `.gitignore`, `.npmrc` | REFERENCE — bring forward sensible parts in Phase 0 |
| `dist/`, `node_modules/`, `.pytest_cache/` | DISCARD (artifacts) |

---

## What's lost by discarding

Honest accounting of what wrapex code provided that needs to be rebuilt:

1. **Owner-scoped lifecycle** (`registerForOwner` / `unregisterForOwner`) — the *concept* is preserved (Disposable pattern), but the specific API needs to be rewritten. ~30 LOC.
2. **The wrapex middleware pipeline** — replace with a thinner pipeline that doesn't conflate validation/error-boundary with cross-cutting concerns. ~50 LOC.
3. **The cmdk-shaped palette adapter** — rewrite to handle `kind: "atomic" | "handoff"` and tier-aware filtering. ~150 LOC.
4. **MCP adapter** — rewrite to add tier filtering and deprecation banner prepending. ~100 LOC.
5. **The 13 procedural skills** — rewritten against acture's actual API as part of Phases 2-3.

Total estimated rewrite cost vs. reshape: rewrite is ~600-800 LOC; reshape would have been ~1000-1500 LOC of refactoring across 15 files. Rewrite wins.

---

## Status of this triage

This document is the audit-of-record. Phase 1 / Phase 2 / Phase 3 agents may consult specific wrapex files marked REFERENCE to mine ideas, but **the new code should be authored from the architectural spec in `v1_plan.md`, `redesign_takeaways.md`, and the research findings — not from wrapex source.**
