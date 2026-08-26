/**
 * `acture-forms-rjsf` — JSON-Schema-native form adapter for
 * `acture-palette-react`. Wraps [react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/)
 * (`@rjsf/core`) and projects the command's params schema through
 * acture's `toJsonSchema` bridge.
 *
 * Use this when:
 *   - the command's params are a JSON Schema literal (not Zod), or
 *   - the host wants a battle-tested form library with rich theming.
 *
 * For Zod-first authoring with a leaner runtime, prefer
 * [`acture-forms-autoform`](../forms-autoform).
 *
 * Peers on `@rjsf` `^5.20.0 || ^6.0.0`; prefer **6.x**, which is what CI tests
 * and the only line `@rjsf/shadcn` is published on. The `form` prop takes any
 * RJSF theme's `<Form />` — `@rjsf/shadcn`, `@rjsf/mui`, … — so the host picks
 * the UI kit and this package never bundles one.
 */

export { RjsfForm } from './rjsf-form.js';
export type { RjsfFormProps, RjsfFormComponent } from './rjsf-form.js';
