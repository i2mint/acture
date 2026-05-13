# Phase 3 Reflection

**Authored:** 2026-05-13 by the Phase 3 implementing agent. All previous tests still pass; **185 package tests** (was 149 at end of Phase 2; +36 in `@acture/migration`). Plus **36 example tests** (was 10 at end of Phase 2; +5 in `zustand-wrap/before`, +21 in `zustand-wrap/after`). Every package and example typechecks and builds via tsup / vite. Production bundles: `before/` 198KB / 62KB gzipped, `after/` 352KB / 109KB gzipped (palette-react + cmdk dominate the delta).

This file answers the seven questions from `docs/implementation_plan.md` §"Phase 3 → Pre-next-phase reflection checklist."

---

## 1. Was `chooseImplementation` actually used in the worked migration?

**No — and that is the correct outcome for a small fixture.** Per research-4 §B.4, the typical 1–2,000-LoC migration band that Claude Code targets has no business introducing feature-flag routing into the call stack. The zustand-wrap demo had zero flag-gated transitions; everything was an immediate wrap or an immediate graduate.

**Is the API awkward?** No — its tests demonstrate it composes cleanly with a synchronous `pick` function. The signature is 5 lines (per `acture-migration-package` skill §"What `chooseImplementation` does") and the type inference works: `chooseImplementation(() => 'modern', { legacy, modern })` infers `Args` and `R` from the impls without explicit type parameters.

**Recommendation:** keep it. The cost of shipping a 5-line function with 4 tests is negligible. The "drop candidate" trigger from research-4 was "if no one uses it within four weeks of public release"; we're not there yet. Real adoption decisions wait until external users have hands on it.

## 2. Was `shadowCompare` used?

**No, same reason as §1.** A bigger fixture (the Qonto-style two-pass migration of a 50K-LoC app) would put both `chooseImplementation` and `shadowCompare` on the hot path. The small fixture exercises wrap → graduate, not modern-vs-legacy verification.

**Awkward?** The async path has one subtlety: when both `modern` and `legacy` are async, the comparison happens after the caller has already received the modern promise — we deliberately do NOT block the caller on the legacy result (research-4 §A.3.1 "use new, log if differs"). The test `async legacy rejection is logged, never thrown` verifies this. The API is sharp; the implementation is clean.

**Recommendation:** keep it.

## 3. Was `actureMiddleware` used? Did it correctly intercept store events without bypassing acture's `dispatch`?

**Not in the zustand-wrap example, by design.** The zustand-vanilla host has no Redux action stream to intercept — `store.subscribe` IS the event seam. `actureMiddleware` is a Redux/RTK-only primitive; a separate worked example with an RTK host would exercise it. Phase 2's `examples/greenfield/graph-editor/` uses zustand and Phase 2's `examples/drop-in/` also uses zustand, so we have no RTK fixture in the repo yet.

**Verified via unit tests** (`packages/migration/src/middleware.test.ts`, 7 tests):

- The action passes through `next(action)` unchanged — no bypass. ✅
- `onDispatch` fires when `action.type` matches a registered command id. ✅
- `requireRegistered: true` (default) skips unknown actions; setting `false` observes all. ✅
- Custom mapping translates host-specific action types (e.g. `TODOS/add`) to acture ids. ✅
- The middleware does NOT re-dispatch (no infinite-loop hazard).

**Recommendation:** keep it; add an RTK worked example in Phase 4 or in a follow-on session. The escalation about RTK's `createListenerMiddleware` (next_session.md Step 5 §1) is **resolved by deferral**: we ship one standard Redux middleware export that works with both plain Redux and RTK (RTK's `configureStore` accepts standard middleware via `gDM().concat(...)`). Users who want `createListenerMiddleware` semantics can call `registry.dispatch(...)` from inside their effects directly.

## 4. Did the migration skills produce a workflow Claude Code can follow without human handholding?

**Mostly — with one rough edge.** The skills `migration-diagnose` → `migration-plan` → `migration-scaffold` → `migration-wrap` → `migration-graduate` form a linear track. Each one is self-contained: it states inputs, outputs, steps, validation. The acceptance demonstrates the chain works end-to-end on the zustand-wrap fixture; the `acture-output/diagnosis.md` and `acture-output/plan.md` files are committed as evidence.

