/**
 * `usestate-mutation-to-command`
 *
 * Wrap inline `onClick`/`onChange`/`onSubmit` arrow handlers whose body
 * is composed of useState-setter calls (`setX(...)`) with `wrapMutation`,
 * deriving a command id from the setter name. Per research-4 §B.5
 * row 3 — a targeted variant of `wrap-handler-with-mutation` that
 * specifically lifts useState mutations.
 *
 * Example:
 *
 *   <button onClick={() => setCount(count + 1)}>+</button>
 *   →
 *   <button onClick={wrapMutation(
 *     () => setCount(count + 1),
 *     { id: 'app.state.setCount' },
 *   )}>+</button>
 *
 *   <button onClick={() => { setOpen(true); setActive('a'); }}>...</button>
 *   →
 *   <button onClick={wrapMutation(
 *     () => { setOpen(true); setActive('a'); },
 *     { id: 'app.state.setOpen' },
 *   )}>...</button>
 *
 * The id is derived from the FIRST setter call in the body (if multiple
 * setters are present), with `app.state` as the default prefix.
 *
 * Why this is its own codemod (vs. the general
 * `wrap-handler-with-mutation`): the general codemod doesn't know the
 * handler's *intent*. By gating on `setX` calls we get higher-quality
 * generated ids and avoid wrapping handlers that have side effects
 * other than state mutation.
 *
 * Conservative gates (the agent re-attempts skipped handlers by hand):
 *   - Body must contain at least one identifier-form CallExpression
 *     whose callee matches `^set[A-Z]`.
 *   - All top-level statements / expressions in the body must be one of:
 *     a CallExpression of a `set*` function, or an existing
 *     `wrapMutation(...)` call (idempotency). Anything else → skip.
 *
 * Options (from `--option key=value`):
 *   - `id-prefix`         default `app.state` — prefix for generated ids.
 *   - `setter-pattern`    default `^set[A-Z]` — regex for identifying
 *                         setter identifiers. Override if the codebase
 *                         uses a different convention.
 *   - `events`            default `onClick,onChange,onSubmit`.
 *   - `import-from`       default `acture-migration`.
 */

import {
  Project,
  SyntaxKind,
  type ArrowFunction,
  type JsxAttribute,
  type Node,
} from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from '../types.js';

interface ResolvedOptions {
  readonly idPrefix: string;
  readonly setterPattern: RegExp;
  readonly events: ReadonlySet<string>;
  readonly importFrom: string;
}

const DEFAULT_EVENTS = ['onClick', 'onChange', 'onSubmit'];

function resolveOptions(opts: Record<string, string | undefined> | undefined): ResolvedOptions {
  const rawEvents = opts?.['events'];
  const events = rawEvents
    ? new Set(rawEvents.split(',').map((s) => s.trim()).filter(Boolean))
    : new Set(DEFAULT_EVENTS);
  const setterPattern = opts?.['setter-pattern']
    ? new RegExp(opts['setter-pattern']!)
    : /^set[A-Z]/;
  return {
    idPrefix: opts?.['id-prefix'] ?? 'app.state',
    setterPattern,
    events,
    importFrom: opts?.['import-from'] ?? 'acture-migration',
  };
}

export const useStateMutationToCommand: Codemod = {
  name: 'usestate-mutation-to-command',
  description:
    'Wrap inline handlers whose body is composed of useState setter calls with wrapMutation. Derives a command id from the setter name.',
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
      let wrapCount = 0;

      sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
        if (rewriteOne(attr, resolved, notes, path)) wrapCount++;
      });

      if (wrapCount > 0) {
        ensureImport(sourceFile, 'wrapMutation', resolved.importFrom);
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
      codemod: 'usestate-mutation-to-command',
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
  attr: JsxAttribute,
  options: ResolvedOptions,
  notes: string[],
  path: string,
): boolean {
  const name = attr.getNameNode().getText();
  if (!options.events.has(name)) return false;

  const initializer = attr.getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.JsxExpression) return false;
  const expr = initializer.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
  if (!expr || expr.getKind() !== SyntaxKind.ArrowFunction) return false;
  const arrow = expr.asKindOrThrow(SyntaxKind.ArrowFunction);

  // Idempotent: skip if already inside a wrapMutation call.
  if (isInsideWrapMutation(arrow)) return false;

  const setterName = findFirstSetter(arrow, options.setterPattern);
  if (!setterName) return false;

  const body = arrow.getBody();
  if (!isSetterOnlyBody(body, options.setterPattern)) {
    notes.push(`${path}: skipped ${name} — body has non-setter statements`);
    return false;
  }

  const id = `${options.idPrefix}.${setterName}`;
  const inner = arrow.getText();
  initializer.replaceWithText(`{wrapMutation(${inner}, { id: ${JSON.stringify(id)} })}`);
  return true;
}

function isInsideWrapMutation(arrow: ArrowFunction): boolean {
  // Walk up: if the arrow is the first argument of a `wrapMutation(...)`
  // call, this codemod already ran (or the user wrote it by hand).
  const parent = arrow.getParent();
  if (!parent) return false;
  if (parent.getKind() !== SyntaxKind.CallExpression) return false;
  const callee = parent.asKindOrThrow(SyntaxKind.CallExpression).getExpression();
  return callee.getText() === 'wrapMutation';
}

function findFirstSetter(arrow: ArrowFunction, pattern: RegExp): string | null {
  const body = arrow.getBody();
  const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
  // Include the body itself if it's a direct CallExpression (expression-body arrow).
  if (body.getKind() === SyntaxKind.CallExpression) {
    const call = body.asKindOrThrow(SyntaxKind.CallExpression);
    const callee = call.getExpression();
    if (callee.getKind() === SyntaxKind.Identifier && pattern.test(callee.getText())) {
      return callee.getText();
    }
  }
  for (const call of calls) {
    const callee = call.getExpression();
    if (callee.getKind() === SyntaxKind.Identifier && pattern.test(callee.getText())) {
      return callee.getText();
    }
  }
  return null;
}

function isSetterOnlyBody(body: Node, pattern: RegExp): boolean {
  if (body.getKind() === SyntaxKind.Block) {
    const block = body.asKindOrThrow(SyntaxKind.Block);
    for (const stmt of block.getStatements()) {
      if (stmt.getKind() !== SyntaxKind.ExpressionStatement) return false;
      const inner = stmt.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
      if (!isSetterCall(inner, pattern)) return false;
    }
    return true;
  }
  // Expression-body arrow.
  return isSetterCall(body, pattern);
}

function isSetterCall(node: Node, pattern: RegExp): boolean {
  if (node.getKind() !== SyntaxKind.CallExpression) return false;
  const callee = node.asKindOrThrow(SyntaxKind.CallExpression).getExpression();
  if (callee.getKind() !== SyntaxKind.Identifier) return false;
  return pattern.test(callee.getText());
}

function ensureImport(
  sourceFile: ReturnType<Project['addSourceFileAtPath']>,
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
