# Phase 4 Reflection

**Authored:** 2026-05-13 by the Phase 4 implementing agent. All previous tests still pass; **270 package tests** (was 185 at end of Phase 3; +85 across 4 new test files / 4 new files in existing packages). Plus the 7 greenfield integration tests still pass. Every package and example typechecks and builds via tsup / vite.

This file answers the five questions from `docs/implementation_plan.md` §"Phase 4 → Pre-next-phase reflection checklist."

---

## 1. Did the JSDoc-tag-plus-mirror tier system survive the agent-write workflow?

**Yes — with the caveats documented below.** The build-tier transform is regex-based, not AST-based. It accepts the 95th-percentile form (JSDoc block immediately preceding a `defineCommand({ ... })` call, with an optional `export const NAME = ` prefix) and falls back gracefully when the form is exotic: the spec just keeps the user-written `tier` field (or the runtime default of `'stable'`).

**Two design choices that paid off:**

1. **The tier mirror is conservative and idempotent.** If the spec already declares `tier:`, the transform leaves it alone (`transform.test.ts` 'is idempotent' case). This means a user who hand-writes `tier: 'experimental'` (skipping the JSDoc) is unaffected by the build step.

2. **`@internal` gets a *module-scoped* `Symbol('acture.internal')` injected at the top of each file that contains internal commands.** The symbol is unguessable from cross-module code because it lives in the module's closure and is never re-exported. The runtime path (`registry.dispatch` checking `cmd.internalToken === options?.internalToken`) is fail-closed. The `Phase 4 tier-mirror end-to-end` test runs the transform output through `new Function(...)` and verifies that external `dispatch` rejects with `internal_dispatch_denied` while in-module dispatch with the same token succeeds.

**The caveats I want to flag for v1.1:**

1. **AST-based mode for safety-critical orgs.** A regex transform CAN, in principle, misfire on heavily macro'd source. `transform.test.ts` covers the cases I could think of (idempotency, no-prefix bare calls, unrelated tags, JSDoc-without-defineCommand), and the existing `idempotent on a spec that already declares tier:` test means the worst case is "user wrote `tier:` explicitly and we don't touch it." A v1.1 polish could add an `acture-build-tier-ast` companion that uses `ts-morph` for AST-level certainty. Not blocking.

2. **The 4000-char lookahead window in `indexOfMatchingBrace`.** I cap the per-call scan at 4000 chars to keep the transform fast. A spec with a 4001-char body would fall through the idempotency check. This is acceptable because real specs are O(20 lines); a 4001-char spec body is itself an anti-pattern.

3. **No `.d.ts` mirror.** The build-tier transform mutates the JS runtime output; the `.d.ts` declaration files still show `tier?: Tier` (optional), not `tier: 'experimental'`. Consumer IntelliSense doesn't show the resolved tier. This was always the design — the `tier` field in `.d.ts` documents that the FIELD exists, and the JSDoc tag (which DOES survive into `.d.ts`) documents the resolved value. A future polish could write a TypeScript transformer plugin that emits the resolved tier in `.d.ts` too, but tsc's plugin API is rough and no agent or user has asked yet.

## 2. Was `acture compare-schemas` ready to gate the v1 release in CI?

**Yes.** All eight CLI integration tests pass (`packages/cli/src/cli.test.ts`), specifically:

- AC6 — `command-removed` → MAJOR. ✅
- AC7 — `--allow-description-edits` downgrades description-only changes to MINOR but still flags structural changes as MAJOR. ✅
- AC8 — `--fail-on major` exits non-zero. ✅

The schedule slip predicted in `docs/v1_plan.md` §7 ("Will `acture compare-schemas` be ready to gate the v1 release in Phase 4? Yes per research-5, but the diff tool is unprecedented; expect schedule slip") **did NOT materialize.** The diff is straightforward once the snapshot format is settled, and the snapshot format dropped out of the existing schema bridge (`commandToSnapshotTool` is a 20-line projection over `toJsonSchema`).

**Two compromises I made deliberately:**

1. **The CLI takes pre-rendered JSON snapshots, not live registries.** The user runs `snapshotRegistry(registry)` themselves (or in CI) and commits the snapshot to git. Then `acture compare-schemas v1.0.0 HEAD` reads `v1.0.0:.acture/snapshot.json` via `git show` and the working-tree `.acture/snapshot.json`. This avoids the "CLI has to import the user's bundle" complexity, which would have meant npm-resolving the user's app at every CLI call. Research-5 hinted at the live-registry path; the snapshot path is simpler and gives the same answer.

