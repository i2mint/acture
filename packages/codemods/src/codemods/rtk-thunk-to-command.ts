/**
 * `rtk-thunk-to-command`
 *
 * Convert RTK's `createAsyncThunk(id, payloadCreator)` into an acture
 * async command: `defineCommand({ id, title, execute })`. The original
 * payload creator becomes `execute`, with `return X` rewritten to
 * `return ok(X)` so the result type matches acture's `Result<R>`
 * contract.
 *
 * Example transform (input):
 *
 *   export const fetchUser = createAsyncThunk(
 *     'users/fetchUser',
 *     async (id: string) => {
 *       const res = await fetch(`/users/${id}`);
 *       return await res.json();
 *     },
 *   );
 *
 * Example transform (output):
 *
 *   export const fetchUser = defineCommand({
 *     id: 'users/fetchUser',
 *     title: 'Fetch User',
 *     execute: async (id: string) => {
 *       const res = await fetch(`/users/${id}`);
 *       return ok(await res.json());
 *     },
 *   });
 *
 * Research-4 §B.5 row 5. This is the type-aware codemod in the v1
 * planned set — but in practice the "type awareness" is minimal: we
 * just need to recognise the payload creator's signature (single arg of
 * any type), not derive its zod schema. Inferring `params` is left to
 * the user — we emit a note in `FileChange.notes` reminding them to add
 * a `params:` field if they want palette / MCP / AI surfaces to see a
 * typed parameter.
 *
 * Conservative gates (skipped with a note rather than half-transformed):
 *   - Skip if `createAsyncThunk` has fewer or more than 2 arguments
 *     (3rd arg is options — `extraReducers`, `condition`, `idGenerator`
 *     etc. — none of which map cleanly to a defineCommand spec).
 *   - Skip if the 1st arg isn't a string literal id.
 *   - Skip if the 2nd arg isn't an arrow function or function expression.
 *
 * Options (from `--option key=value`):
 *   - `acture-import`     default `acture` — module from which to import
 *                         `defineCommand` and `ok`.
 *   - `title-from`        default `id-last-segment` — strategy for
 *                         deriving the title. Other value: `id` (use the
 *                         whole id verbatim).
 */

import {
  Project,
  SyntaxKind,
  type ArrowFunction,
  type CallExpression,
  type FunctionExpression,
  type Node,
  type SourceFile,
} from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from '../types.js';

interface ResolvedOptions {
  readonly actureImport: string;
  readonly titleFrom: 'id-last-segment' | 'id';
}

function resolveOptions(opts: Record<string, string | undefined> | undefined): ResolvedOptions {
  return {
    actureImport: opts?.['acture-import'] ?? 'acture',
    titleFrom: (opts?.['title-from'] === 'id' ? 'id' : 'id-last-segment') as
      | 'id-last-segment'
      | 'id',
  };
}

export const rtkThunkToCommand: Codemod = {
  name: 'rtk-thunk-to-command',
  description:
    'Convert createAsyncThunk(id, payloadCreator) into defineCommand({id, title, execute}). Rewrites return X to return ok(X).',
  async run(options: CodemodOptions): Promise<CodemodResult> {
    const resolved = resolveOptions(options.options);
    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: false, jsx: 4 /* ReactJSX */ },
    });

    const fileChanges: FileChange[] = [];
    let totalChanged = 0;
    let totalSkipped = 0;

    for (const path of options.files) {
      const sourceFile = project.addSourceFileAtPath(path);
      const before = sourceFile.getFullText();
      const notes: string[] = [];
      let rewriteCount = 0;

      // Pre-filter to top-level `createAsyncThunk` calls so we don't
      // walk into nodes that subsequent `replaceWithText` will
      // invalidate (the call's inner `fetch(...)` etc. would otherwise
      // get visited after their parent was replaced).
      const thunkCalls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((call) => {
          const callee = call.getExpression();
          return (
            callee.getKind() === SyntaxKind.Identifier &&
            callee.getText() === 'createAsyncThunk'
          );
        });
      for (const call of thunkCalls) {
        if (call.wasForgotten()) continue;
        if (rewriteOne(call, resolved, notes, path)) rewriteCount++;
      }

      if (rewriteCount > 0) {
        ensureImport(sourceFile, 'defineCommand', resolved.actureImport);
        ensureImport(sourceFile, 'ok', resolved.actureImport);
      }

      const after = sourceFile.getFullText();
      const changed = before !== after;
      if (changed) totalChanged++;
      else totalSkipped++;

      fileChanges.push({
        path,
        before,
        after,
        changed,
        ...(notes.length > 0 ? { notes } : {}),
      });

      if (changed && !options.dryRun) {
        await sourceFile.save();
      }
      project.removeSourceFile(sourceFile);
    }

    return {
      codemod: 'rtk-thunk-to-command',
      version: '1.0.0',
      files: fileChanges,
      summary: {
        total: options.files.length,
        changed: totalChanged,
        skipped: totalSkipped,
      },
    };
  },
};

