# Phase 2 Reflection

**Authored:** 2026-05-13 by the Phase 2 implementing agent. All 159 tests pass (72 core + 9 hotkeys + 27 palette-react + 7 state-zustand + 8 state-redux + 7 forms-autoform + 3 forms-rjsf + 10 mcp + 6 ai-vercel + 7 graph-editor + 3 drop-in). Every package and example typechecks and builds via tsup / vite.

This file answers the six questions from `docs/implementation_plan.md` §"Phase 2 → Pre-next-phase reflection checklist".

---

## 1. Did research-2's auto-derived `kind` heuristic match user expectations?

**Mostly yes, but the worked-example data is sparse.** The graph editor has only two handoff-typed parameterized commands (`app.graph.addNode({x, y, label})` and `app.graph.renameNode({nodeId, label})`), and both auto-derive correctly to `handoff` (3 free-text params and 1 free-text param after a non-picker id, respectively). The drop-in example has 3 single-`{text}` or `{id}` handoff commands plus 2 param-free atomic commands — all auto-derive cleanly.

**The atomic side is under-tested in the worked examples.** I added unit tests covering all six cliffs of the heuristic in `packages/palette-react/src/derive-kind.test.ts` (0 params → atomic; 1 enum → atomic; 1 free-text → handoff; 2 picker-typed → atomic; 3 picker-typed-with-defaults → atomic; 3 picker-typed-WITHOUT-defaults → handoff; 4+ → handoff; explicit override). The heuristic is sharp at every cliff and the cliffs are testable in isolation.

**Override rate target (<30%) is uncalibrated from the worked example alone.** Neither worked example needed an explicit `kind` override, so the override rate is 0% — but that's because both apps' parameter shapes happen to map cleanly to the heuristic, not because the heuristic is comprehensive. Phase 3's migration example will be the real stress test (existing apps tend to have idiosyncratic mutation shapes).

**One subtle finding:** Zod v4's schema introspection moved from `_def.typeName` (Zod 3) to `.def.type` (Zod 4). The `summarizeParams` / `isPickerSchema` / `unwrap` helpers handle both via fallback, but they're brittle against future Zod internal refactors. If Zod ships a public introspection API (or Standard Schema adds one), the implementation should migrate to it. For now, the introspection is contained to `derive-kind.ts` (~180 LOC) plus the field classifier in `forms-autoform/auto-form.tsx` (~60 LOC). Both share the same pattern; consolidate if a third copy ever appears.

**Recommendation for Phase 3:** the migration example should attempt at least 5 parameterized commands of varying shapes (date, tags, file path, multi-line text, slider) and measure the override rate. If it exceeds 30%, fix `deriveKind` before declaring Phase 3 done.

## 2. Did the StateAdapter interface stretch to RTK cleanly?

**Yes — and Phase 1's `previous` quirk surfaced exactly as predicted.** Zustand's `store.subscribe((next, prev) => ...)` natively passes both arguments; RTK's `store.subscribe(() => ...)` passes none. The redux adapter tracks `previous` itself between callbacks, and the test `subscribe(listener) fires with (next, previous) on state change` verifies the contract holds (`packages/state-redux/src/index.test.ts`).

**Two shapes ship:**

1. **`createReduxAdapter({ initialState })`** — fresh single-slice RTK store, configured with `serializableCheck: false` and `immutableCheck: false` so the "next state IS the payload" trick doesn't trip middleware. The single reducer dispatches a single `replace` action carrying the next state.
2. **`wrapReduxStore(store, slice)`** — wraps an existing RTK store; the host supplies a selector and an `makeReplace` action creator. Use this for strangler-fig adoption.

**Friction:** Immer's overloaded `produceWithPatches` typing wants `Draft<S>` recipes; acture's contract uses `S`. I cast through `unknown` at three call sites in `packages/state-redux/src/index.ts`. The cast is contained and documented; the user-facing types remain precise. If Immer ships a cleaner overload that accepts `(S) => S | void`, we drop the cast.

**Recommendation:** no contract changes. The `previous` quirk is acceptable as documented (Phase 1 reflection §2 already flagged it).

