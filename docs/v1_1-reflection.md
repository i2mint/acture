# v1.1 Reflection

**Authored:** 2026-05-13 by the v1.1 implementing agent. All previous tests still pass; **288 package tests** (was 270 at end of Phase 4; +18 across two new test files). Plus the 7 greenfield integration tests still pass. Every package and example typechecks and builds via tsup / vite. Phase 4 deliverables are unchanged; v1.1 is a strict additive increment.

The v1.1 backlog from `docs/phase-4-reflection.md` §3 named four candidates. Following the next-session-prompt recommendation ("ship #3 + #4 in v1.1 (low-effort, high-leverage). Defer #1 and #2"), this session shipped:

- **#4: `enableTierWarnings()` runtime helper.** Two-line addition per research-5 §7.3 (warn-once-per-process on first `@experimental` dispatch). Implemented at `packages/core/src/tier-warnings.ts`. Idempotent WeakMap-keyed wrapper with disposer for test isolation.
- **#3: `acture snapshot` CLI subcommand.** Loads a default-exported `Registry` from a JS/MJS config (with TS fallback hints) and emits the same JSON envelope `compare-schemas` reads. Implemented at `packages/cli/src/snapshot-cmd.ts` plus a thin parser addition in `packages/cli/src/cli.ts`.

Deliberately deferred to v1.2:

- **#1: `acture/codemods`.** Heavy lift; no signal yet from three real migrations.
- **#2: DOM-event interception middleware.** No three-caller signal yet.

---

## What v1.1 added

### Core (`acture`, bumped to 1.1.0)

- `enableTierWarnings(registry, options?)` — public export. Returns a disposer. Options: `enabled?: boolean` (force on/off), `warn?: (message: string) => void` (customize warning sink, e.g., for tests or structured logging).
- `EnableTierWarningsOptions` type — public export.
- No CommandRecord shape changes. The `tier` field added in Phase 4 is the load-bearing piece; v1.1 just observes it at dispatch time.

### CLI (`acture-cli`, bumped to 1.1.0)

- New subcommand `acture snapshot <config> [--out <path>] [--tiers <comma-list>]`.
- Programmatic helper `runSnapshotCmd(args, io?)` and type `SnapshotCmdArgs` — for hosts that want to invoke the same logic without spawning a child process.

### Other packages

- Unchanged. The 11 packages at 1.0.0 stay at 1.0.0.

### Documentation

- `README.md` updated: 13-package table, v1.1 narrative, install instructions for the dev/CI tooling.
- `AGENTS.md` updated: "Current state" section refreshed for v1.1.
- `.claude/skills/acture-tier-system/SKILL.md` updated: tier-warning behavior now describes the v1.1 implementation rather than the future-state stub; `compare-schemas` section updated to mention the `snapshot` subcommand.
- `.claude/skills/acture-command-record-shape/SKILL.md` updated: `deprecationReason` and `internalToken` (Phase 4 additions) are now in the canonical type spec, not just in a footnote.
- `packages/cli/README.md` — new, with CI recipe.
- `packages/build-tier/README.md` — new (had been missing since Phase 4).
- `packages/devtools/README.md` — new (had been missing since Phase 4).

---

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.1 increment.

1. **No conditional logic in command metadata.** ✅ Zero CommandRecord shape changes.
2. **No god-package.** ✅ `enableTierWarnings` lives in core (it observes the closed surface); the `snapshot` subcommand lives in the existing `acture-cli` (no new package).
3. **No business logic in adapter packages.** ✅ `enableTierWarnings` is a runtime helper; `snapshot` is a translation from registry → JSON. Neither makes domain decisions.
4. **No `if (mode === ...)` in shared helpers.** ✅ Both new pieces branch only on data (tier value, config shape).
5. **No `eval()`-ing LLM-produced strings.** ✅ `runSnapshotCmd` dynamically imports a user-supplied config — that's evaluating user-owned source, not adversarial input. The behavior matches what `tsx`, `ts-node`, `vite-node` already do for config files in every other ecosystem.
6. **No coupling the registry to React.** ✅ Core stays React-free. `enableTierWarnings` is plain TS, dispatchable from any host.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ Both new exports are `@stable` from v1.1.0.
8. **No bundling a UI kit.** ✅ No new UI code.
9. **No marketing on category.** ✅ READMEs lead with concrete user wins.
10. **No assuming the LLM's chosen function is authorization.** ✅ Nothing new here — `dispatch` validation is unchanged.

---

## Stat sheet

| Metric | Phase 4 end | v1.1 end | Δ |
| --- | --- | --- | --- |
| Packages | 13 | 13 | 0 |
| Worked examples | 3 | 3 | 0 |
| Tests (packages) | 270 | 288 | +18 |
| Tests (examples) | 36 | 36 | 0 |
| Public surface (named exports) | ~85 | ~88 | +3 (`enableTierWarnings`, `EnableTierWarningsOptions`, `runSnapshotCmd` + `SnapshotCmdArgs` type) |
| CommandRecord fields | 15 | 15 | 0 |
| Versions touched | 13 @ 1.0.0 | core @ 1.1.0, cli @ 1.1.0, others @ 1.0.0 | targeted bump |

The +3 exports are deliberately small. v1.1 was a polish increment — the structural pieces all landed in Phase 4.

## Pre-v1.2 reflection answers (mirroring the Phase 4 checklist style)

1. **Did `enableTierWarnings` survive the design constraints?** Yes. Wrapping `dispatch` is the same idempotent-WeakMap technique `acture-devtools` already used; the disposer pattern means tests can install and uninstall cleanly. The opt-in (host calls it once at boot) is the right ergonomics — research-5 §7.3 says first-dispatch warning, not "automatic on every registry."

2. **Was the `acture snapshot` subcommand worth shipping in v1.1?** Yes — concrete consumers were already named: anyone who uses `compare-schemas` needs to produce snapshots, and the programmatic `snapshotRegistry(registry)` helper was a partial answer. The CLI subcommand closes the CI integration story. **Cost was lower than predicted** — about half a session, not a full one.

3. **Anything that should defer to v1.2 instead?** Yes (and listed in next_session.md): codemods, DOM-event interception, RTK worked example, AST mode for build-tier, deep nested diffs in compare-schemas. None block v1.1's release.

4. **Hard-don'ts audit.** Clean. See above.

5. **Second-agent test status?** Still deferred. The fresh-agent test from `phase-4-reflection.md` §5 was not formally run in v1.1 (same time/context budget tradeoff). Recommended as the v1.2 release-gate item once codemods or DOM interception lands — those are the surfaces where the "second agent reads docs and ships a command" test is most informative.

---

**v1.1 is DONE.** Continue from `docs/next_session.md` for v1.2 scope-picking.
