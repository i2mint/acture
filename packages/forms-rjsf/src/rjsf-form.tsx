/**
 * `<RjsfForm />` — render a CommandRecord's params schema using
 * react-jsonschema-form. Matches the `PaletteFormAdapter` shape
 * expected by `acture-palette-react`.
 *
 * The `<Form />` implementation is injectable (`form` prop) so the host can
 * render through any RJSF theme — `@rjsf/shadcn`, `@rjsf/mui`, … — without
 * this package ever depending on a UI kit.
 */

/// <reference lib="dom" />

import { useMemo } from 'react';
import type { ComponentType } from 'react';
import Form from '@rjsf/core';
import type { FormProps } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { AnyCommandRecord } from 'acture';
import { toJsonSchema } from 'acture';

/**
 * The shape of an RJSF `<Form />`. Every RJSF theme's default export has
 * exactly this type (`ComponentType<FormProps<any, RJSFSchema, any>>`), so a
 * theme can be handed to {@link RjsfForm} as-is.
 */
export type RjsfFormComponent = ComponentType<FormProps>;

export interface RjsfFormProps {
  command: AnyCommandRecord;
  defaults?: Record<string, unknown>;
  onSubmit: (params: unknown) => void;
  onCancel: () => void;
  /**
   * The RJSF `<Form />` to render with. Defaults to the unstyled form from
   * `@rjsf/core`. Pass a theme's default export — e.g. `@rjsf/shadcn` — to
   * render through a design system:
   *
   * ```tsx
   * import ShadcnForm from '@rjsf/shadcn';
   * <RjsfForm form={ShadcnForm} command={cmd} onSubmit={…} onCancel={…} />
   * ```
   *
   * acture never bundles a UI kit; the theme is the host's choice.
   */
  form?: RjsfFormComponent;
}

export function RjsfForm(props: RjsfFormProps): React.ReactElement {
  const { command, defaults, onSubmit, onCancel, form } = props;

  const inputSchema = useMemo(() => {
    return toJsonSchema(command).inputSchema;
  }, [command]);

  const FormImpl: RjsfFormComponent = form ?? Form;

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
      <FormImpl
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
      </FormImpl>
      <div style={{ opacity: 0.5, fontSize: '0.8em', marginTop: 6 }}>Esc to cancel</div>
    </div>
  );
}
