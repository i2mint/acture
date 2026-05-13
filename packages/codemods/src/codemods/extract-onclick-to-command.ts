/**
 * `extract-onclick-to-command`
 *
 * Lift an inline `onClick={() => …}` (or `onSubmit`/`onChange`) into a
 * named module-level command registered with `defineCommand`, and
 * replace the JSX expression with a reference to the command's id
 * dispatched via the registry.
 *
 * Example transform (input):
 *   <button onClick={() => store.save()}>Save</button>
 *
 * Example transform (output):
 *   const __cmd_handleSave = defineCommand({
 *     id: 'app.wrapped.handleSave',
 *     title: 'Handle Save',
 *     execute: () => { store.save(); return ok(undefined); },
 *   });
 *
 *   <button onClick={() => registry.dispatch(__cmd_handleSave.id)}>Save</button>
 *
 * **Scope (research-4 §B.5):** This codemod is intentionally narrow.
 * It handles arrow-function-with-block / arrow-function-expression
 * inline handlers that take no parameters and return nothing useful
 * (the common case for buttons). Handlers that:
 *   - take parameters (e.g. event objects),
 *   - return data the caller uses,
 *   - close over local component state that needs to flow into params,
 * are SKIPPED with a note. The agent re-attempts those by hand —
 * conservatism over coverage is the rule (research-4 §B.6).
 *
 * Options (read from `--option key=value` on the CLI):
 *   - `id-prefix`         default `app.wrapped` — the prefix for
 *                         generated command ids.
 *   - `registry-import`   default `./acture/registry` — module to import
 *                         the `registry` symbol from.
 *   - `acture-import`     default `acture` — module to import
 *                         `defineCommand` and `ok` from.
 */

import {
  Project,
  SyntaxKind,
  type ArrowFunction,
  type JsxAttribute,
  type SourceFile,
} from 'ts-morph';
import type { Codemod, CodemodOptions, CodemodResult, FileChange } from '../types.js';

const SUPPORTED_EVENTS = new Set(['onClick', 'onSubmit', 'onChange']);

interface ResolvedOptions {
  readonly idPrefix: string;
  readonly registryImport: string;
  readonly actureImport: string;
}

function resolveOptions(opts: Record<string, string | undefined> | undefined): ResolvedOptions {
  return {
    idPrefix: opts?.['id-prefix'] ?? 'app.wrapped',
    registryImport: opts?.['registry-import'] ?? './acture/registry',
    actureImport: opts?.['acture-import'] ?? 'acture',
  };
}

export const extractOnClickToCommand: Codemod = {
  name: 'extract-onclick-to-command',
  description:
    'Lift inline onClick / onSubmit / onChange arrow handlers into module-level defineCommand calls.',
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

      const liftedCommands: Array<{ varName: string; spec: string }> = [];

      sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
        const lifted = liftAttribute(attr, resolved, sourceFile, liftedCommands.length, notes);
        if (lifted) liftedCommands.push(lifted);
      });

      if (liftedCommands.length > 0) {
        ensureImports(sourceFile, resolved);
        insertCommandDecls(sourceFile, liftedCommands);
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
      codemod: 'extract-onclick-to-command',
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

interface LiftedCommand {
  readonly varName: string;
  readonly spec: string;
}

function liftAttribute(
  attr: JsxAttribute,
  options: ResolvedOptions,
  sourceFile: SourceFile,
  liftedIndex: number,
  notes: string[],
): LiftedCommand | null {
  const name = attr.getNameNode().getText();
  if (!SUPPORTED_EVENTS.has(name)) return null;

  const initializer = attr.getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.JsxExpression) return null;
  const expr = initializer.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
  if (!expr || expr.getKind() !== SyntaxKind.ArrowFunction) return null;
  const arrow = expr.asKindOrThrow(SyntaxKind.ArrowFunction);

  // Conservative gate: skip arrows with parameters. Real handlers that
  // take an event need different param wiring; the agent does those.
  if (arrow.getParameters().length > 0) {
    notes.push(`${sourceFile.getFilePath()}: skipped ${name} — handler takes parameters`);
    return null;
  }

  const verb = deriveVerb(arrow, name);
  const varName = liftedIndex === 0 ? `__cmd_${verb}` : `__cmd_${verb}_${liftedIndex}`;
  const commandId = `${options.idPrefix}.${verb}`;
  const title = prettify(verb);
  const body = arrowBodyToExecuteBody(arrow);

  const spec = `const ${varName} = defineCommand({
  id: ${JSON.stringify(commandId)},
  title: ${JSON.stringify(title)},
  execute: () => {
${body}
    return ok(undefined);
  },
});`;

  // Replace the attribute's value with a registry.dispatch call.
  initializer.replaceWithText(`{() => registry.dispatch(${varName}.id)}`);
  return { varName, spec };
}

function deriveVerb(arrow: ArrowFunction, attrName: string): string {
  // Try to read the first identifier on the LHS of the body as the verb.
  const text = arrow.getBody().getText().trim();
  const idMatch = /^([a-zA-Z_$][\w$]*)/.exec(text);
  const base = idMatch?.[1] ?? attrName.replace(/^on/, '').toLowerCase();
  return camelize(base);
}

function camelize(s: string): string {
  return s.replace(/^./, (c) => c.toLowerCase()).replace(/[^a-zA-Z0-9]/g, '');
}

function prettify(verb: string): string {
  return verb.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function arrowBodyToExecuteBody(arrow: ArrowFunction): string {
  const body = arrow.getBody();
  if (body.getKind() === SyntaxKind.Block) {
    // Strip the outer braces, re-indent.
    const text = body.getText();
    const inner = text.slice(1, -1).trim();
    return inner
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
  }
  // Expression body: convert to statement.
  return `    ${body.getText()};`;
}

function ensureImports(sourceFile: SourceFile, options: ResolvedOptions): void {
  addNamedImport(sourceFile, options.actureImport, 'defineCommand');
  addNamedImport(sourceFile, options.actureImport, 'ok');
  addNamedImport(sourceFile, options.registryImport, 'registry');
}

function addNamedImport(sourceFile: SourceFile, from: string, name: string): void {
  const existing = sourceFile.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === from,
  );
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === name)) {
      existing.addNamedImport(name);
    }
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier: from,
    namedImports: [name],
  });
}

function insertCommandDecls(sourceFile: SourceFile, commands: readonly LiftedCommand[]): void {
  // Insert right after the last import.
  const imports = sourceFile.getImportDeclarations();
  const insertAfter = imports.length > 0 ? imports[imports.length - 1]!.getEnd() : 0;
  const text = '\n\n' + commands.map((c) => c.spec).join('\n\n') + '\n';
  sourceFile.insertText(insertAfter, text);
}
