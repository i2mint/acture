/**
 * `defineCommand` + registration-time validation.
 *
 * The closed CommandRecord surface is in `./types.ts`. Validation
 * enforces the JSON-Schema-representable-subset rule for param
 * schemas (per `acture-schema-bridge` skill).
 */

import type { ZodType } from 'zod';
import { compileWhen } from './when.js';
import type { CommandRecord, Tier, CommandKind } from './types.js';

const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;
const VALID_KINDS: readonly CommandKind[] = ['atomic', 'handoff'] as const;
const VALID_TIERS: readonly Tier[] = [
  'stable',
  'experimental',
  'internal',
  'deprecated',
] as const;

/** Author-facing input form. Identical to CommandRecord but with
 *  writable fields — the helper freezes the result. */
export type CommandSpec<P, R> = CommandRecord<P, R>;

/**
 * Define a command. Validates the spec at registration time:
 * - `id` matches `app.domain.action` namespaced dot pattern.
 * - `params` (if Zod) is in the JSON-Schema-representable subset.
 * - `when` (if string) is parseable as DSL.
 * - `kind` / `tier` (if explicit) are in their enums.
 *
 * Returns a deep-frozen `CommandRecord<P, R>`. Throws `RegistrationError`
 * if any constraint is violated.
 */
export function defineCommand<P, R>(
  spec: CommandSpec<P, R>,
): CommandRecord<P, R> {
  validateSpec(spec);
  return Object.freeze({ ...spec }) as CommandRecord<P, R>;
}

