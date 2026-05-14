# v1.2 Reflection

**Authored:** 2026-05-13 by the v1.2 implementing agent. All previous tests still pass; **350 package tests** (was 288 at end of v1.1; +62 across one new package and three augmented packages). Plus 41 example tests (was 36; +5 from the new RTK fixture). Every package and example typechecks and builds via tsup / vite.

The v1.2 backlog from `docs/next_session.md` named five candidates. The user authorized all five (an explicit override of the "pick at most TWO" rule of three guideline, which was a planning safety net rather than a hard merge gate). Everything in scope shipped:

- **#1: `acture-codemods` package** (research-4 §B.5). Two of five planned codemods + the manifest pattern + a CLI runner + 23 tests. The other three (`redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`) are tracked in `manifest.ts` and `migrations.json` as `status: 'planned'` so users can see what's coming.
- **#2: DOM-event interception middleware** (research-4 §A.5). `createDomInterceptor(registry, options)` lives in `acture-migration` alongside the existing `actureMiddleware`. Plain TS (no React import — hard-don't #6), works in any framework, opt-in scoping per root. 14 tests using jsdom.
- **#3: RTK worked example.** `examples/migration/redux-wrap/`. 5 integration tests demonstrating UI + palette paths converging on the same RTK store, observed as one stream via `actureMiddleware`. The example doubles as documentation for the slash-vs-dot id mapping (RTK action types vs. acture command ids).
- **#4: AST mode for `acture-build-tier`.** Second entry point at `acture-build-tier/ast` using ts-morph. Output is interchangeable with the regex mode on every case the regex handles; AST mode adds coverage for 5000-char spec bodies and template-literal `${...}` substitutions. ts-morph is an optional peer dep — only paid by users who import the AST entry point.
- **#5: Deep nested object diffs in `compare-schemas`.** The classifier now recurses through nested object `properties` and array `items`. Change paths read `inputSchema.properties.user.properties.email` instead of stopping at the top level. 8 new test cases.

---

## What v1.2 added

### Core (`acture`)

No changes. The `tier` field added in Phase 4 and the runtime helper added in v1.1 are unchanged. CommandRecord field count holds at 15.

### Migration (`acture-migration`, bumped to 1.1.0)

- `createDomInterceptor(registry, options?)` — new public export. Delegated DOM listener at a root element / Document; routes `data-acture-command` events through `registry.dispatch`. Configurable events, attribute, params source, capture phase, preventDefault policy.
- `DomInterceptorOptions`, `DomInterceptorMount` — public types.
- jsdom added as a devDep.

### Build-tier (`acture-build-tier`, bumped to 1.1.0)

- New entry point: `acture-build-tier/ast` exporting `transformSourceAst(source)`. Uses ts-morph (optional peer) to handle source the regex transform falls through on (large spec bodies, template-literal substitutions with braces).
- README updated with the AST mode section. Caveats list updated to point users toward `/ast` when they trip the regex.

### CLI (`acture-cli`, bumped to 1.2.0)

- `classifyChanges` recurses through nested object `properties` and array `items`. Change paths are fully qualified (`inputSchema.properties.user.properties.email`). Identical change-kind taxonomy — the recursion uses the same `diffSchemaProperty` logic at every depth.
- 8 new test cases covering: nested removal, nested required addition, nested type narrowing, nested enum removal, type-swap *not* recursing (avoids double-counting), array-of-objects recursion, array-of-primitives type narrowing, three-deep nesting.

### Codemods (`acture-codemods`, new at 1.0.0)

- New publishable package. Single `acture-codemods` CLI with bin, the `MANIFEST` registry, an Nx-style `migrations.json`, and two shipped codemods:
  - `wrap-handler-with-mutation` — wraps `onClick`/`onChange`/`onSubmit` handler expressions with `wrapMutation(...)`. Adds the import. Idempotent. Configurable via `--option events=...`, `--option import-from=...`, etc.
  - `extract-onclick-to-command` — lifts inline arrow handlers into module-level `defineCommand`. Replaces the JSX with a `registry.dispatch` reference. Conservative — skips handlers with parameters with a note.
