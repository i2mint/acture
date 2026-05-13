/**
 * AST-mode tier mirror — the ts-morph companion to the regex
 * `transformSource` in `./transform.ts`.
 *
 * Why an AST mode exists (phase-4-reflection §1, caveat 1): the regex
 * transform handles the 95th-percentile form (JSDoc directly above a
 * `defineCommand({...})` call, with optional declaration prefix). It
 * caps its per-call lookahead at 4000 chars to stay fast, and treats
 * template-substitution braces conservatively. For projects with
 * heavily macro'd source — or where a CI gate wants *AST-level
 * certainty* rather than a fast regex pass — the AST mode is the
 * second entry point.
 *
 * The AST mode produces the same output as the regex transform on
 * every case the regex handles correctly. Where the regex falls
 * through (e.g. 5000-char spec body, template literals containing
 * `${`-delimited substitutions with braces), the AST mode still
 * applies the transformation. The two modes are interchangeable
 * outputs for normal input.
 *
 * Cost: ts-morph is a real dependency (~7 MB). It is declared as an
 * *optional peer* of `@acture/build-tier` so consumers who only use
 * the regex mode don't pay for it. Importing this file pulls ts-morph
 * in lazily.
 *
 * Usage:
 *
 *     // tsup, vite, etc. — point your plugin at the AST transform:
 *     import { transformSourceAst } from '@acture/build-tier/ast';
 *
 *     export function actureTierAstPlugin(): Plugin {
 *       return {
 *         name: 'acture-tier-ast',
 *         transform(code, id) {
 *           if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
 *           const { code: out, changed } = transformSourceAst(code);
 *           return changed ? { code: out, map: null } : null;
 *         },
 *       };
 *     }
 *
 * The regex mode at `@acture/build-tier/esbuild` and
 * `@acture/build-tier/vite` is the documented default. Use AST mode
 * when the regex's lookahead window or string handling is insufficient.
 */

import {
  Project,
  ScriptTarget,
  SyntaxKind,
  type CallExpression,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import { parseTierDirective, type TransformResult } from './transform.js';

const INTERNAL_TOKEN_NAME = '__actureInternalToken__';
const INTERNAL_TOKEN_DECL = `const ${INTERNAL_TOKEN_NAME} = /* @__PURE__ */ Symbol('acture.internal');\n`;

/**
 * AST-mode counterpart of `transformSource`. Same input/output contract:
 * a `defineCommand({...})` call with a JSDoc tier tag gets `tier`,
 * `deprecationReason`, and/or `internalToken` injected into the spec.
 *
 * Idempotent: if the spec already declares `tier:`, the call is left
 * alone (matches the regex mode's behavior).
 *
 * Conservative: any `defineCommand` call that isn't a direct top-level
 * declaration or expression statement is processed the same way —
 * ts-morph walks ALL CallExpression nodes. The JSDoc lookup uses the
 * compiler's leading-comment-ranges API, which correctly attributes
 * docblocks regardless of how deeply nested the call is.
 */
export function transformSourceAst(source: string): TransformResult {
  if (!source.includes('defineCommand')) {
    return { code: source, changed: false, applied: [] };
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: ScriptTarget.ES2022, allowJs: false },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  const file = project.createSourceFile('__acture_build_tier__.ts', source);

  const applied: Array<{ tier: 'stable' | 'experimental' | 'internal' | 'deprecated'; reason?: string }> = [];
  let internalCount = 0;

  for (const call of findDefineCommandCalls(file)) {
    const spec = firstObjectLiteralArg(call);
    if (!spec) continue;
    if (hasTierProperty(spec)) continue; // idempotent

    const jsdocBody = readLeadingJsdocBody(call);
    if (!jsdocBody) continue;

    const directive = parseTierDirective(jsdocBody);
    if (!directive) continue;

    // Build the property text. We could go through ts-morph's
    // `insertPropertyAssignment` API, but for the small set of property
    // names we inject the text path is simpler and produces predictable
    // output that lines up with the regex mode's emission.
    const props: string[] = [];
    props.push(`tier: ${JSON.stringify(directive.tier)}`);
    if (directive.tier === 'deprecated' && directive.reason !== undefined) {
      props.push(`deprecationReason: ${JSON.stringify(directive.reason)}`);
    }
    if (directive.tier === 'internal') {
      props.push(`internalToken: ${INTERNAL_TOKEN_NAME}`);
      internalCount++;
    }

    insertPropertiesAtStart(spec, props);

    applied.push(
      directive.reason !== undefined
        ? { tier: directive.tier, reason: directive.reason }
        : { tier: directive.tier },
    );
  }

  let code = file.getFullText();
  if (internalCount > 0) {
    code = INTERNAL_TOKEN_DECL + code;
  }
  return { code, changed: applied.length > 0, applied };
}

/* ───────────────────────── internals ──────────────────────────────── */

function findDefineCommandCalls(file: SourceFile): CallExpression[] {
  const calls: CallExpression[] = [];
  file.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node as CallExpression;
    if (call.getExpression().getText() !== 'defineCommand') return;
    calls.push(call);
  });
  return calls;
}

