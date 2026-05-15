# Authoring a one-off codemod with an agent

`acture-codemods` ships five structural transforms (research-4 §B.5). They cover the common handler shapes — JSX event handlers, Redux dispatch sites, `useState` setters, RTK thunks. They will **not** cover every codebase. When you hit a handler shape none of the five match, the move is *not* to wait for a sixth codemod to ship — it is to have an agent author a one-off codemod against the same `Codemod` interface.

This is the dev-tool-first positioning applied to codemods (see `docs/positioning.md`): a one-off codemod is a transform the agent *writes into your repo* or runs as a throwaway script. Your project depends on nothing — the `Codemod` interface is ~10 lines you can copy. Installing `acture-codemods` to reuse the five shipped transforms is the opt-in accelerator; hand-writing a sixth for your shape is the always-available path.

This doc is research-4 recommendation #8: the prompt recipe and the contract an agent-authored codemod must honour.

## The contract — what every codemod is

A codemod is one object implementing this interface (`packages/codemods/src/types.ts`):

```ts
interface Codemod {
  readonly name: string;        // stable id, e.g. 'wrap-router-push'
  readonly description: string; // one line; shows in --list / --help
  run(options: CodemodOptions): Promise<CodemodResult> | CodemodResult;
}

interface CodemodOptions {
  readonly files: readonly string[];                       // absolute paths
  readonly dryRun?: boolean;                               // don't write
  readonly options?: Record<string, string | undefined>;   // --option bag
}

interface CodemodResult {
  readonly codemod: string;
  readonly version: string;
  readonly files: readonly FileChange[];
  readonly summary: { readonly total: number; readonly changed: number; readonly skipped: number };
}

interface FileChange {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
  readonly notes?: readonly string[];   // non-fatal observations
}
```

`run` is a **pure function from options to result** — it must not write files when `dryRun` is true, and it must return the same `CodemodResult` shape whether or not it wrote. That shape is what makes `--dry-run --json` work: an agent previews `FileChange.after`, then re-runs without `--dry-run`.

## The discipline — non-negotiable, copy it into the prompt

These are not style preferences; they are what makes a codemod safe to run unattended (research-4 §B.6). An agent authoring a codemod must follow all four:

1. **Conservative — when in doubt, skip the file.** A 100%-correct transform that touches 60% of files beats an 80%-correct one that touches all of them. The agent that drives the codemod re-attempts skipped files by hand.
2. **Skips are visible.** Every skip pushes a string onto `FileChange.notes` — `"<path>: skipped <thing> — <why>"`. A silent skip is a bug.
3. **No type inference you can't actually do.** ts-morph *has* type info, but if the transform would need to read a generic parameter or infer a return type, skip and emit a note instead of guessing.
4. **No business logic.** A codemod translates code to code. It does not decide which operations *should* be commands, how to author the spec, or when to migrate — those are the user's calls. (Hard-don't #3, applied to codemods.)

## The tool — ts-morph

The shipped codemods use [ts-morph](https://ts-morph.com) (research-4 §B.2: TypeScript-aware, pure-JS, clean AST manipulation). An agent-authored codemod should too — the five shipped codemods in `packages/codemods/src/codemods/` are worked references to adapt. `wrap-handler-with-mutation.ts` is the simplest (pure structural rewrite, no type info) and the best starting template.

The standard `run` skeleton:

```ts
import { Project, SyntaxKind } from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from 'acture-codemods';
// ...or copy the ~30-line type block above if you don't want the dependency.

export const myCodemod: Codemod = {
  name: 'wrap-router-push',
  description: 'Wrap router.push(...) call sites with wrapMutation().',
  async run(options: CodemodOptions): Promise<CodemodResult> {
    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: false, jsx: 4 /* ReactJSX */ },
    });
    const files: FileChange[] = [];
    let changed = 0, skipped = 0;

    for (const path of options.files) {
      const sourceFile = project.addSourceFileAtPath(path);
      const before = sourceFile.getFullText();
      const notes: string[] = [];

      // --- the transform: find nodes, rewrite, or push a note and skip ---

      const after = sourceFile.getFullText();
      const didChange = before !== after;
      didChange ? changed++ : skipped++;
      files.push({ path, before, after, changed: didChange, ...(notes.length ? { notes } : {}) });

      if (didChange && !options.dryRun) await sourceFile.save();
      project.removeSourceFile(sourceFile);
    }

    return { codemod: 'wrap-router-push', version: '0.0.0', files,
             summary: { total: options.files.length, changed, skipped } };
  },
};
```

## The prompt recipe

Give the agent this. Fill in the bracketed parts.

> I need a one-off codemod for `acture-codemods`. Read `docs/ai-codemod-recipe.md` for the `Codemod` contract and the four-point discipline, and `packages/codemods/src/codemods/wrap-handler-with-mutation.ts` as the structural template.
>
> **The shape to transform:** [paste 2–3 real before/after examples from your codebase — the actual source, not a paraphrase].
>
> **What to skip:** [list the variants you are *not* confident transforming — e.g. "calls with a dynamic first argument", "handlers that close over local state"]. Skip these with a note; do not attempt them.
>
> **Options:** [any `--option` keys it should read, with defaults — or "none"].
>
> Write it as a single `Codemod` object using ts-morph. Honour the four-point discipline: conservative, visible skips, no type inference you can't do, no business logic. Then write a Vitest test file alongside it covering each before/after example *and* each skip case.

The before/after examples are the load-bearing part. A codemod is only as good as the shapes it was shown — vague descriptions produce codemods that over-reach. Paste real source.

## Running it

Two ways, matching the two flexibility dimensions:

- **Throwaway script (agent-written, zero dependency).** The agent's `Codemod` object plus a ~15-line driver that globs files and calls `run({ files, dryRun })`. Nothing installed; the script is deleted after the migration. Best for a genuinely one-time transform.
- **Drop into `acture-codemods` (package-reuse).** Add the file under `packages/codemods/src/codemods/`, register it in `manifest.ts`, and it gets `--list` / `--manifest` / `--dry-run` / `--json` for free. Best if the shape recurs or other repos would benefit — at which point, consider proposing it upstream as a shipped codemod.

Either way the codemod is the same object. The interface is the portable part; where it runs is your call.

## See also

- `packages/codemods/README.md` — the shipped CLI and the five codemods
- `packages/codemods/src/codemods/` — five worked `Codemod` implementations to adapt
- `packages/codemods/src/types.ts` — the canonical `Codemod` / `CodemodOptions` / `CodemodResult` types
- `docs/research/acture_research_4 -- Transitional APIs and Codemod Tooling…` §B.2, §B.5, §B.6 — tool choice and the conservative-codemod discipline
- `.claude/skills/migration-wrap/SKILL.md` — the agent workflow that drives codemods during a strangler-fig migration