- `runCodemod(name, options)` programmatic helper.
- CLI supports `--list`, `--manifest`, `--help`, `--dry-run`, `--json`, `--target`, `--files-from`, `--option key=value`. Returns exit code 0/2 per research-4 §B.6.
- ts-morph as a real dep (not optional) — codemods are the central use case for it; users who install the package are opting into the AST manipulation cost.

### Examples

- `examples/migration/redux-wrap/` — new. RTK cart slice + `actureMiddleware` + an acture registry whose commands re-dispatch via the same store. Five integration tests prove UI path and palette path converge on identical state.

### Documentation

- `README.md` updated: 14-package table, v1.2 narrative, four worked examples.
- `AGENTS.md` updated: "Current state" section refreshed for v1.2.
- `packages/migration/README.md` updated: `createDomInterceptor` section added; codemods section now links to the new package.
- `packages/build-tier/README.md` updated: AST mode section added.
- `packages/codemods/README.md` — new.

---

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.2 increment.

1. **No conditional logic in command metadata.** ✅ Zero CommandRecord shape changes.
2. **No god-package.** ✅ One new package (`acture-codemods`), single-purpose. DOM interception lives in `acture-migration` next to `actureMiddleware` because both are event-interception primitives — not bundled into a "god migration" package; the existing migration package's charter is "transitional adoption primitives" and DOM interception fits cleanly. The build-tier AST mode is a second entry point in an existing package, not a new package.
3. **No business logic in adapter packages.** ✅ All new code is translation: DOM events → command dispatch, JSX AST → wrapped JSX AST, source string → AST → source string with metadata injected. No domain decisions live in any new module.
4. **No `if (mode === ...)` in shared helpers.** ✅ Codemod options branch on user-supplied configuration (event names, import paths) — that's data, not mode. The build-tier AST mode is exposed as a different ENTRY POINT, not as a conditional inside the existing transform.
5. **No `eval()`-ing LLM-produced strings.** ✅ The codemod runner reads `--option key=value` pairs and JSON-encoded `data-acture-params` attributes; no eval, no `new Function`. The DOM interceptor parses params with `JSON.parse` (data-only) and looks up commands via `registry.has(id)` (not reflective dispatch).
6. **No coupling the registry to React.** ✅ `createDomInterceptor` is plain TS and uses `addEventListener`. Tests run in jsdom but the module imports no React. The codemods package doesn't touch the registry at all — it's a build-time tool.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ Both new exports are `@stable` from v1.2.
8. **No bundling a UI kit.** ✅ No new UI code in v1.2.
9. **No marketing on category.** ✅ READMEs lead with concrete user wins (one schema, one stream, dry-run + json).
10. **No assuming the LLM's chosen function is authorization.** ✅ DOM interceptor calls `registry.dispatch(id, params)` through the standard validation path. No surface-based trust shortcuts.

**One borderline call:** the `createDomInterceptor` swallows the promise returned by `registry.dispatch`. Future enhancement might surface it via the existing `onDispatch` callback. For v1.2 the fire-and-forget shape matches DOM event handler semantics and is documented in the source comments.

---

## Stat sheet

| Metric | v1.1 end | v1.2 end | Δ |
| --- | --- | --- | --- |
| Packages | 13 | 14 | +1 (`acture-codemods`) |
| Worked examples | 3 | 4 | +1 (`examples/migration/redux-wrap`) |
| Tests (packages) | 288 | 350 | +62 (codemods: +23; migration: +14; build-tier: +17; cli: +8) |
| Tests (examples) | 36 | 41 | +5 (redux-wrap integration) |
| Public surface (named exports) | ~88 | ~100 | +12 (codemods exports, `createDomInterceptor` + types, `transformSourceAst`) |
| CommandRecord fields | 15 | 15 | 0 — closed surface held |
| Versions touched | core/cli@1.1.0, others@1.0.0 | migration→1.1, build-tier→1.1, cli→1.2, codemods→1.0 (new), others unchanged | targeted bumps |

