/**
 * Schema bridge — Zod → JSON Schema projection.
 *
 * Per `acture-schema-bridge` skill: JSON Schema is the universal IDL.
 * `toJsonSchema(record)` returns the MCP-shaped envelope used by every
 * external consumer (MCP, OpenAI, Anthropic, Vercel AI SDK).
 *
 * Phase 1 default converter: Zod v4's `z.toJSONSchema`. Callers can
 * inject their own converter via `options.converter` for non-Zod
 * Standard Schema authors (Phase 2 work).
 */

import { z } from 'zod';
import type { AnyCommandRecord } from './types.js';

export interface ToJsonSchemaOptions {
  /** Override the default Zod converter. */
  converter?: (schema: unknown) => Record<string, unknown>;
  /** Include the description in the envelope. Default: `true`. */
  includeDescription?: boolean;
  /**
   * OpenAI-style strict mode: every property `required`, optionals
   * encoded as `type: [T, "null"]`, `additionalProperties: false`.
   * Lossy transformations are reported on `warnings`. A model then sends
   * `null` for what it leaves out: pass its arguments through
   * {@link fromStrictArgs} before `dispatch` (Zod's `.optional()` refuses
   * `null`). Default: `false`.
   */
  strict?: boolean;
}

export interface JsonSchemaEnvelope {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  /** Non-empty if `strict: true` dropped lossy constraints. */
  warnings?: readonly string[];
}

const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

/**
 * Project a CommandRecord to its JSON-Schema-shaped wire envelope.
 *
 * `inputSchema` is always present. If the command has no `params`,
 * it is an empty object schema (`{type:'object', properties:{}}`)
 * with `additionalProperties: false` — that is the JSON-Schema way
 * to say "no parameters", and every AI/MCP consumer requires it.
 */
export function toJsonSchema(
  record: AnyCommandRecord,
  options?: ToJsonSchemaOptions,
): JsonSchemaEnvelope {
  const includeDescription = options?.includeDescription ?? true;
  const strict = options?.strict ?? false;
  const converter = options?.converter ?? defaultConverter;

  let inputSchema: Record<string, unknown>;
  if (record.params === undefined) {
    inputSchema = { ...EMPTY_OBJECT_SCHEMA };
  } else {
    inputSchema = converter(record.params);
    // Strip the JSON Schema `$schema` declaration; MCP / OpenAI / Anthropic
    // do not expect it on tool input schemas.
    if ('$schema' in inputSchema) {
      const { $schema: _drop, ...rest } = inputSchema;
      void _drop;
      inputSchema = rest;
    }
  }

  const warnings: string[] = [];
  if (strict) {
    inputSchema = enforceStrict(inputSchema, warnings, []);
  }

  const envelope: JsonSchemaEnvelope = {
    name: record.id,
    inputSchema,
  };
  if (includeDescription && record.description !== undefined) {
    envelope.description = record.description;
  }
  if (warnings.length > 0) {
    envelope.warnings = warnings;
  }
  return envelope;
}

function defaultConverter(schema: unknown): Record<string, unknown> {
  const out = z.toJSONSchema(schema as z.ZodType, { target: 'draft-2020-12' });
  return out as Record<string, unknown>;
}

/**
 * OpenAI strict-mode transformation. Walks the schema, marks all object
 * properties as `required`, encodes optionality as `type: [T, "null"]`,
 * sets `additionalProperties: false`. Reports dropped constraints
 * (`minLength`, `pattern`, `minimum`, ...) on `warnings`.
 *
 * Per `acture-schema-bridge` skill §"Strict mode (OpenAI)".
 */