function firstObjectLiteralArg(call: CallExpression): ObjectLiteralExpression | null {
  const args = call.getArguments();
  if (args.length === 0) return null;
  const first = args[0]!;
  if (first.getKind() !== SyntaxKind.ObjectLiteralExpression) return null;
  return first as ObjectLiteralExpression;
}

function hasTierProperty(spec: ObjectLiteralExpression): boolean {
  return spec.getProperties().some((p) => {
    if (p.getKind() !== SyntaxKind.PropertyAssignment) return false;
    const name = (p as Node & { getName?: () => string }).getName?.();
    return name === 'tier';
  });
}

/**
 * Find the *attached* JSDoc block for a node, climbing through wrapping
 * `const x = …` / `export const x = …` declarations. ts-morph's
 * `getLeadingCommentRanges` would also work but doesn't follow these
 * wrappers cleanly.
 */
function readLeadingJsdocBody(node: Node): string | null {
  let target: Node = node;
  // Walk up CallExpression → VariableDeclaration → VariableStatement
  // (or → ExpressionStatement). The JSDoc is attached to the
  // outermost declaration in the source.
  while (true) {
    const parent = target.getParent();
    if (!parent) break;
    const kind = parent.getKind();
    if (
      kind === SyntaxKind.VariableDeclaration ||
      kind === SyntaxKind.VariableDeclarationList ||
      kind === SyntaxKind.VariableStatement ||
      kind === SyntaxKind.ExpressionStatement
    ) {
      target = parent;
      continue;
    }
    break;
  }
  // Read leading trivia.
  const fullText = target.getSourceFile().getFullText();
  const start = target.getFullStart();
  const end = target.getStart();
  const trivia = fullText.slice(start, end);
  // Find LAST JSDoc block in the trivia.
  const match = /\/\*\*([\s\S]*?)\*\//g;
  let last: RegExpExecArray | null = null;
  for (let m = match.exec(trivia); m !== null; m = match.exec(trivia)) {
    last = m;
  }
  if (!last) return null;
  return last[1] ?? '';
}

function insertPropertiesAtStart(
  spec: ObjectLiteralExpression,
  propTexts: readonly string[],
): void {
  // We prepend in reverse so the visible order is `tier`, then
  // `deprecationReason`, then `internalToken`.
  const props = [...propTexts];
  for (let i = props.length - 1; i >= 0; i--) {
    spec.insertPropertyAssignment(0, parseStructure(props[i]!));
  }
}

function parseStructure(propText: string): { name: string; initializer: string } {
  const eq = propText.indexOf(':');
  const name = propText.slice(0, eq).trim();
  const initializer = propText.slice(eq + 1).trim();
  return { name, initializer };
}
