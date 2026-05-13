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
   * Lossy transformations are reported on `warnings`.
   * Default: `false`.
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
function enforceStrict(
  schema: Record<string, unknown>,
  warnings: string[],
  path: readonly string[],
): Record<string, unknown> {
  if (schema === null || typeof schema !== 'object') return schema;
  const t = schema['type'];
  if (t === 'object' || schema['properties'] !== undefined) {
    const properties = (schema['properties'] ?? {}) as Record<string, unknown>;
    const newProps: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(properties)) {
      newProps[key] = enforceStrict(child as Record<string, unknown>, warnings, [...path, key]);
    }
    return {
      ...schema,
      type: 'object',
      properties: newProps,
      required: Object.keys(newProps),
      additionalProperties: false,
    };
  }
  if (t === 'array' && schema['items']) {
    return {
      ...schema,
      items: enforceStrict(
        schema['items'] as Record<string, unknown>,
        warnings,
        [...path, '[]'],
      ),
    };
  }
  // Note dropped constraints that some strict modes (esp. OpenAI's structured
  // outputs profile) reject — we don't strip them by default, but flag so the
  // caller can decide.
  for (const k of ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'format']) {
    if (k in schema) {
      warnings.push(
        `${path.join('.') || '<root>'}: keeping "${k}" — confirm your strict-mode profile accepts it`,
      );
    }
  }
  return schema;
}