/** `schema`, or null (how strict mode says "optional"). */
function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  // An enum or a const must list null itself, or "or null" cannot validate.
  if (Array.isArray(schema['enum'])) {
    const values = schema['enum'] as unknown[];
    const t0 = schema['type'];
    const type = typeof t0 === 'string' ? (t0 === 'null' ? t0 : [t0, 'null']) : Array.isArray(t0) && !t0.includes('null') ? [...t0, 'null'] : t0;
    return { ...schema, ...(type !== undefined ? { type } : {}), enum: values.includes(null) ? values : [...values, null] };
  }
  if ('const' in schema) return { anyOf: [schema, { type: 'null' }] };
  const t = schema['type'];
  if (typeof t === 'string') return t === 'null' ? schema : { ...schema, type: [t, 'null'] };
  if (Array.isArray(t)) return t.includes('null') ? schema : { ...schema, type: [...t, 'null'] };
  if (Array.isArray(schema['anyOf'])) {
    const branches = schema['anyOf'] as Record<string, unknown>[];
    return branches.some((b) => b['type'] === 'null') ? schema : { ...schema, anyOf: [...branches, { type: 'null' }] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}

function enforceStrict(
  schema: Record<string, unknown>,
  warnings: string[],
  path: readonly string[],
): Record<string, unknown> {
  if (schema === null || typeof schema !== 'object') return schema;
  const where = path.join('.') || '<root>';
  let out: Record<string, unknown> = { ...schema };
  // Definitions (recursive schemas: $defs + $ref) are made strict too.
  for (const defs of ['$defs', 'definitions'] as const) {
    const d = out[defs];
    if (d && typeof d === 'object') {
      out[defs] = Object.fromEntries(Object.entries(d as Record<string, unknown>).map(([k, v]) =>
        [k, enforceStrict(v as Record<string, unknown>, warnings, [...path, `${defs}.${k}`])]));
    }
  }
  // Unions: strict mode knows anyOf only (z.discriminatedUnion emits oneOf, which is the same
  // here: its branches exclude each other by their discriminator).
  if (Array.isArray(out['oneOf'])) {
    out['anyOf'] = out['oneOf'];
    delete out['oneOf'];
  }
  if (Array.isArray(out['anyOf'])) {
    if (path.length === 0) warnings.push(`${where}: a union at the root is not allowed in strict mode; wrap it in an object`);
    out['anyOf'] = (out['anyOf'] as unknown[]).map((b, i) => enforceStrict(b as Record<string, unknown>, warnings, [...path, `anyOf[${i}]`]));
    if (out['type'] !== 'object' && out['properties'] === undefined) return out;
  }
  const t = out['type'];
  if (t === 'object' || out['properties'] !== undefined) {
    const properties = (out['properties'] ?? {}) as Record<string, unknown>;
    const wasRequired = new Set((out['required'] as string[] | undefined) ?? []);
    const extra = out['additionalProperties'];
    if (Object.keys(properties).length === 0 && extra !== undefined && extra !== false) {
      // An open record (z.record): strict mode cannot express "any keys". Kept, flagged; its value
      // schema is still made strict.
      warnings.push(`${where}: an open record (any keys) cannot be strict; kept as is`);
      if (extra && typeof extra === 'object') out['additionalProperties'] = enforceStrict(extra as Record<string, unknown>, warnings, [...path, '*']);
      return out;
    }
    if (extra !== undefined && extra !== false) {
      warnings.push(`${where}: extra keys (catchall) are not allowed in strict mode; dropped`);
    }
    const newProps: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(properties)) {
      const strictChild = enforceStrict(child as Record<string, unknown>, warnings, [...path, key]);
      // Strict mode requires every key: an optional one becomes "this, or null".
      newProps[key] = wasRequired.has(key) ? strictChild : nullable(strictChild);
    }
    return { ...out, type: 'object', properties: newProps, required: Object.keys(newProps), additionalProperties: false };
  }
  if (t === 'array' && out['items']) {
    return { ...out, items: enforceStrict(out['items'] as Record<string, unknown>, warnings, [...path, '[]']) };
  }
  // Note dropped constraints that some strict modes (esp. OpenAI's structured
  // outputs profile) reject — we don't strip them by default, but flag so the
  // caller can decide.
  for (const k of ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'format']) {
    if (k in out) {
      warnings.push(`${where}: keeping "${k}" — confirm your strict-mode profile accepts it`);
    }
  }
  return out;
}

/**
 * Arguments from a strict-mode tool call, as the command's params expect them. Strict mode encodes
 * "left out" as `null`, which Zod's `.optional()` refuses, so a `null` is removed where the key is
 * optional and does not itself accept `null`, in nested objects and in objects inside arrays.
 *
 * Pass the command's Zod `params` (recommended): a `null` goes only where the schema says the key
 * is optional and not nullable (an object field, a record value). A real `null` is kept: a
 * `.nullable()` field, a record value that accepts `null` (a query `{owner: null}`), a value the
 * schema does not describe. Wrappers (optional, nullable, default, catch, readonly, lazy, pipe and
 * transform input), intersections (both sides), tuples and union branches are walked; under a
 * union, the branch whose stripped value parses decides. Where the schema's structure is not known,
 * or no union branch parses, the value is kept if it parses as given, else every `null` key is
 * removed if that parses, else it is kept. Without `params`, every `null` key is removed.
 */
