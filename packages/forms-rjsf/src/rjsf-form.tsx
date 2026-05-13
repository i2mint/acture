/**
 * `<RjsfForm />` — render a CommandRecord's params schema using
 * react-jsonschema-form. Matches the `PaletteFormAdapter` shape
 * expected by `@acture/palette-react`.
 */

/// <reference lib="dom" />

import { useMemo } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { AnyCommandRecord } from 'acture';
import { toJsonSchema } from 'acture';

export interface RjsfFormProps {
  command: AnyCommandRecord;
  defaults?: Record<string, unknown>;
  onSubmit: (params: unknown) => void;
  onCancel: () => void;
}

export function RjsfForm(props: RjsfFormProps): React.ReactElement {
  const { command, defaults, onSubmit, onCancel } = props;

  const inputSchema = useMemo(() => {
    return toJsonSchema(command).inputSchema;
  }, [command]);

  return (
    <div
      data-acture-rjsf
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{ padding: 12 }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{command.title}</div>
      {command.description ? (
        <div style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: 12 }}>
          {command.description}
        </div>
      ) : null}
      <Form
        schema={inputSchema}
        formData={defaults}
        validator={validator}
        liveValidate={false}
        onSubmit={({ formData }) => onSubmit(formData)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onCancel} data-acture-rjsf-cancel>
            Cancel
          </button>
          <button type="submit" data-acture-rjsf-submit>
            Run
          </button>
        </div>
      </Form>
      <div style={{ opacity: 0.5, fontSize: '0.8em', marginTop: 6 }}>Esc to cancel</div>
    </div>
  );
}