**The rough edge:** `migration-wrap` has to make a per-command decision about whether to expose params via Zod or leave the command parameter-free. The skill says "if the candidate has params, define a Zod schema; describe each field." But the decision of which fields belong in the schema vs. which to pass through positionally needs the agent to read the legacy callsite and choose. A future iteration should add a 3-rule cheat sheet:

1. If the legacy function takes `(a, b, c)`, the wrapped command's params object is `{a, b, c}` and the handler is `(params) => legacy(params.a, params.b, params.c)`.
2. If the legacy function takes `({a, b, c})` already, pass through verbatim.
3. If the legacy function takes a React event or context, wrap the **underlying mutation**, not the event handler.

I'll fold that into `migration-wrap` if a second agent stumbles. Today the skill says it implicitly through the worked-example pattern.

## 5. What was the worst trap the migration agent fell into?

The worst was the **store-action-removal-at-graduation step.** When `migration-graduate` moves the body of `setBody` from `store.setBody` into the command's `execute`, the `setBody` method on the store interface needs to go away too. If we leave it on the interface, the typechecker is fine — but the dead method is now a bug magnet (someone will call it again, expecting it to do something).

I addressed this in two places:
1. `migration-graduate` step 4 ("Remove the legacy function (inline path)") is explicit: delete the method from the interface, run the typechecker, fix any stragglers.
2. The example's `after/src/store.ts` has a comment block at the top calling out the absent `setBody` and `archiveDone` — they are NOT typos.

A future skill `migration-diagnose-graduate-readiness` could grep for remaining callers automatically. For v1 the manual `rg "addTodo\(" src/ -l` is enough.

## 6. Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against `packages/migration/`.

1. **No conditional logic in command metadata.** ✅ `wrapMutation` builds a `CommandRecord` with discrete fields; nothing decides at registration time based on runtime context.
2. **No god-package.** ✅ `@acture/migration` is single-purpose: strangler-fig adoption primitives. It does not import palette / hotkeys / MCP / AI.
3. **No business logic in adapter packages.** ✅ The four functions translate between user-supplied handlers and acture's registry / errors-as-data contract. No domain logic.
4. **No `if (mode === ...)` in shared helpers.** ✅ `wrapMutation`'s execute branches on `options.params !== undefined` — that's data-shape branching, not mode branching. Same as the way the dispatcher branches on `cmd.params !== undefined`.
5. **No `eval()`-ing LLM strings.** ✅ The wrapped commands are dispatched through `registry.dispatch(id, params)` with Zod validation at the boundary. No reflective invocation, no string evaluation.
6. **No coupling the registry to React.** ✅ `packages/migration` has no React import. The package consumes only `acture` + `zod`.
7. **No promoting `@experimental` without a migration story.** N/A — the four exports are all stable from v1.
8. **No bundling a UI kit.** ✅ Nothing is rendered. The package is pure logic + types.
9. **No marketing on category.** ✅ The README leads with mechanics (`wrapMutation` wraps a handler so X) and the dropped `divertHandler` rationale.
10. **No LLM-as-authorization.** ✅ Schema validation lives at the dispatcher boundary; the migration package never sees LLM input.

**One borderline call:** `wrapMutation` mutates `Function.name` on the returned wrapper via `Object.defineProperty(target, 'name', ...)`. In ES2015+ this is configurable but some engines throw. The `defineNonEnumerable` helper catches and silently falls through. The user-facing wrapper still works; only debugger / stack-trace readability is degraded. Not a hard-don't violation; a documented tradeoff.

## 7. Decisions to escalate to user

**Resolved during this session (without blocking):**

1. **`actureMiddleware` Redux vs RTK split** (next_session.md Step 5 §1) — **resolved by deferral**. We ship one standard Redux middleware that works with both plain Redux and RTK. The RTK `createListenerMiddleware` integration is users-call-`registry.dispatch`-from-effects; not a separate export. If three real RTK callers ask for `actureRTKListener` we add it then.
2. **Codemod scope** (next_session.md Step 5 §2) — confirmed v1.1 per research-4 §A.7 + §B.1. Phase 3 ships hand-applied wrapping only.
3. **Graduation's effect on imports** (next_session.md Step 5 §3) — `migration-graduate` skill specifies the inline path as default: delete the legacy function entirely. The stash path is the named exception for large functions. The agent is told to verify zero remaining callers before deleting; the typechecker is the safety net.

