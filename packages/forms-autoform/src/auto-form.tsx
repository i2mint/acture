/**
 * `<AutoForm />` — render a CommandRecord's params schema as a small
 * form. Matches the `PaletteFormAdapter` shape expected by
 * `@acture/palette-react`.
 */

/// <reference lib="dom" />

import { useState } from 'react';
import type { AnyCommandRecord } from 'acture';
import type { z } from 'zod';

export interface AutoFormProps {
  command: AnyCommandRecord;
  defaults?: Record<string, unknown>;
  onSubmit: (params: unknown) => void;
  onCancel: () => void;
}

export function AutoForm(props: AutoFormProps): React.ReactElement {
  const { command, defaults, onSubmit, onCancel } = props;
  const fields = readShape(command.params);
  const [values, setValues] = useState<Record<string, unknown>>(() => seedValues(fields, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(): void {
    const schema = command.params as z.ZodTypeAny | undefined;
    if (!schema) {
      onSubmit({});
      return;
    }
    const result = (schema as unknown as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues?: { path: (string | number)[]; message: string }[] } } })
      .safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error?.issues ?? []) {
        const key = String(issue.path[0] ?? '');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    onSubmit(result.data);
  }

  function handleKey(e: React.KeyboardEvent<HTMLFormElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form
      data-acture-autoform
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      onKeyDown={handleKey}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}
    >
      <div style={{ fontWeight: 600 }}>{command.title}</div>
      {command.description ? (
        <div style={{ opacity: 0.7, fontSize: '0.9em' }}>{command.description}</div>
      ) : null}
      {fields.map((f, idx) => (
        <Field
          key={f.name}
          field={f}
          autoFocus={idx === 0}
          value={values[f.name]}
          error={errors[f.name]}
          onChange={(v) => {
            setValues((cur) => ({ ...cur, [f.name]: v }));
            if (errors[f.name]) {
              const { [f.name]: _drop, ...rest } = errors;
              void _drop;
              setErrors(rest);
            }
          }}
        />
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onCancel} data-acture-autoform-cancel>
          Cancel
        </button>
        <button type="submit" data-acture-autoform-submit>
          Run
        </button>
      </div>
      <div style={{ opacity: 0.5, fontSize: '0.8em' }}>⌘⏎ submit · Esc cancel</div>
    </form>
  );
}

/* ───────────────────────── fields ──────────────────────────────────── */

interface FieldDescriptor {
  name: string;
  schema: z.ZodTypeAny;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'unknown';
  enumValues: string[];
  description?: string;
}

function Field({
  field,
  value,
  error,
  onChange,
  autoFocus,
}: {
  field: FieldDescriptor;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  autoFocus?: boolean;
}): React.ReactElement {
  return (
    <label
      data-acture-autoform-field
      data-acture-field-type={field.type}
      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{field.description ?? field.name}</span>
      {field.type === 'enum' ? (
        <select
          autoFocus={autoFocus}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            {`pick ${field.name}`}
          </option>
          {field.enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : field.type === 'boolean' ? (
        <input
          autoFocus={autoFocus}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : field.type === 'number' ? (
        <input
          autoFocus={autoFocus}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') onChange(undefined);
            else {
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : raw);
            }
          }}
        />
      ) : (
        <input
          autoFocus={autoFocus}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? (
        <span data-acture-autoform-error style={{ color: '#c33', fontSize: '0.8em' }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

/* ─────────────────────── Zod inspection ───────────────────────────── */

function readShape(schema: unknown): FieldDescriptor[] {
  if (schema === null || typeof schema !== 'object') return [];
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) return [];
  return Object.entries(shape).map(([name, fieldSchema]) => ({
    name,
    schema: fieldSchema as z.ZodTypeAny,
    type: classifyField(fieldSchema as z.ZodTypeAny),
    enumValues: readEnumValues(fieldSchema as z.ZodTypeAny),
    description: (fieldSchema as unknown as { description?: string }).description,
  }));
}

function classifyField(s: z.ZodTypeAny): FieldDescriptor['type'] {
  const inner = unwrap(s);
  const t = getTypeName(inner);
  if (t === 'ZodEnum' || t === 'enum' || t === 'ZodNativeEnum' || t === 'nativeEnum') return 'enum';
  if (t === 'ZodBoolean' || t === 'boolean') return 'boolean';
  if (t === 'ZodNumber' || t === 'number') return 'number';
  if (t === 'ZodString' || t === 'string') return 'string';
  return 'unknown';
}

function readEnumValues(s: z.ZodTypeAny): string[] {
  const inner = unwrap(s);
  const def = readDef(inner);
  if (Array.isArray((def as { values?: unknown }).values)) {
    return ((def as { values: unknown[] }).values as unknown[]).filter(
      (v): v is string => typeof v === 'string',
    );
  }
  if ((def as { entries?: unknown }).entries && typeof (def as { entries?: unknown }).entries === 'object') {
    return Object.keys((def as { entries: Record<string, unknown> }).entries);
  }
  return [];
}

function readDef(s: unknown): Record<string, unknown> {
  if (s === null || typeof s !== 'object') return {};
  const def = (s as { _def?: object; def?: object })._def ?? (s as { def?: object }).def ?? {};
  return def as Record<string, unknown>;
}

function getTypeName(s: unknown): string | undefined {
  const def = readDef(s);
  if (typeof def['typeName'] === 'string') return def['typeName'] as string;
  if (typeof def['type'] === 'string') return def['type'] as string;
  return undefined;
}

function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
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
      t !== 'nullable'
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

function readDefaultValue(s: z.ZodTypeAny): unknown {
  let cur: unknown = s;
  for (let i = 0; i < 4; i++) {
    if (cur === null || typeof cur !== 'object') break;
    const def = readDef(cur);
    if ('defaultValue' in def) {
      const dv = def['defaultValue'];
      return typeof dv === 'function' ? (dv as () => unknown)() : dv;
    }
    cur = (def as { innerType?: unknown }).innerType;
  }
  return undefined;
}

function seedValues(
  fields: FieldDescriptor[],
  defaults?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (defaults && Object.prototype.hasOwnProperty.call(defaults, f.name)) {
      out[f.name] = defaults[f.name];
      continue;
    }
    const dv = readDefaultValue(f.schema);
    if (dv !== undefined) out[f.name] = dv;
    else if (f.type === 'boolean') out[f.name] = false;
    else if (f.type === 'string') out[f.name] = '';
  }
  return out;
}