The +12 exports break down: 5 from codemods (`runCodemod`, `MANIFEST`, `findCodemod`, `listShipped`, plus codemod instances), 3 from migration (`createDomInterceptor` + 2 types), 1 from build-tier (`transformSourceAst`), and 3 types from codemods (`Codemod`, `CodemodOptions`, `CodemodResult` + `FileChange` + `ManifestEntry`). Counting precisely, it's slightly more than 12; "~100" is the rounded summary.

---

## Pre-v1.3 reflection answers

1. **Did the closed CommandRecord surface hold through a five-deliverable session?** Yes. Zero new fields. The reflex check ("is this composable into the handler?") shut down two temptations: an `eventBindings` field for the DOM interceptor (composable via `data-acture-command`) and a `codemodFingerprint` field for the codemods (the codemod's `notes` field on `FileChange` covers it).

2. **Did the rule of three break?** Technically yes — the user authorized all five candidates in one session. But each individual deliverable still meets the three-callers test:
   - Codemods: research-4 §B.5 explicitly lists 5 planned codemods; the v1.2 ship is 2 of those 5, leaving the other 3 in the manifest as planned. Three-callers test is "do agents driving migrations need a CLI to run AST transforms on N files?" — yes, the entire research-4 case study is about this.
   - DOM interception: research-4 §A.5 splits Event Interception into store + DOM halves; the store half shipped in v1; this completes the matching half.
   - RTK example: phase-3 + phase-4 reflections both flagged the missing fixture for `actureMiddleware`; this closes that gap.
   - AST mode: phase-4 reflection §1 caveat 1 named this. The regex's 4000-char window + template substitutions are real but rare failure modes.
   - Deep nested diffs: phase-4 reflection §2 compromise 2 named this. Real consumers will have nested input schemas.

3. **What did NOT ship that the next session might pick up?**
   - The remaining 3 codemods (`redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`). Their absence is signposted in the manifest; the runner can pick them up without API changes.
   - `.d.ts` mirror of resolved tier values (phase-4 reflection §1 caveat 3). Still optional.
   - Graduation tooling (`eslint-plugin-acture-migration`). Research-4 §"Defer to v1.2" item #9 names it. Did not ship; defer to post-v1.2.
   - Hypermod-style AI-generation recipe doc (research-4 recommendation #8). Did not ship; docs-only.
   - Second-agent fresh-eyes test (phase-4 reflection §5 / v1.1 reflection §3.5). Still deferred. Strong candidate for the v1.3 release gate now that the codemods + migration surface are denser.

4. **Hard-don'ts audit.** Clean. See above.

5. **Was the user's "ship all five" authorization sound, or did v1.2 feel rushed?** Sound. The pieces are loosely coupled — each delivers value alone. Codemods don't depend on DOM interception, AST mode doesn't depend on deep diffs, the RTK example doesn't depend on any new code. The shared cost was a single test run, a single build pass, and a single round of pack-dry-runs. No piece was rushed past its design — the codemods package shipped 2 of 5 because that was the prudent depth, not because we ran out of session.

---

## Release readiness

- ✅ All packages typecheck and build.
- ✅ 350 package tests + 41 example tests green.
- ✅ `npm pack --dry-run` clean on all four bumped packages.
- ✅ Hard-don'ts audit clean (this section).
- 🟡 Fresh-agent test still deferred. Now that the codemods CLI is the most "agent-facing" surface in the codebase, the right release gate is: a fresh agent reads `packages/codemods/README.md` and uses the CLI to wrap a sample handler in a new app. If the README + CLI behavior aren't enough, the gap is documentation, not implementation.

**v1.2 is DONE.** Next session: see `docs/next_session.md` for v1.3 planning (the remaining 3 codemods, graduation tooling, fresh-agent test as release gate).
