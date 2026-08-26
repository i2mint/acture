---
'acture-forms-rjsf': minor
---

Accept `@rjsf` 6.x, and make the RJSF theme injectable.

The `@rjsf/core` / `@rjsf/utils` / `@rjsf/validator-ajv8` peer ranges move from
`^5.20.0` to `^5.20.0 || ^6.0.0`. `@rjsf/shadcn` is published on the 6.x line
only, so the old range made the shadcn theme — the one every frontend in this
ecosystem wants — impossible to install alongside this adapter. The failure was
an npm peer conflict at install time, i.e. before a line of form code got
written. No adapter code was needed to span the two majors: `@rjsf/core`'s
default export and `FormProps`, `@rjsf/validator-ajv8`'s default export, and the
`schema` / `formData` / `validator` / `liveValidate` / `onSubmit` / children
props are shape-identical on both.

`<RjsfForm />` gains an optional **`form`** prop taking any RJSF theme's
`<Form />` (`ComponentType<FormProps>` — the type every theme's default export
already has), defaulting to the unstyled `@rjsf/core` form:

```tsx
import ShadcnForm from '@rjsf/shadcn';
<RjsfForm form={ShadcnForm} command={cmd} onSubmit={run} onCancel={close} />;
```

Before this, the README told you to "pass your own `Form` from the themed
package" and there was no prop that accepted one. acture still bundles no UI kit
(hard-don't #8) — the theme is the host's, injected.

Both halves of the widened range are checked on every PR: the main CI job
installs and tests 6.x, and a second job installs its own plain 5.x tree and
typechecks + tests the adapter against it.

The `form` value must be referentially stable (bind a theme at module level) —
React reconciles by element type, so an inline `withTheme(...)` remounts the
form and discards in-progress input. Documented on the prop and in the README.

Also exported: the `RjsfFormComponent` type.