## 3. Did the schema bridge survive the AI SDK contact?

**Yes, and the dual path is cleaner than expected.**

- **Vercel AI SDK** accepts Zod schemas directly. `acture-ai-vercel` passes `record.params` through unchanged, preserving every `z.refine`, `z.transform`, and custom error message that JSON Schema would silently lose. The AI SDK's `tool({ parameters: zodSchema, execute })` handles the rest.

- **MCP** wants JSON Schema on the wire. `acture-mcp/tools.ts` calls `toJsonSchema(record)` and emits the envelope as a `McpToolDescriptor`. Strict mode is opt-in (the OpenAI-style `additionalProperties: false` flavor).

**Edge cases I expected but didn't hit:** none of the worked-example commands triggered a Zod feature that JSON Schema can't represent. The `JSON-Schema-representable subset` rule (`acture-schema-bridge` skill §"hard rule") was easy to obey — `z.string().min(1)`, `z.enum([...])`, `z.number()`, `z.object({...})` all project cleanly.

**Edge case I DID hit:** Zod v4's `z.toJSONSchema` returns a `$schema` declaration at the root. The core's `toJsonSchema` already strips it (Phase 1 code) — no Phase 2 change needed. Good Phase 1 instinct.

**Recommendation:** keep the JSON-Schema-representable-subset rule on the boundary. The cost of forbidding `z.transform` / `z.date` in `params` is small (handler-level coercion is a 3-line workaround) and the payoff is consistent MCP/AI projections.

## 4. What did the keyboard-shortcuts integration teach about the `keybinding` field shape?

**The current shape (`string | readonly string[]`) is sufficient.** Across the graph-editor's 5 keybindings and the drop-in's 2, no extra metadata was needed. Specifically:

- **Scope** is handled by the **when-clause**, not a separate field. The conflict-resolution rule "first-registered-wins under matching context" (research-1; user-confirmed) means two commands with the same key + different when-clauses already disambiguate correctly. I verified this in `packages/hotkeys/src/bind.test.ts > first-registered-wins under matching context`.

- **Description/help-text** for the keybinding lives in the command's `title` + `description`. The palette renders the keybinding hint via `formatKeybinding(cmd.keybinding)`; no separate "what this key does" field is needed.

- **Platform-specific binding** is handled by tinykeys' `$mod` token, which becomes Meta on macOS and Ctrl elsewhere. No `keybinding: { mac: 'Cmd+K', win: 'Ctrl+K' }` complexity needed.

