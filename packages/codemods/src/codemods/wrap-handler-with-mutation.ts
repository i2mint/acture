/**
 * `wrap-handler-with-mutation`
 *
 * Find every `onClick`, `onChange`, `onSubmit` JSX attribute whose value
 * is an expression and wrap it with `wrapMutation(...)`. Adds the import
 * if missing.
 *
 * Examples:
 *   <button onClick={save}>Save</button>
 *   →
 *   <button onClick={wrapMutation(save)}>Save</button>
 *
 *   <form onSubmit={(e) => handler(e)}>
 *   →
 *   <form onSubmit={wrapMutation((e) => handler(e))}>
 *
 * Idempotent: if the expression is already a call to `wrapMutation`, we
 * leave it alone.
 *
 * Conservative: we skip the attribute (and surface a note) if the
 * expression contains anything we don't know how to wrap cleanly. The
 * agent will re-attempt by hand. Specifically, we skip:
 *   - Attributes that aren't `onClick` / `onChange` / `onSubmit` by
 *     default (configurable via `--events`).
 *   - Attribute values that aren't JsxExpression containers (literal
 *     strings, etc.).
 *
 * This is the simplest of the v1.2 codemods — pure structural rewrite,
 * no type info needed (research-4 §B.5 row 4).
 */

import { Project, SyntaxKind, type Node } from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from '../types.js';

const DEFAULT_EVENTS = new Set(['onClick', 'onChange', 'onSubmit']);

interface ResolvedOptions {
  readonly events: ReadonlySet<string>;
  readonly importFrom: string;
  readonly importName: string;
}

function resolveOptions(opts: Record<string, string | undefined> | undefined): ResolvedOptions {
  const raw = opts?.['events'];
  const events = raw
    ? new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
    : DEFAULT_EVENTS;
  return {
    events,
    importFrom: opts?.['import-from'] ?? '@acture/migration',
    importName: opts?.['import-name'] ?? 'wrapMutation',
  };
}

export const wrapHandlerWithMutation: Codemod = {
  name: 'wrap-handler-with-mutation',
  description:
    'Wrap onClick/onChange/onSubmit handler expressions with wrapMutation(). Adds the import if missing.',
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
      let attrCount = 0;

      sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
        const nameNode = attr.getNameNode();
        const name = nameNode.getText();
        if (!resolved.events.has(name)) return;

        const initializer = attr.getInitializer();
        if (!initializer || initializer.getKind() !== SyntaxKind.JsxExpression) {
          notes.push(`${path}: skipped ${name} — not a {...} expression`);
          return;
        }

        const expr = initializer.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
        if (!expr) {
          notes.push(`${path}: skipped ${name} — empty expression`);
          return;
        }

        if (isAlreadyWrapped(expr, resolved.importName)) return;

        const inner = expr.getText();
        initializer.replaceWithText(`{${resolved.importName}(${inner})}`);
        attrCount++;
      });

      if (attrCount > 0) {
        ensureImport(sourceFile, resolved.importName, resolved.importFrom);
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
      codemod: 'wrap-handler-with-mutation',
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

function isAlreadyWrapped(expr: Node, importName: string): boolean {
  if (expr.getKind() !== SyntaxKind.CallExpression) return false;
  const callee = expr.asKindOrThrow(SyntaxKind.CallExpression).getExpression();
  return callee.getText() === importName;
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
    const named = existing.getNamedImports().map((n) => n.getName());
    if (!named.includes(importName)) {
      existing.addNamedImport(importName);
    }
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier: importFrom,
    namedImports: [importName],
  });
}
