/**
 * Auto-derived `kind` heuristic per research-2 §9.3 (acture-palette-design
 * skill). Determines whether a parameterized command should be collected
 * inline (atomic picker chain) or handed off to a dedicated form.
 *
 *   0 params                                           → atomic
 *   1–2 params, all picker-typed                       → atomic
 *   3 params, all picker-typed AND all have defaults   → atomic
 *   else                                               → handoff
 *
 * "Picker-typed" = the param has a discrete, enumerable value space
 * (enum, boolean) OR is a string carrying an explicit `paramKind: 'picker'`
 * extension hint via `.describe()`. Unconstrained `z.string()` and
 * `z.number()` are NOT picker-typed.
 *
 * Authors override by setting `kind` explicitly on the CommandRecord.
 */

import type { AnyCommandRecord, CommandKind } from 'acture';
import type { z } from 'zod';

export interface ParamSummary {
  readonly name: string;
  readonly schema: z.ZodTypeAny;
  readonly isPicker: boolean;
  readonly hasDefault: boolean;
  readonly optional: boolean;
}

/** Inspect a Zod schema and produce per-field summaries for deriveKind
 *  and the picker-chain renderer. Defensive against non-object schemas. */
export function summarizeParams(record: AnyCommandRecord): ParamSummary[] {
  const schema = record.params;
  if (schema === undefined) return [];
  // Zod v4: z.object exposes `.shape`. Other types (z.string, z.enum at
  // root) are degenerate single-field params — treat as one anonymous
  // field. The dispatcher passes the raw value through in that case.
  const shape = readObjectShape(schema as unknown as { shape?: unknown });
  if (shape === null) {
    return [
      {
        name: '_',
        schema: schema as unknown as z.ZodTypeAny,
        isPicker: isPickerSchema(schema as unknown as z.ZodTypeAny),
        hasDefault: hasDefaultValue(schema as unknown as z.ZodTypeAny),
        optional: isOptional(schema as unknown as z.ZodTypeAny),
      },
    ];
  }
  return Object.entries(shape).map(([name, fieldSchema]) => ({
    name,
    schema: fieldSchema as z.ZodTypeAny,
    isPicker: isPickerSchema(fieldSchema as z.ZodTypeAny),
    hasDefault: hasDefaultValue(fieldSchema as z.ZodTypeAny),
    optional: isOptional(fieldSchema as z.ZodTypeAny),
  }));
}

/** Auto-derive `kind` from the param summary; explicit `kind` wins. */
export function deriveKind(record: AnyCommandRecord): CommandKind {
  if (record.kind !== undefined) return record.kind;
  const summary = summarizeParams(record);
  if (summary.length === 0) return 'atomic';
  const allPicker = summary.every((p) => p.isPicker);
  if (summary.length <= 2 && allPicker) return 'atomic';
  if (summary.length === 3 && allPicker && summary.every((p) => p.hasDefault)) return 'atomic';
  return 'handoff';
}

/* ───────────────────────── Zod inspection ─────────────────────────── */

function readObjectShape(s: { shape?: unknown }): Record<string, unknown> | null {
  const shape = s.shape;
  if (shape && typeof shape === 'object') return shape as Record<string, unknown>;
  return null;
}

function readDef(s: unknown): { typeName?: string; type?: string } & Record<string, unknown> {
  if (s === null || typeof s !== 'object') return {};
  const def = (s as { _def?: object; def?: object })._def ?? (s as { def?: object }).def ?? {};
  return def as Record<string, unknown>;
}

function getTypeName(s: unknown): string | undefined {
  const def = readDef(s);
  // Zod v3 used _def.typeName ('ZodString'). Zod v4 uses .def.type ('string').
  if (typeof def.typeName === 'string') return def.typeName;
  if (typeof def.type === 'string') return def.type;
  // Last resort: constructor name.
  const ctor = (s as { constructor?: { name?: string } }).constructor;
  return ctor?.name;
}

/** Picker-typed = discrete, enumerable value space. */
export function isPickerSchema(s: z.ZodTypeAny): boolean {
  if (s === null || typeof s !== 'object') return false;
  // Unwrap optional/default/nullable shells.
  const inner = unwrap(s);
  const t = getTypeName(inner);
  if (!t) return false;
  if (t === 'ZodEnum' || t === 'enum') return true;
  if (t === 'ZodBoolean' || t === 'boolean') return true;
  if (t === 'ZodNativeEnum' || t === 'nativeEnum') return true;
  if (t === 'ZodLiteral' || t === 'literal') return true;
  // Honor an explicit author hint placed in `.describe()` or `.meta()`.
  const meta = readMeta(inner);
  if (meta && (meta['paramKind'] === 'picker' || meta['picker'] === true)) {
    return true;
  }
  return false;
}

/** Has the field declared a default value? Drives the 3-param atomic
 *  exception. */
export function hasDefaultValue(s: z.ZodTypeAny): boolean {
  const t = getTypeName(s);
  if (t === 'ZodDefault' || t === 'default') return true;
  // Zod v4: an inner `.def.defaultValue` lives on the wrapper. Walk the
  // unwrap chain looking for one.
  let cur: unknown = s;
  for (let i = 0; i < 4 && cur !== undefined && cur !== null; i++) {
    const def = readDef(cur);
    if ('defaultValue' in def) return true;
    cur = (def as { innerType?: unknown }).innerType;
  }
  return false;
}

export function isOptional(s: z.ZodTypeAny): boolean {
  const t = getTypeName(s);
  return t === 'ZodOptional' || t === 'optional' || hasDefaultValue(s);
}

/** Read `.describe()` / `.meta()` payload, if any. */
function readMeta(s: unknown): Record<string, unknown> | null {
  if (s === null || typeof s !== 'object') return null;
  const def = readDef(s);
  if (def['description'] && typeof def['description'] === 'object') {
    return def['description'] as Record<string, unknown>;
  }
  return null;
}

/** Unwrap optional/default/nullable/branded shells to the inner type. */
export function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  let cur: unknown = s;
  for (let i = 0; i < 6; i++) {
    if (cur === null || typeof cur !== 'object') break;
    const t = getTypeName(cur);
    if (
      t !== 'ZodOptional' &&
      t !== 'optional' &&
      t !== 'ZodDefault' &&
      t !== 'default' &&
      t !== 'ZodNullable' &&
      t !== 'nullable' &&
      t !== 'ZodBranded' &&
      t !== 'branded'
    ) {
      break;
    }
    const def = readDef(cur);
    const inner = (def as { innerType?: unknown }).innerType;
    if (inner === undefined) break;
    cur = inner;
  }
  return cur as z.ZodTypeAny;
}

/** Read enum options for picker rendering. Returns [] for non-enums. */
export function readEnumOptions(s: z.ZodTypeAny): string[] {
  const inner = unwrap(s);
  const def = readDef(inner);
  // Zod v4: enum stores values on `.entries` (object) or `.values` (array).
  if (Array.isArray((def as { values?: unknown }).values)) {
    return ((def as { values: unknown[] }).values as unknown[])
      .filter((v): v is string => typeof v === 'string');
  }
  if ((def as { entries?: unknown }).entries && typeof (def as { entries?: unknown }).entries === 'object') {
    return Object.keys((def as { entries: Record<string, unknown> }).entries);
  }
  return [];
}
