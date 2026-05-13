/**
 * Common types shared across codemods and the CLI runner.
 *
 * Per research-4 §B.6, the contract every codemod must honour is:
 *   - It can run in `--dry-run` mode and produce a diff WITHOUT writing.
 *   - It can produce machine-readable output (`--json`).
 *   - It is conservative: when in doubt, skip the file rather than emit
 *     a partial / dangerous transform. The agent that drives the codemod
 *     will re-attempt the file manually.
 */

export interface CodemodOptions {
  /** Files to operate on. Each entry is an absolute path to a .ts/.tsx
   *  file. The CLI is responsible for expanding globs into this list. */
  readonly files: readonly string[];
  /** Don't write files; return what the diff WOULD be. */
  readonly dryRun?: boolean;
  /** Per-codemod options (free-form bag of strings). Each codemod
   *  documents which keys it reads. */
  readonly options?: Record<string, string | undefined>;
}

export interface FileChange {
  readonly path: string;
  /** `none` if the file was unchanged; otherwise the new content. */
  readonly before: string;
  readonly after: string;
  /** `true` if the codemod made any change to the file's text. */
  readonly changed: boolean;
  /** Non-fatal observations (e.g. "skipped: nested JSX expression
   *  too complex"). Hosts surface these to the user. */
  readonly notes?: readonly string[];
}

export interface CodemodResult {
  readonly codemod: string;
  readonly version: string;
  readonly files: readonly FileChange[];
  /** Summary counts. The CLI uses these to print the recap. */
  readonly summary: {
    readonly total: number;
    readonly changed: number;
    readonly skipped: number;
  };
}

export interface Codemod {
  /** Stable id used in the manifest, e.g. `wrap-handler-with-mutation`. */
  readonly name: string;
  /** Free-text. Surfaced in `--help` and `--list`. */
  readonly description: string;
  /** Runs the codemod against `options.files`. Pure function from
   *  options to result — does NOT write files unless `dryRun` is false. */
  run(options: CodemodOptions): Promise<CodemodResult> | CodemodResult;
}