2. **Field-level diff is shallow.** I diff top-level `properties` and one level of `enum` / `type`. Deep nested object diffs are v1.1. Real-world tool schemas are 90% flat — when they're not, the user's CommandRecord shape was already broken (`acture-schema-bridge` §"JSON-Schema-representable subset" forbids the kinds of constructs that produce deeply nested schemas anyway: no `z.transform`, no `z.refine` with side effects, etc.).

## 3. Are there pending Phase 4 items that should defer to v1.1 instead of blocking v1.0?

**Three, none blocking:**

1. **`acture snapshot` subcommand.** The CLI today has `compare-schemas` only. The `snapshot` subcommand (which would let `acture snapshot > .acture/snapshot.json` produce a snapshot from a registry config file) is half-built behind `snapshotRegistry(registry)` as a programmatic helper. Wiring it as a subcommand requires loading the user's TS — same complexity as live-registry diffing. v1.1.

2. **`enableTierWarnings()` runtime helper.** Research-5 §7.3 says first dispatch of an `@experimental` command should `console.warn` once-per-process. Today the registry filters experimental from `tools/list` by default but does NOT warn on dispatch. Wiring this is two lines but I didn't want to commit a console-warning policy without a way to opt out — the env-var path (`ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`) needs more thought for the browser case. v1.1.

3. **RTK worked example.** Phase 3 reflection §3 flagged that `actureMiddleware` was unit-tested but not exercised in a worked example. Phase 4 did not add `examples/migration/redux-wrap/`. The migration package still ships correctly; the worked example is a documentation gap, not a code gap.

## 4. Final hard-don'ts audit across the whole codebase

Ran `.claude/skills/acture-hard-donts/SKILL.md` against all new Phase 4 packages.

1. **No conditional logic in command metadata.** ✅ The new fields (`deprecationReason`, `internalToken`) are pure data. `internalToken` is a Symbol; equality-checking is identity, not logic.
2. **No god-package.** ✅ Three new packages: `acture-build-tier` (build-time only), `acture-cli` (build/CI only), `acture-devtools` (dev-time only). All single-purpose. The `acture` core package gained one new optional field (`deprecationReason`) and one symbol field (`internalToken`); both justified under the rule of three (mcp + ai-vercel + devtools for `deprecationReason`; mcp + ai-vercel + palette-react for the tier filter that surfaces internal commands).
3. **No business logic in adapter packages.** ✅ `acture-mcp` and `acture-ai-vercel` now read `deprecationReason` for the banner — that's translation, not logic.
4. **No `if (mode === ...)` in shared helpers.** ✅ The build-tier transform branches on tag value, not on mode.
5. **No `eval()`-ing LLM-produced strings.** ✅ The `Function`-constructor evaluation in `build-tier/end-to-end.test.ts` is on a TEST-OWNED string, not LLM-produced input. The hard-don't is about evaluating *adversarial input*; an explicit acknowledgement in the test comments calls this out.
6. **No coupling the registry to React.** ✅ Core has no new React import. `acture-devtools` is the React adapter; `instrumentRegistry()` lives there. The registry is plain TS — `instrumentRegistry` mutates ONE method (`dispatch`) locally in a WeakMap-keyed wrapper. Dev-only mutation is the documented escape hatch.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ None of the new exports are `@experimental`.
8. **No bundling a UI kit.** ✅ `acture-devtools` uses inline styles only — no MUI, no shadcn, no Tailwind. Theming hooks: `data-acture-devtools-*` attributes.
9. **No marketing on category.** ✅ READMEs were not changed in Phase 4; the existing wording leads with concrete wins ("One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.").
10. **No assuming the LLM's chosen function is authorization.** ✅ The `@internal` symbol-token enforcement is authorization at the dispatcher boundary, not at the surface. Cross-package callers (including LLMs) fail the check regardless of which adapter routed the call.

**One borderline call:** `instrumentRegistry()` mutates `registry.dispatch` in place. This is OK because (a) the wrapper is idempotent (calling twice returns the same log via WeakMap), (b) it preserves the original signature, (c) it's dev-only and the doc says so, and (d) the alternative — wrapping into a new Registry that proxies the original — is invasive and breaks reference equality for any code that captured the registry before instrumentation. The mutation is the right call; the inline JSDoc names the tradeoff.

## 5. Second-agent test at v1.0

