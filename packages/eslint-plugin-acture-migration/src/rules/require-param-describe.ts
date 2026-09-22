/**
 * `acture/require-param-describe`
 *
 * Flags top-level fields in a `defineCommand({ params: z.object({ ... }) })`
 * schema whose value expression has no `.describe('...')` in its method
 * chain. Why: Zod → JSON Schema is lossy — a bare `z.string()` becomes
 * `{ type: 'string' }` with no `description`, leaving every JSON-Schema
 * consumer (MCP tool inputs, AI function-calling tool definitions, the
 * autoform / rjsf form adapters) without the semantic hint a model or a
 * form-renderer needs. `.describe('...')` carries through to the
 * projected JSON Schema's `description` field; missing it is a real
 * quality bug, not a style preference. Surfaced by research-6.
 *
 * Detection is intentionally narrow and conservative (the same discipline
 * as `no-stale-wrap-mutation` — research-4 §B.6's "conservative"
 * principle generalises to lint):
 *
 *   1. Track the locally-bound name of `defineCommand` (default
 *      imported from `'acture'`; configurable via `{ actureModule }`).
 *   2. Track the locally-bound name of the Zod namespace (default `z`
 *      imported from `'zod'`; configurable via `{ zodModule }`).
 *   3. When a `<defineCommand>({ ... })` call has a `params:` property
 *      whose value is `<z>.object({ <fields> })`, walk each field's
 *      value expression. If no `.describe(...)` appears anywhere in the
 *      chain, report on that field's value.
 *
 * Anything that doesn't fit those shapes — `params` coming from a
 * variable, `z.discriminatedUnion`, a namespace-imported Zod, nested
 * objects' inner keys — is left alone. False positives are louder than
 * false negatives in lint.
 */

import type { Rule } from 'eslint';
import type {
  CallExpression,
  Expression,
  ImportDeclaration,
  Node,
  ObjectExpression,
  Property,
} from 'estree';

const DEFAULT_ACTURE_MODULE = 'acture';
const DEFAULT_ZOD_MODULE = 'zod';
const DEFINE_COMMAND = 'defineCommand';

interface Options {
  /** Module that `defineCommand` is imported from. Default `'acture'`. */
  readonly actureModule?: string;
  /** Module that Zod is imported from. Default `'zod'`. */
  readonly zodModule?: string;
}

export const requireParamDescribe: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a `.describe(...)` call on each top-level field of a `defineCommand` `params: z.object({...})` schema — Zod→JSON-Schema is lossy, and the projected description is what MCP/AI consumers see.',
      recommended: true,
      url: 'https://github.com/i2mint/acture/blob/main/packages/eslint-plugin-acture-migration/README.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          actureModule: { type: 'string' },
          zodModule: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingDescribe:
        "Param field `{{field}}` has no `.describe('...')` — Zod→JSON-Schema is lossy and the projected `description` is what MCP / AI / form consumers see. Add `.describe('...')` to the chain.",
    },
  },

  create(context): Rule.RuleListener {
    const options = (context.options[0] ?? {}) as Options;
    const actureModule = options.actureModule ?? DEFAULT_ACTURE_MODULE;
    const zodModule = options.zodModule ?? DEFAULT_ZOD_MODULE;

    /** Local names that `defineCommand` was imported as. */
    const defineCommandNames = new Set<string>();
    /** Local names of named-imported Zod symbols (e.g. `z`). */
    const zodNamespaceNames = new Set<string>();

    return {
      ImportDeclaration(node: ImportDeclaration) {
        const source = node.source.value;
        if (source === actureModule) {
          for (const spec of node.specifiers) {
            if (
              spec.type === 'ImportSpecifier' &&
              spec.imported.type === 'Identifier' &&
              spec.imported.name === DEFINE_COMMAND
            ) {
              defineCommandNames.add(spec.local.name);
            }
          }
        }
        if (source === zodModule) {
          for (const spec of node.specifiers) {
            // Both `import { z } from 'zod'` and `import * as z from 'zod'`
            // expose the namespace under spec.local.name; the former is
            // overwhelmingly more common, the latter still works.
            if (
              spec.type === 'ImportSpecifier' &&
              spec.imported.type === 'Identifier' &&
              spec.imported.name === 'z'
            ) {
              zodNamespaceNames.add(spec.local.name);
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              zodNamespaceNames.add(spec.local.name);
            }
          }
        }
      },

      CallExpression(node: CallExpression) {
        if (defineCommandNames.size === 0) return;
        if (node.callee.type !== 'Identifier') return;
        if (!defineCommandNames.has(node.callee.name)) return;

        const spec = node.arguments[0];
        if (!spec || spec.type !== 'ObjectExpression') return;

        const paramsProp = findProperty(spec, 'params');
        if (!paramsProp) return;

        const paramsValue = paramsProp.value;
        // Expect `<z>.object({ ... })`. If it's a variable, a function
        // call returning a schema, or anything else, stay quiet.
        if (
          paramsValue.type !== 'CallExpression' ||
          !isZodMemberCall(paramsValue, zodNamespaceNames, 'object')
        ) {
          return;
        }

        const fieldsArg = paramsValue.arguments[0];
        if (!fieldsArg || fieldsArg.type !== 'ObjectExpression') return;

        for (const field of fieldsArg.properties) {
          if (field.type !== 'Property') continue;
          if (field.computed) continue;
          const name = propertyName(field);
          if (!name) continue;
          if (chainHasDescribe(field.value as Expression)) continue;
          context.report({
            node: field.value,
            messageId: 'missingDescribe',
            data: { field: name },
          });
        }
      },
    };
  },
};

/** True when `expr` is a method-chain that, somewhere, calls `.describe(...)`. */
function chainHasDescribe(expr: Expression | null): boolean {
  let curr: Node | null = expr;
  while (curr) {
    if (curr.type === 'CallExpression') {
      if (
        curr.callee.type === 'MemberExpression' &&
        !curr.callee.computed &&
        curr.callee.property.type === 'Identifier' &&
        curr.callee.property.name === 'describe'
      ) {
        return true;
      }
      // Descend into the callee chain — `.min(1).describe('x')` would
      // have CallExpression(.describe) at the outer; `.describe('x').min(1)`
      // would have CallExpression(.min) outer wrapping CallExpression(.describe).
      if (curr.callee.type === 'MemberExpression') {
        curr = curr.callee.object;
        continue;
      }
      break;
    }
    if (curr.type === 'MemberExpression') {
      curr = curr.object;
      continue;
    }
    break;
  }
  return false;
}

/** True when `call` is `<zNamespace>.<method>(...)` for one of the tracked
 *  Zod namespace names. */
function isZodMemberCall(
  call: CallExpression,
  zodNamespaceNames: Set<string>,
  method: string,
): boolean {
  if (call.callee.type !== 'MemberExpression') return false;
  if (call.callee.computed) return false;
  if (call.callee.object.type !== 'Identifier') return false;
  if (!zodNamespaceNames.has(call.callee.object.name)) return false;
  if (call.callee.property.type !== 'Identifier') return false;
  return call.callee.property.name === method;
}

function findProperty(obj: ObjectExpression, name: string): Property | null {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.computed) continue;
    if (propertyName(prop) === name) return prop;
  }
  return null;
}

function propertyName(prop: Property): string | null {
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