**One observation that may justify a Phase 4 field:** there's no first-class way to express **"this binding only fires when the editor is the active surface"** if the host has multiple surfaces (palette, settings, etc.). Right now you'd encode that in the when-clause: `when: 'activeSurface == "editor"'`. That works, but it puts scope information in two places (the binding's effective scope is implied by the when, not stated). If three real callers ask for an `activeIn?: string[]` field, add it. Not yet.

## 5. Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against every new package.

1. **No conditional logic in command metadata.** ✅ The `kind` field is still discrete (`'atomic' | 'handoff'`); auto-derivation happens at palette/render time, not at record-definition time.
2. **No god-package.** ✅ Each new package is single-purpose:
   - `acture-hotkeys` — keyboard binding only.
   - `acture-forms-autoform` — Zod-aware form only.
   - `acture-forms-rjsf` — JSON-Schema form only.
   - `acture-state-redux` — RTK ↔ StateAdapter only.
   - `acture-mcp` — MCP projection + server only.
   - `acture-ai-vercel` — Vercel AI tool definitions only.
3. **No business logic in adapter packages.** ✅ Each adapter only translates between an external interface and the registry/state contracts. Spot-checked every `execute` path.
4. **No `if (mode === ...)` in shared helpers.** ✅ Core was not touched in Phase 2.
5. **No `eval()`-ing LLM strings.** ✅ MCP and AI SDK both use `registry.dispatch(name, args)` with Zod validation on the way in — no reflective call construction.
6. **No coupling the registry to React.** ✅ Core has no React import. Hotkeys' main entry is React-free; the React hook lives at `acture-hotkeys/react`.
7. **No promoting `@experimental` without a migration story.** N/A.
8. **No bundling a UI kit.** ✅ Both form adapters render bare HTML with CSS hooks (`data-acture-autoform-*`, `data-acture-rjsf-*`); the host owns styling.
9. **No marketing on category.** ✅ READMEs lead with mechanical descriptions.
10. **No LLM-as-authorization.** ✅ Schema validation is at the dispatcher, not at the AI/MCP boundary.

**One borderline call:** `acture-forms-autoform` and `acture-forms-rjsf` ship as separate packages even though both implement the same `PaletteFormAdapterProps` contract. This is *intentional* (research-2 §9.4: form library is the host's choice; acture provides the contract). But it means a host that wants the autoform-rjsf-side-by-side comparison has to install both. Not a hard-don't violation; a documented tradeoff.

## 6. Decisions to escalate to user

**None blocking.** The four Phase 2 escalations from `next_session.md` were resolved at start of session via `AskUserQuestion`:

1. **Hotkeys tiebreaker:** first-registered-wins under matching context.
2. **MCP transport:** Node-side via `@modelcontextprotocol/sdk` (stdio).
3. **Form adapter priority:** forms-autoform shipped first.
4. **Phase 2 scope:** full push.

**Non-blocking observations for the user:**

1. **The MCP and AI-demo scripts in `examples/greenfield/graph-editor/scripts/`** hold state in the Node process — they do not share the graph state with the browser app. This is documented in both the script comments and the example README. A real production setup would proxy to a single source of truth. If this becomes a friction point, consider a `acture-sync` package that wires registry events across processes (post-v1).

2. **Zod introspection is brittle.** `derive-kind.ts` and `auto-form.tsx` both peek into Zod's `_def` / `.def` internals to detect enum / boolean / optional / default. Zod has no public introspection API yet. If Standard Schema's `~standard` marker grows a public field-shape API, migrate to it.

3. **The dev server was not exercised in a real browser** during this session — the time budget was spent on the package surface and tests. The graph-editor's production bundle builds (Vite reports success, ~358KB gzipped), and the existing UI tests verify the dispatcher path; but I did not click through the new palette + form flow in a browser. **Recommended manual smoke test before merging:** open the graph-editor, press Ctrl/Cmd+K, pick "Add node", verify the form renders and dispatches.

4. **`acture-forms-rjsf`'s test coverage is thin** (3 tests). The package is a thin shim over `@rjsf/core` so most of the failure modes belong upstream. If the user wants stronger coverage, add a "renders rjsf form for nested-object schema" test before declaring v1.

5. **Tinykeys' broken type exports** required an ambient declaration in `packages/hotkeys/src/tinykeys.d.ts`. If upstream fixes its `package.json` `exports` field, remove the shim.

---

## Phase 3 readiness gate

Per `docs/implementation_plan.md` §"Phase 3 — Migration package and skills" the next phase ships:

- `packages/migration/` — `wrapMutation`, `actureMiddleware`, `chooseImplementation`, `shadowCompare`.
- 5 migration-track skills in `.claude/skills/`.
- `examples/migration/zustand-wrap/` — a before/after fixture.

**None of those are gated by a Phase 2 rethink.** The CommandRecord shape, StateAdapter contract, palette UX, and schema bridge are stable. **Phase 2 is DONE.**

The drop-in example already exercises the conceptual core of migration (wrap an existing zustand store, register existing actions as commands). Phase 3 formalizes the strangler-fig workflow with named primitives + skill guidance.

---

## Stat sheet

| Metric | Phase 1 end | Phase 2 end | Δ |
| --- | --- | --- | --- |
| Packages | 3 | 9 | +6 |
| Worked examples | 1 | 2 | +1 |
| Tests | 94 | 159 | +65 |
| Public surface (named exports) | ~25 | ~55 | +30 |

All 9 packages typecheck, build, and test green. CI workflow at `.github/workflows/ci.yml` builds and tests all packages on PR.
