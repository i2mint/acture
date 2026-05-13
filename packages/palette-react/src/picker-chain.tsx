/**
 * Atomic picker-chain UI rendered INSIDE the palette container.
 *
 * Used when `deriveKind(record) === 'atomic'` for parameterized
 * commands. Each step shows a labeled picker / input for one param;
 * Enter advances when valid; Esc backs up to the previous step (or
 * cancels at step 0).
 *
 * Per research-2 §9.4: per-step validation inline, step counter `n/N`
 * only when N ≥ 2, Tab/Enter both advance, Esc backs up.
 *
 * This is deliberately minimal — a host that wants richer field
 * widgets can pass a custom `pickerRenderer`.
 */

/// <reference lib="dom" />

import { Command } from 'cmdk';
import { useState } from 'react';
import type { AnyCommandRecord } from 'acture';
import { readEnumOptions, summarizeParams, unwrap } from './derive-kind.js';
import type { ParamSummary } from './derive-kind.js';

export interface PickerChainProps {
  command: AnyCommandRecord;
  /** Initial values (e.g. defaults derived from context). */
  defaults?: Record<string, unknown>;
  /** Called when the user finishes the last step. */
  onSubmit: (params: Record<string, unknown>) => void;
  /** Called when the user cancels (Esc at step 0). */
  onCancel: () => void;
}

export function PickerChain(props: PickerChainProps): React.ReactElement {
  const { command, defaults, onSubmit, onCancel } = props;
  const summary = summarizeParams(command);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(defaults ?? {}) }));
  const [step, setStep] = useState(0);

  const current: ParamSummary | undefined = summary[step];

  function commit(value: unknown): void {
    if (!current) return;
    const next = { ...values, [current.name]: value };
    setValues(next);
    if (step + 1 >= summary.length) {
      onSubmit(next);
    } else {
      setStep(step + 1);
    }
  }

  function back(): void {
    if (step === 0) {
      onCancel();
      return;
    }
    setStep(step - 1);
  }

  if (!current) {
    // Should not normally render — fallback to submit.
    onSubmit(values);
    return <></>;
  }

  const counter = summary.length >= 2 ? `${step + 1}/${summary.length}` : null;
  const label = paramLabel(current);

  return (
    <div data-acture-picker-chain style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        data-acture-picker-chain-header
        style={{ padding: '8px 12px', borderBottom: '1px solid var(--acture-divider, #eee)' }}
      >
        <strong>{command.title}</strong>
        {counter ? <span style={{ marginLeft: 8, opacity: 0.6 }}>{counter}</span> : null}
        <span style={{ marginLeft: 8, opacity: 0.6 }}>· {label}</span>
      </div>
      <Step key={`${command.id}.${current.name}`} param={current} initial={values[current.name]} onCommit={commit} onBack={back} />
      <div style={{ padding: '4px 12px', opacity: 0.6, fontSize: '0.85em' }}>
        ⏎ to advance · Esc to {step === 0 ? 'cancel' : 'go back'}
      </div>
    </div>
  );
}

function paramLabel(p: ParamSummary): string {
  const def = (p.schema as unknown as { description?: string }).description;
  if (typeof def === 'string' && def.length > 0) return def;
  return p.name;
}

/* ─────────────────────────── per-step UIs ─────────────────────────── */

interface StepProps {
  param: ParamSummary;
  initial: unknown;
  onCommit: (value: unknown) => void;
  onBack: () => void;
}

function Step(props: StepProps): React.ReactElement {
  const { param } = props;
  if (param.isPicker) {
    const enumOptions = readEnumOptions(param.schema);
    if (enumOptions.length > 0) {
      return <EnumPicker {...props} options={enumOptions} />;
    }
    // Boolean picker (or boolean-like via unwrap chain).
    const innerName = (unwrap(param.schema) as unknown as { _def?: { typeName?: string }; def?: { type?: string } });
    const t = innerName._def?.typeName ?? innerName.def?.type;
    if (t === 'ZodBoolean' || t === 'boolean') {
      return <EnumPicker {...props} options={['true', 'false']} coerce={(s) => s === 'true'} />;
    }
  }
  return <TextStep {...props} />;
}

function EnumPicker({
  param,
  initial,
  onCommit,
  onBack,
  options,
  coerce,
}: StepProps & { options: readonly string[]; coerce?: (s: string) => unknown }): React.ReactElement {
  return (
    <Command label={`Pick ${param.name}`} shouldFilter={true}>
      <Command.Input
        placeholder={`Pick ${param.name}…`}
        autoFocus
        defaultValue={typeof initial === 'string' ? initial : ''}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onBack();
          }
        }}
      />
      <Command.List>
        <Command.Empty>No match.</Command.Empty>
        {options.map((opt) => (
          <Command.Item
            key={opt}
            value={opt}
            onSelect={() => onCommit(coerce ? coerce(opt) : opt)}
          >
            {opt}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

function TextStep({ param, initial, onCommit, onBack }: StepProps): React.ReactElement {
  const [draft, setDraft] = useState<string>(
    typeof initial === 'string' ? initial : initial === undefined ? '' : String(initial),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function submit(): void {
    const coerced = coerceFromText(draft, param);
    const parseResult = (param.schema as unknown as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues?: { message: string }[] } } })
      .safeParse(coerced);
    if (!parseResult.success) {
      setErrorMsg(parseResult.error?.issues?.[0]?.message ?? 'Invalid value');
      return;
    }
    onCommit(parseResult.data);
  }

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        data-acture-text-step
        autoFocus
        value={draft}
        placeholder={inferPlaceholder(param)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (errorMsg) setErrorMsg(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onBack();
          }
        }}
        style={{
          padding: '8px 10px',
          border: errorMsg ? '1px solid #c33' : '1px solid var(--acture-divider, #ccc)',
          borderRadius: 4,
          font: 'inherit',
        }}
      />
      {errorMsg ? (
        <span style={{ color: '#c33', fontSize: '0.85em' }} data-acture-validation-error>
          {errorMsg}
        </span>
      ) : null}
    </div>
  );
}

function coerceFromText(raw: string, p: ParamSummary): unknown {
  const inner = unwrap(p.schema) as unknown as { _def?: { typeName?: string }; def?: { type?: string } };
  const t = inner._def?.typeName ?? inner.def?.type;
  if (t === 'ZodNumber' || t === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (t === 'ZodBoolean' || t === 'boolean') {
    return raw === 'true';
  }
  return raw;
}

function inferPlaceholder(p: ParamSummary): string {
  const inner = unwrap(p.schema) as unknown as { _def?: { typeName?: string }; def?: { type?: string } };
  const t = inner._def?.typeName ?? inner.def?.type;
  if (t === 'ZodNumber' || t === 'number') return `${p.name} (number)…`;
  if (t === 'ZodString' || t === 'string') return `${p.name}…`;
  return `${p.name}…`;
}