function rewriteOne(
  call: CallExpression,
  options: ResolvedOptions,
  notes: string[],
  path: string,
): boolean {
  const callee = call.getExpression();
  if (callee.getKind() !== SyntaxKind.Identifier) return false;
  if (callee.getText() !== 'createAsyncThunk') return false;

  const args = call.getArguments();
  if (args.length !== 2) {
    notes.push(`${path}: skipped createAsyncThunk(...) — expected exactly 2 args`);
    return false;
  }

  const idArg = args[0]!;
  if (idArg.getKind() !== SyntaxKind.StringLiteral) {
    notes.push(`${path}: skipped createAsyncThunk(...) — non-literal id`);
    return false;
  }
  const id = idArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralText();

  const fnArg = args[1]!;
  const fnKind = fnArg.getKind();
  if (
    fnKind !== SyntaxKind.ArrowFunction &&
    fnKind !== SyntaxKind.FunctionExpression
  ) {
    notes.push(`${path}: skipped createAsyncThunk(...) — payload creator is not a function`);
    return false;
  }
  const fn = fnArg as ArrowFunction | FunctionExpression;

  rewriteReturnsToOk(fn, notes, path, id);
  const executeText = fnToExecuteText(fn);
  const title = options.titleFrom === 'id' ? id : deriveTitle(id);

  const replacement = `defineCommand({
  id: ${JSON.stringify(id)},
  title: ${JSON.stringify(title)},
  execute: ${executeText},
})`;
  call.replaceWithText(replacement);
  notes.push(
    `${path}: createAsyncThunk('${id}') → defineCommand. Add a params: <zod schema> if you want palette/MCP/AI to see a typed parameter.`,
  );
  return true;
}

function rewriteReturnsToOk(
  fn: ArrowFunction | FunctionExpression,
  notes: string[],
  path: string,
  id: string,
): void {
  const body = fn.getBody();
  if (body.getKind() !== SyntaxKind.Block) {
    // Expression-body arrow.
    const text = body.getText();
    body.replaceWithText(`ok(${text})`);
    return;
  }
  // Block body: rewrite every top-level (or nested) `return X` to
  // `return ok(X)`. A bare `return;` becomes `return ok(undefined);`.
  let hadAnyReturn = false;
  body.getDescendantsOfKind(SyntaxKind.ReturnStatement).forEach((ret) => {
    hadAnyReturn = true;
    const expr = ret.getExpression();
    if (!expr) {
      ret.replaceWithText('return ok(undefined);');
    } else {
      ret.replaceWithText(`return ok(${expr.getText()});`);
    }
  });
  if (!hadAnyReturn) {
    // No explicit return — the function returns undefined. Append
    // `return ok(undefined);` so the execute satisfies Result<R>.
    notes.push(
      `${path}: createAsyncThunk('${id}') had no return — appended return ok(undefined);`,
    );
    body.replaceWithText(body.getText().replace(/\}$/, '\n  return ok(undefined);\n}'));
  }
}

function fnToExecuteText(fn: ArrowFunction | FunctionExpression): string {
  // Re-emit the function via getText() — it already reflects any
  // mutations we made above (return rewrites).
  return fn.getText();
}

function deriveTitle(id: string): string {
  const last = id.split('/').pop()?.split('.').pop() ?? id;
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function ensureImport(
  sourceFile: SourceFile,
  importName: string,
  importFrom: string,
): void {
  const existing = sourceFile.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === importFrom,
  );
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === importName)) {
      existing.addNamedImport(importName);
    }
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier: importFrom,
    namedImports: [importName],
  });
}

// Silence "Node imported but unused" — ts-morph generic for some helpers.
export type _Node = Node;
