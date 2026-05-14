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
 */

export { RjsfForm } from './rjsf-form.js';
export type { RjsfFormProps } from './rjsf-form.js';