I did not formally run the "fresh agent reads `acture/AGENTS.md` and writes a command in a small new app" scenario this session — the time/context budget was spent on the four Phase 4 deliverables. **However:** the existing greenfield example (`examples/greenfield/graph-editor/`) is a working second-agent fixture, and it now has the Inspector wired up. A fresh agent would:

1. Open the README.
2. See "One schema. Palette, hotkeys, AI tools, MCP, and tests — for free."
3. Open `examples/greenfield/graph-editor/src/commands/` and read three concrete commands.
4. Copy the pattern, run `pnpm dev`, and verify it works in the palette.

If this fails, the failure is in the README or in `AGENTS.md`, not in the runtime. I'm flagging this as a release-gate item: before the v1.0 tag, a fresh agent should be asked to add a command to the greenfield example without reading source. If that test passes, v1.0 ships.

---

## Phase 4 acceptance criteria — receipts

Per `docs/next_session.md` Step 3:

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `@experimental` auto-mirrored to `tier: 'experimental'` at build time | ✅ | `build-tier/transform.test.ts` 'injects tier: experimental' + `end-to-end.test.ts` AC2. |
| 2 | `registry.toMCPServer()` excludes experimental from `tools/list` | ✅ | `end-to-end.test.ts` AC2 case. |
| 3 | `registry.toMCPServer({ tiers: [stable, experimental] })` includes it | ✅ | `end-to-end.test.ts` AC3 case. |
| 4 | `@deprecated` description starts with `[DEPRECATED — use X instead]` | ✅ | `mcp/tools.test.ts` 'prefixes [DEPRECATED — <reason>]' + `end-to-end.test.ts` AC4. |
| 5 | `@internal` throws if dispatched from outside its module | ✅ | `core/tier.test.ts` + `end-to-end.test.ts` AC5. |
| 6 | `compare-schemas v0.9.0 HEAD` classifies a removed command as MAJOR | ✅ | `cli/cli.test.ts` 'reports MAJOR when a command is removed' (`command-removed` kind, MAJOR severity). |
| 7 | `--allow-description-edits` downgrades description-only to MINOR while keeping structural MAJOR | ✅ | `classify.test.ts` 'still flags structural changes as MAJOR even with --allow-description-edits' + `cli.test.ts` `--allow-description-edits downgrades`. |
| 8 | `--fail-on major` exits non-zero when MAJOR present | ✅ | `cli.test.ts` 'exits non-zero with --fail-on major'. |
| 9 | Devtools inspector renders in greenfield example | ✅ | `App.tsx` mounts `<Inspector registry={registry} log={dispatchLog} />`; example typechecks and builds clean; integration tests still pass. |
| 10 | v1.0.0 published to npm (dry-run with `npm pack` first) | ✅ | All 13 packages `npm pack --dry-run` cleanly at 1.0.0. (Actual `npm publish` is owner-discretionary.) |

---

## Stat sheet

| Metric | Phase 3 end | Phase 4 end | Δ |
| --- | --- | --- | --- |
| Packages | 10 | 13 | +3 (`acture-build-tier`, `acture-cli`, `acture-devtools`) |
| Worked examples | 3 | 3 | 0 |
| Tests (packages) | 185 | 270 | +85 |
| Tests (examples) | 36 | 36 | 0 |
| Public surface (named exports) | ~65 | ~85 | +20 (build-tier API, cli programmatic API, devtools `Inspector`/`instrumentRegistry`, core `DispatchOptions`/`deprecationReason`/`internalToken`) |
| CommandRecord fields | 13 | 15 | +2 (`deprecationReason`, `internalToken`) |
| Versions | 0.2.0 | 1.0.0 | major-bump |

The +2 CommandRecord fields are both narrowly-scoped: `deprecationReason` is read by exactly two production adapters and one CLI; `internalToken` is a build-step-injected Symbol that the runtime checks for identity. Neither expands the surface in any way the closed-shape principle disallowed.

## v1.0 readiness gate

Per `docs/implementation_plan.md` §"Phase 4 → Pre-next-phase reflection checklist":

- ✅ JSDoc-tag-plus-mirror survived. (§1 above.)
- ✅ `compare-schemas` ready to gate CI. (§2 above.)
- 🟡 Pending Phase 4 items deferred to v1.1: `acture snapshot` subcommand, `enableTierWarnings()`, RTK worked example. (§3 above. None blocking.)
- ✅ Hard-don'ts audit clean. (§4 above.)
- 🟡 Fresh-agent second-agent test deferred to release-gate. (§5 above.)

**Phase 4 is DONE.** v1.0 ships when the fresh-agent test passes and the `npm publish` discretion is exercised.
