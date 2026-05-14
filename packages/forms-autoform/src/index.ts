/**
 * `acture-forms-autoform` — Zod-native form adapter for the
 * `acture-palette-react` `formAdapter` prop.
 *
 * For handoff commands (per research-2 §9.4), the palette renders an
 * `AutoForm` derived from the command's `params` schema. The form
 * supports keyboard-only completion (`Cmd+Enter` submit, `Esc` cancel)
 * and inline per-field validation against the Zod schema.
 *
 * This is a *minimal* Zod-aware renderer — covers `string`, `number`,
 * `boolean`, `enum`, plus optional/default wrappers. Complex shapes
 * (nested objects, arrays, discriminated unions) should reach for
 * `acture-forms-rjsf` or a custom adapter.
 */

export { AutoForm } from './auto-form.js';
export type { AutoFormProps } from './auto-form.js';
