# Fresh-agent release-gate test — results

**Run:** 2026-05-14, as part of v1.4 (release-readiness theme).
**Gate origin:** Phase-4 reflection §5 deferred this through v1.0 → v1.3. v1.3's reflection §"Pre-v1.4 reflection answers" §4 named the next session as the right place to run it, with the `@acture/codemods` README as the densest agent-facing surface in the repo.

## What was tested

A fresh agent — no prior context about acture — was given only:

- the location of `packages/codemods/README.md`,
- the fact that `@acture/codemods` is an unpublished workspace package whose CLI is built at `packages/codemods/dist/cli.js`.

It was instructed to read **only the README** (not source, not other docs, not skills), pick one codemod, build a realistic sample file, drive the CLI end-to-end (`--list`, `--help`, `--dry-run --json`, real apply), and deliberately mis-use the CLI to test error messages. The deliverable was a written assessment of where the README + CLI fall short — **no code change in v1.4** (per `docs/next_session.md` §"Strong candidates" #2).

## Outcome

**The codemod mechanics passed; the README's accuracy did not.** The agent got `wrap-handler-with-mutation` working end-to-end (handler wrapped, import added, output functionally correct) and rated the CLI surface — `--list`, `--help`, `--dry-run`, `--json`, the per-file `before`/`after`/`changed` JSON, the readable plain-text diff — as solid. But it returned a **"not ready to ship as-is"** verdict, driven entirely by README gaps and one error-message ambiguity.

### Findings (verbatim priority order from the fresh agent)

1. **The headline invocation does not work.** Every Quick-start and CLI example uses `npx @acture/codemods …` or the `acture-codemods` bin. The package is unpublished, so the *first command a copy-pasting user runs* fails with an npm 404. The README never mentions `node dist/cli.js`, a workspace bin alias, a build step, or publish status. Single biggest blocker.

2. **Per-codemod `--option` keys are undiscoverable.** The README mentions `--option key=value` generically and the codemod table alludes to "configurable setter pattern" / "optional slash→dot id rewrite", but no option *names* are listed anywhere a CLI user can see them. `--help` shows one example (`id-prefix=app.button`) but no enumeration. The programmatic example leaks `events: 'onClick,onSubmit'` — so the options exist, just unlisted.

3. **`--manifest` and `--files-from` are under/undocumented.** `--manifest` appears in the CLI usage block with no explanation (vs. `--list`?). `--files-from` appears in `--help` but is **absent from the README entirely**.

4. **"No files matched" error is ambiguous.** A missing `--target` and a *nonexistent* `--target` path produce the identical message ("No files matched. Use --target…"). A user who typo'd a real path is told to "use --target" when they already did.

5. **Cosmetic:** rewritten handler bodies are over-indented in the output diff. Harmless, but a reviewing user may distrust the transform.

6. **Undocumented exit codes** (errors → 2, no-args → 0). Minor.

Positives worth keeping: `--help` is actually *more* complete than the README; the JSON dry-run shape is "exactly what an agent needs"; the bad-codemod-name error helpfully lists all valid names.

## Assessment

The v1.x codemod *engine* is release-ready — the abstraction shape, the dry-run/JSON contract, and the error handling for the common "wrong codemod name" case are all sound. The release risk is **documentation drift**, not code: the README was written assuming a published package and never revisited for the pre-publish reality, and it under-documents the CLI's own surface (`--option` keys, `--manifest`, `--files-from`).

None of the findings indicate a design problem or a hard-don't violation. They are all README edits plus one ~3-line error-message disambiguation. Because `docs/next_session.md` explicitly scoped #2 as a no-code-change written assessment, **the fixes are deferred to v1.5** and carried forward as the top candidate in the v1.5 planning prompt.

## Recommended v1.5 follow-up (codemods README + CLI polish)

In priority order:

1. **Fix the invocation story.** Either document the monorepo invocation (`node dist/cli.js …` or a `pnpm` workspace bin) alongside the `npx` form, or add an explicit "published?" status line. The Quick start must contain at least one command that actually runs today.
2. **Document per-codemod `--option` keys** — a column in the codemod table, or a short sub-section per codemod. They must be discoverable without reading source.
3. **Document `--manifest` and `--files-from`** in the README; explain `--manifest` vs `--list`.
4. **Disambiguate the "No files matched" error** — distinguish "no `--target` given" from "`--target` path does not exist".
5. (Optional) Fix the output over-indentation; document exit codes.

Estimated effort: README pass + one small CLI error-message edit + ~3 tests. A natural quick-win pairing for v1.5.