export function fromStrictArgs<T>(args: T, params?: unknown): T {
  return (params === undefined ? stripAll(args) : strip(args, params)) as T;
}

type ZodLike = {
  safeParse?: (v: unknown) => { success: boolean };
  shape?: Record<string, unknown>;
  element?: unknown;
  unwrap?: () => unknown;
  options?: unknown[];
  valueType?: unknown;
  _def?: {
    type?: unknown;
    valueType?: unknown;
    options?: unknown[];
    innerType?: unknown;
    in?: unknown;
    out?: unknown;
    schema?: unknown;
    getter?: () => unknown;
    left?: unknown;
    right?: unknown;
    items?: unknown[];
    rest?: unknown;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/** No schema: every `null` key is "left out". */
function stripAll(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAll);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = stripAll(v);
  return out;
}

/** Whether `schema` accepts `value` (false when it cannot say, or throws, e.g. on an async check). */
function parses(schema: unknown, value: unknown): boolean {
  try {
    return !!(schema as ZodLike | undefined)?.safeParse?.(value).success;
  } catch {
    return false;
  }
}

/** A `null` here means "left out": the schema accepts the key missing but not `null`. */
function leftOut(schema: unknown): boolean {
  return parses(schema, undefined) && !parses(schema, null);
}

/** Guided by the schema; where it cannot tell, the value parsing decides (see `fromStrictArgs`). */
function strip(value: unknown, schema: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const core = coreOf(schema);
  if (!core) return value; // no schema (a key the shape does not describe): keep
  const def = core._def ?? {};
  const options = core.options ?? def.options;
  if (Array.isArray(options)) {
    for (const option of options) {
      const candidate = strip(value, option);
      if (parses(option, candidate)) return candidate;
    }
    return fallback(value, core);
  }
  if (def.left && def.right) return strip(strip(value, def.left), def.right); // intersection
  if (Array.isArray(value)) {
    if (core.element) return value.map((v) => strip(v, core.element));
    const items = def.items;
    if (Array.isArray(items)) return value.map((v, i) => strip(v, i < items.length ? items[i] : def.rest));
    return fallback(value, core);
  }
  if (!isPlainObject(value)) return value;
  if (core.shape && typeof core.shape === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const field = core.shape[k];
      if (v === null) {
        if (!leftOut(field)) out[k] = v;
        continue;
      }
      out[k] = strip(v, field);
    }
    return out;
  }
  const valueType = core.valueType ?? def.valueType;
  if (valueType) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null) {
        if (!leftOut(valueType)) out[k] = v;
        continue;
      }
      out[k] = strip(v, valueType);
    }
    return out;
  }
  return fallback(value, core);
}

/** A schema whose structure is not walked: keep what parses; else drop every null if that parses. */
function fallback(value: unknown, schema: unknown): unknown {
  if (parses(schema, value)) return value;
  const stripped = stripAll(value);
  return parses(schema, stripped) ? stripped : value;
}

/** The schema behind wrappers: optional/nullable/default/catch/readonly/lazy unwrap to their inner
 *  type, a pipe (and a transform, which is a pipe) to its input (its output after a preprocess). It
 *  stops at the first schema with structure (a shape, an element, union options, a record value
 *  type, intersection sides, tuple items) or that it cannot see through. */
function coreOf(schema: unknown): ZodLike | undefined {
  let s = schema as ZodLike | undefined;
  for (let i = 0; s && typeof s === 'object' && i < 16; i++) {
    const d = s._def ?? {};
    if ((s.shape && typeof s.shape === 'object') || s.element || Array.isArray(s.options ?? d.options)) return s;
    if (s.valueType || d.valueType || (d.left && d.right) || Array.isArray(d.items)) return s;
    let next: unknown;
    if (d.in && d.out) next = (d.in as ZodLike)._def?.type === 'transform' ? d.out : d.in;
    else if (typeof s.unwrap === 'function') next = s.unwrap();
    else if (d.innerType) next = d.innerType;
    else if (typeof d.getter === 'function') next = d.getter();
    else if (d.schema) next = d.schema;
    else return s;
    s = next as ZodLike | undefined;
  }
  return s && typeof s === 'object' ? s : undefined;
}