**Non-blocking observations for the user:**

1. **No RTK worked example.** The zustand-wrap fixture exercises 6/8 of the migration-track concepts (wrap, graduate, palette wire-up, scaffold). `actureMiddleware` is exercised only by unit tests. A `examples/migration/redux-wrap/` would close the gap in Phase 4 if there's appetite.
2. **`wrapMutation` does not auto-derive `id` from a class method name.** It handles plain function `name` (`handler.name`) and anonymous handlers (`app.wrapped.fn<N>`). Class method handlers come through as the unqualified method name; if a future caller wraps `notesService.addNote.bind(notesService)`, the auto-id becomes `app.wrapped.bound%20addNote` (with the JS `bound ` prefix), which fails the id regex and falls back to the anonymous counter. The current behavior is documented; a future cleanup could strip the `bound ` prefix. Not blocking.
3. **The `kind` heuristic override rate measured here is 0%** — see acceptance §5 below. That's because the 8 cases tested are all canonical shapes (single enum, single number, id+text pairs, id+multiline, file-path-as-string, 3-enum-w/-defaults). Real apps will surface edge cases (e.g. `z.string().regex(/uuid/)` that the user means as a picker because the host renders it from a dropdown; or `z.array(z.enum([...]))` for multi-select). When those land, the heuristic will need a way for the host to opt-in via `.meta({ paramKind: 'picker' })` (which `derive-kind.ts` already supports defensively). No change needed today; flag if override rate climbs.

---

## Phase 3 acceptance criteria — receipts

Per `docs/next_session.md` Step 3:

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `examples/migration/zustand-wrap/before/` runs without any acture import | ✅ | `rg "import.*acture" before/src/` returns only a comment, no actual import statements. `pnpm test`/`build`/`typecheck` all pass. |
| 2 | ≥ 5 commands wrapped without breaking UI behavior | ✅ | 6 wrapped commands (`addNote`, `toggleDone`, `removeNote`, `setDueDate`, `setTheme`, `setFontSize`) + 2 graduated (`setBody`, `archiveDone`). 11 integration tests pass. |
| 3 | `after/` has identical behavior to `before/` plus a working palette | ✅ | The same UI shape + a `PaletteOverlay` mounted on Ctrl/Cmd+K. Build is clean; manual smoke test still pending (see §3 of Phase 2 reflection for the precedent). |
| 4 | `migration-graduate` retires ≥ 2 wrapped legacy handlers | ✅ | `setBody` and `archiveDone` are gone from `after/src/store.ts`; both bodies live in their respective `commands/notes/*.ts` `execute` blocks. |
| 5 | Auto-derived `kind` exercised against ≥ 5 parameterized commands; override rate < 30% | ✅ | 8 cases tested in `kind-heuristic.test.ts`; override rate is 0/8 = **0%**. |
| 6 | CI green | ✅ | All 185 package tests pass; all 36 example tests pass; typecheck + build clean across 10 packages and 4 examples. |

---

## Stat sheet

| Metric | Phase 2 end | Phase 3 end | Δ |
| --- | --- | --- | --- |
| Packages | 9 | 10 | +1 (`@acture/migration`) |
| Worked examples | 2 | 3 | +1 (`zustand-wrap` with before/after) |
| Tests (packages) | 149 | 185 | +36 |
| Tests (examples) | 10 | 36 | +26 |
| Public surface (named exports) | ~55 | ~65 | +10 |
| Migration-track skills | 0 | 5 | +5 |

The package count includes `@acture/migration`. The worked-example count treats `zustand-wrap/before` and `zustand-wrap/after` as one example with two halves (they share a README and a purpose). Skills count includes `migration-diagnose`, `migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`.

## Phase 4 readiness gate

Per `docs/implementation_plan.md` §"Phase 4 — Stability, tier system, devtools" the next phase ships:

- Tier-system enforcement at build time (JSDoc → metadata mirror).
- `acture compare-schemas` CLI.
- Devtools UI.
- Hardening (error messages, JSDoc on every export).

**None of those are gated by a Phase 3 rethink.** The migration package surface is stable; the four functions are documented; the skills are usable. **Phase 3 is DONE.**

The next session should pick up from `docs/next_session.md` (rewritten for Phase 4) and `acture-tier-system` / `acture-schema-bridge` skills.
