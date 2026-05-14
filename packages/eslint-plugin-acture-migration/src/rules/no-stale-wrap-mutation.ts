/**
 * `acture/no-stale-wrap-mutation`
 *
 * Flags `wrapMutation(...)` calls whose return value is never used. The
 * only thing such a call does is the registry-registration side effect —
 * which means the strangler-fig wrapper has done its job: there is no
 * longer a call site invoking the wrapped function. The command should be
 * authored directly with `defineCommand` (see the `migration-graduate`
 * skill).
 *
 * `wrapMutation`'s entire reason to exist over `defineCommand` is that the
 * call site stays unchanged: the wrapped function is still *called* as a
 * function somewhere. When the wrapper's result is discarded, that
 * property is no longer being used — the wrapper is dead weight.
 *
 * Detection is intentionally single-file and conservative (research-4's
 * codemod principle: a high-confidence partial signal beats a noisy total
 * one). Two stale shapes are reported:
 *
 *   1. Bare expression statement — `wrapMutation(handler, { registry });`
 *      The result is discarded entirely.
 *   2. Assigned to a local, non-exported binding that is never
 *      referenced — `const x = wrapMutation(handler, { registry });` with
 *      no later use of `x`.
 *
 * Anything else is left alone: an exported binding may be called from
 * another file; a referenced binding is still load-bearing; a result that
 * is returned or passed as an argument is still in use. Namespace imports
 * (`import * as m from 'acture-migration'`) are not tracked.
 */

import type { Rule, SourceCode } from 'eslint';
import type {
  CallExpression,
  Identifier,
  ImportDeclaration,
  VariableDeclarator,
} from 'estree';

const DEFAULT_MODULE = 'acture-migration';
const WRAP_MUTATION = 'wrapMutation';

interface Options {
  /** Module that `wrapMutation` is imported from. Override for codebases
   *  that re-export it under their own package name. */
  readonly module?: string;
}

export const noStaleWrapMutation: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flag wrapMutation(...) calls whose result is never used — the migration has graduated and the wrapper should become a defineCommand.',
      recommended: true,
      url: 'https://github.com/thorwhalen/acture/blob/main/packages/eslint-plugin-acture-migration/README.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          module: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      staleWrapper:
        'This wrapMutation(...) result is never used — the wrapper exists only for its registry side effect. The migration has graduated; author this command directly with defineCommand (see the migration-graduate skill).',
    },
  },

  create(context): Rule.RuleListener {
    const options = (context.options[0] ?? {}) as Options;
    const moduleName = options.module ?? DEFAULT_MODULE;

    /** Local names that `wrapMutation` was imported as. */
    const wrapNames = new Set<string>();
    /** Every identifier-callee call, collected for a deferred decision so
     *  the import scan is guaranteed complete first. */
    const candidateCalls: CallExpression[] = [];

    return {
      ImportDeclaration(node: ImportDeclaration) {
        if (node.source.value !== moduleName) return;
        for (const spec of node.specifiers) {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === WRAP_MUTATION
          ) {
            wrapNames.add(spec.local.name);
          }
        }
      },

      CallExpression(node: CallExpression) {
        if (node.callee.type === 'Identifier') {
          candidateCalls.push(node);
        }
      },

      'Program:exit'() {
        if (wrapNames.size === 0) return;
        const sourceCode = context.sourceCode;

        for (const call of candidateCalls) {
          const callee = call.callee as Identifier;
          if (!wrapNames.has(callee.name)) continue;

          const parent = (call as Rule.Node).parent;
          if (!parent) continue;

          // Shape 1: bare expression statement — result discarded.
          if (parent.type === 'ExpressionStatement') {
            context.report({ node: call, messageId: 'staleWrapper' });
            continue;
          }

          // Shape 2: assigned to an unused, non-exported local binding.
          if (
            parent.type === 'VariableDeclarator' &&
            parent.init === call &&
            isUnusedLocalBinding(sourceCode, parent)
          ) {
            context.report({ node: call, messageId: 'staleWrapper' });
          }
        }
      },
    };
  },
};

/**
 * True when `declarator` binds a plain identifier that is (a) not part of
 * an `export` declaration and (b) never referenced. Either condition
 * failing means the wrapper may still be load-bearing, so we stay quiet.
 */
function isUnusedLocalBinding(
  sourceCode: SourceCode,
  declarator: VariableDeclarator,
): boolean {
  if (declarator.id.type !== 'Identifier') return false;

  const declaration = (declarator as Rule.Node).parent;
  if (!declaration || declaration.type !== 'VariableDeclaration') return false;
  if (declaration.parent?.type === 'ExportNamedDeclaration') {
    return false;
  }

  const name = declarator.id.name;
  const variable = sourceCode
    .getDeclaredVariables(declaration)
    .find((v) => v.name === name);
  if (!variable) return false;

  // Any reference — a read, or an `export { x }` specifier — means the
  // wrapped function is still reachable. The binding's own initializer
  // counts as a (write) reference in ESLint's scope model, so ignore it:
  // only a use *beyond* the declaration makes the wrapper load-bearing.
  return variable.references.every((ref) => ref.init === true);
}