export class RegistrationError extends Error {
  constructor(message: string, public readonly commandId?: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

function validateSpec<P, R>(spec: CommandSpec<P, R>): void {
  if (!spec || typeof spec !== 'object') {
    throw new RegistrationError(
      'defineCommand requires a spec object, got: ' + typeof spec,
    );
  }
  if (typeof spec.id !== 'string' || spec.id.length === 0) {
    throw new RegistrationError(
      'CommandRecord.id is required and must be a non-empty string',
    );
  }
  if (!ID_PATTERN.test(spec.id)) {
    throw new RegistrationError(
      `CommandRecord.id "${spec.id}" must match pattern app.domain.action ` +
        '(lowercase camelCase segments separated by dots, e.g. "app.graph.addNode")',
      spec.id,
    );
  }
  if (typeof spec.title !== 'string' || spec.title.length === 0) {
    throw new RegistrationError(
      `CommandRecord(${spec.id}).title is required and must be a non-empty string`,
      spec.id,
    );
  }
  if (typeof spec.execute !== 'function') {
    throw new RegistrationError(
      `CommandRecord(${spec.id}).execute is required and must be a function`,
      spec.id,
    );
  }
  if (spec.kind !== undefined && !VALID_KINDS.includes(spec.kind)) {
    throw new RegistrationError(
      `CommandRecord(${spec.id}).kind "${spec.kind}" not in {${VALID_KINDS.join(', ')}}`,
      spec.id,
    );
  }
  if (spec.tier !== undefined && !VALID_TIERS.includes(spec.tier)) {
    throw new RegistrationError(
      `CommandRecord(${spec.id}).tier "${spec.tier}" not in {${VALID_TIERS.join(', ')}}`,
      spec.id,
    );
  }
  if (typeof spec.when === 'string') {
    try {
      compileWhen(spec.when);
    } catch (e) {
      throw new RegistrationError(
        `CommandRecord(${spec.id}).when failed to parse as DSL: ${(e as Error).message}`,
        spec.id,
      );
    }
  } else if (spec.when !== undefined && typeof spec.when !== 'function') {
    throw new RegistrationError(
      `CommandRecord(${spec.id}).when must be a DSL string or (ctx) => boolean`,
      spec.id,
    );
  }
  if (spec.params !== undefined) {
    validateParamSchema(spec.params as ZodType, spec.id);
  }
}

/**
 * Enforce the JSON-Schema-representable-subset rule on Zod parameter
 * schemas. Forbidden constructs (per `acture-schema-bridge` skill):
 * z.transform, z.date, z.bigint, z.set, z.map, z.custom, and
 * z.refine with non-pure semantics.
 *
 * Walks the schema's internal `def` tree. Zod v4 exposes `def.type`
 * for every node; v3 exposed `_def.typeName`. We support both shapes
 * defensively, since users may have either pinned in their lockfile.
 */
function validateParamSchema(schema: unknown, commandId: string): void {
  if (schema === null || typeof schema !== 'object') {
    throw new RegistrationError(
      `CommandRecord(${commandId}).params must be a Zod schema`,
      commandId,
    );
  }
  const seen = new WeakSet<object>();
  walk(schema, commandId, [], seen);
}

const FORBIDDEN_V4: ReadonlyMap<string, string> = new Map([
  ['transform', 'z.transform — coercion belongs in the handler'],
  ['pipe', 'z.pipe with transform — coercion belongs in the handler'],
  ['date', 'z.date — use z.string().datetime() and parse in the handler'],
  ['bigint', 'z.bigint — JSON has no bigint; use z.string() and parse'],
  ['set', 'z.set — JSON has no set type'],
  ['map', 'z.map — JSON has no map type'],
  ['custom', 'z.custom — not statically convertible to JSON Schema'],
  ['function', 'z.function — not JSON-representable'],
  ['symbol', 'z.symbol — not JSON-representable'],
  ['promise', 'z.promise — not JSON-representable'],
  ['nan', 'z.nan — not JSON-representable'],
  ['void', 'z.void — not JSON-representable'],
]);

const FORBIDDEN_V3: ReadonlyMap<string, string> = new Map([
  ['ZodEffects', 'z.transform/z.refine with side effects — handle in execute'],
  ['ZodDate', 'z.date — use z.string().datetime() and parse in the handler'],
  ['ZodBigInt', 'z.bigint — JSON has no bigint; use z.string() and parse'],
  ['ZodSet', 'z.set — JSON has no set type'],
  ['ZodMap', 'z.map — JSON has no map type'],
  ['ZodFunction', 'z.function — not JSON-representable'],
  ['ZodPromise', 'z.promise — not JSON-representable'],
  ['ZodNaN', 'z.nan — not JSON-representable'],
  ['ZodVoid', 'z.void — not JSON-representable'],
]);

function walk(
  node: unknown,
  commandId: string,
  path: readonly string[],
  seen: WeakSet<object>,
): void {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  const def = (node as { def?: unknown; _def?: unknown }).def
    ?? (node as { _def?: unknown })._def;
  if (!def || typeof def !== 'object') return;

  // Zod v4: def.type is a string like 'string', 'object', 'transform'.
  const v4Type = (def as { type?: unknown }).type;
  if (typeof v4Type === 'string') {
    const reason = FORBIDDEN_V4.get(v4Type);
    if (reason) {
      throw new RegistrationError(
        `CommandRecord(${commandId}).params${path.length ? '.' + path.join('.') : ''} uses ${reason}`,
        commandId,
      );
    }
  }
  // Zod v3 fallback: _def.typeName is 'ZodString' etc.
  const v3Type = (def as { typeName?: unknown }).typeName;
  if (typeof v3Type === 'string') {
    const reason = FORBIDDEN_V3.get(v3Type);
    if (reason) {
      throw new RegistrationError(
        `CommandRecord(${commandId}).params${path.length ? '.' + path.join('.') : ''} uses ${reason}`,
        commandId,
      );
    }
  }

  // Recurse into nested schemas.
  // Common shapes: { shape: { key: schema, ... } } for objects,
  //                { element: schema } for arrays,
  //                { options: [schema, ...] } for unions,
  //                { innerType: schema } for optional/nullable,
  //                { left, right } for intersections.
  const shape = (def as { shape?: unknown }).shape;
  if (shape && typeof shape === 'object') {
    for (const [key, child] of Object.entries(shape)) {
      walk(child, commandId, [...path, key], seen);
    }
  }
  const element = (def as { element?: unknown }).element;
  if (element) walk(element, commandId, [...path, '[]'], seen);
  const innerType = (def as { innerType?: unknown }).innerType;
  if (innerType) walk(innerType, commandId, path, seen);
  const items = (def as { items?: unknown }).items;
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) walk(items[i], commandId, [...path, String(i)], seen);
  }
  const options = (def as { options?: unknown }).options;
  if (Array.isArray(options)) {
    for (let i = 0; i < options.length; i++) walk(options[i], commandId, [...path, '|' + i], seen);
  }
  const left = (def as { left?: unknown }).left;
  const right = (def as { right?: unknown }).right;
  if (left) walk(left, commandId, [...path, '&L'], seen);
  if (right) walk(right, commandId, [...path, '&R'], seen);
  const valueType = (def as { valueType?: unknown }).valueType;
  if (valueType) walk(valueType, commandId, [...path, 'value'], seen);
  const keyType = (def as { keyType?: unknown }).keyType;
  if (keyType) walk(keyType, commandId, [...path, 'key'], seen);
}
