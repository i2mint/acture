/**
 * `redux-action-to-command`
 *
 * Convert Redux-style `dispatch({ type: 'X', payload: ... })` call sites
 * into `registry.dispatch('X', <payload>)`. Adds the `registry` import
 * if missing.
 *
 * Example transform:
 *
 *   dispatch({ type: 'cart/addItem', payload: { id, qty } });
 *   →
 *   registry.dispatch('cart/addItem', { id, qty });
 *
 *   dispatch({ type: 'cart/clear' });
 *   →
 *   registry.dispatch('cart/clear');
 *
 * Structurally identical to the `azizhk/dispatch-your-reducer` gist
 * (research-4 §B.3 ref [29]). Conservative:
 *   - Skip when the action argument isn't an object literal.
 *   - Skip when the `type` field isn't a string literal (e.g.
 *     `dispatch({ type: actionType, ... })` would need type inference).
 *   - Skip when there are keys other than `type` and `payload` — those
 *     usually carry Redux-internal metadata that doesn't translate.
 *   - Skip when the callee identifier isn't in the configured list
 *     (default: `dispatch`, configurable via `--option callees`).
 *
 * Options (from `--option key=value`):
 *   - `callees`           comma-separated list of dispatch-like callees.
 *                         Default `dispatch`. Extend with `dispatch,storeDispatch`
 *                         if your codebase uses multiple names.
 *   - `registry-import`   default `./acture/registry`. Imported as
 *                         `{ registry }`.
 *   - `id-rewrite`        one of `keep` (default), `dot` (rewrite slash to
 *                         dot — `cart/addItem` → `app.cart.addItem`).
 */

import { Project, SyntaxKind, type CallExpression, type SourceFile } from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from '../types.js';

interface ResolvedOptions {
  readonly callees: ReadonlySet<string>;
  readonly registryImport: string;
  readonly idRewrite: 'keep' | 'dot';
}

function resolveOptions(opts: Record<string, string | undefined> | undefined): ResolvedOptions {
  const raw = opts?.['callees'];
  const callees = raw
    ? new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
    : new Set(['dispatch']);
  const idRewrite = (opts?.['id-rewrite'] === 'dot' ? 'dot' : 'keep') as 'keep' | 'dot';
  return {
    callees,
    registryImport: opts?.['registry-import'] ?? './acture/registry',
    idRewrite,
  };
}

export const reduxActionToCommand: Codemod = {
  name: 'redux-action-to-command',
  description:
    'Convert dispatch({type, payload}) call sites to registry.dispatch(id, payload). Adds the registry import.',
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

      sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
        if (rewriteOne(call, resolved, notes, path)) rewriteCount++;
      });

      if (rewriteCount > 0) {
        ensureRegistryImport(sourceFile, resolved.registryImport);
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
      codemod: 'redux-action-to-command',
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
  const calleeName = callee.getText();
  if (!options.callees.has(calleeName)) return false;

  const args = call.getArguments();
  if (args.length !== 1) return false;
  const arg = args[0]!;
  if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;

  const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const props = obj.getProperties();
  let typeLiteral: string | null = null;
  let payloadText: string | null = null;
  let foreignKey = false;

  for (const p of props) {
    if (p.getKind() !== SyntaxKind.PropertyAssignment) {
      foreignKey = true;
      continue;
    }
    const pa = p.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const name = pa.getName();
    if (name === 'type') {
      const init = pa.getInitializerOrThrow();
      if (init.getKind() === SyntaxKind.StringLiteral) {
        typeLiteral = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralText();
      } else {
        notes.push(`${path}: skipped ${calleeName}({...}) — non-literal type`);
        return false;
      }
    } else if (name === 'payload') {
      payloadText = pa.getInitializerOrThrow().getText();
    } else {
      foreignKey = true;
    }
  }

  if (!typeLiteral) return false;
  if (foreignKey) {
    notes.push(`${path}: skipped ${calleeName}({ type: '${typeLiteral}', ...}) — has extra keys`);
    return false;
  }

  const rewrittenId = options.idRewrite === 'dot' ? rewriteIdDot(typeLiteral) : typeLiteral;
  const replacement = payloadText
    ? `registry.dispatch(${JSON.stringify(rewrittenId)}, ${payloadText})`
    : `registry.dispatch(${JSON.stringify(rewrittenId)})`;
  call.replaceWithText(replacement);
  return true;
}

function rewriteIdDot(slashId: string): string {
  // `cart/addItem` → `app.cart.addItem`; keep any already-dotted ids.
  if (!slashId.includes('/')) return slashId;
  return 'app.' + slashId.replace(/\//g, '.');
}

function ensureRegistryImport(sourceFile: SourceFile, from: string): void {
  const existing = sourceFile.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === from,
  );
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === 'registry')) {
      existing.addNamedImport('registry');
    }
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier: from,
    namedImports: ['registry'],
  });
}
