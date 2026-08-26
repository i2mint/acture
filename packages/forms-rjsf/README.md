# acture-forms-rjsf

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

JSON-Schema-native form adapter for [`acture-palette-react`](../palette-react). Wraps [react-jsonschema-form (`@rjsf/core`)](https://rjsf-team.github.io/react-jsonschema-form/) and projects the command's params schema through acture's `toJsonSchema` bridge.

Use this when:

- the command's `params` are a JSON Schema literal (not Zod), or
- the host wants rjsf's mature theme ecosystem (Bootstrap, MUI, Tailwind).

For Zod-first authoring with a leaner runtime, prefer [`acture-forms-autoform`](../forms-autoform).

## Install

```sh
pnpm add acture-forms-rjsf @rjsf/core @rjsf/utils @rjsf/validator-ajv8 react
```

Peers on `@rjsf` **`^5.20.0 || ^6.0.0`**. Every API this adapter touches is
shape-identical across the two majors, so the same code serves both, and **both
halves run in CI**: the main job installs and tests 6.x, and a second job
(`rjsf5`) installs its own plain 5.x tree and typechecks + tests the adapter
against it. **Prefer 6.x** — `@rjsf/shadcn`, the theme most hosts want, is
published on the 6.x line only, so the shadcn smoke test is 6.x-only.

## Use as a palette form adapter

```tsx
import { CommandPalette } from 'acture-palette-react';
import { RjsfForm } from 'acture-forms-rjsf';

<CommandPalette registry={registry} context={ctx} formAdapter={RjsfForm} />;
```

## Theming

The default render is rjsf's bare bones. Pass any RJSF theme's `<Form />` via the
`form` prop — acture never bundles a UI kit, so the design system is your choice:

```tsx
import ShadcnForm from '@rjsf/shadcn';
import { RjsfForm } from 'acture-forms-rjsf';

<RjsfForm form={ShadcnForm} command={cmd} onSubmit={run} onCancel={close} />;
```

To hand a themed form to the palette, bind the theme once:

```tsx
import type { PaletteFormAdapter } from 'acture-palette-react';

const ShadcnRjsfForm: PaletteFormAdapter = (props) => (
  <RjsfForm {...props} form={ShadcnForm} />
);

<CommandPalette registry={registry} context={ctx} formAdapter={ShadcnRjsfForm} />;
```

Every RJSF theme's default export has the same type (`ComponentType<FormProps>`),
so `@rjsf/mui`, `@rjsf/chakra-ui`, `@rjsf/antd`, … all drop in the same way. The
acture-side bridge is identical.

> **Keep the `form` value referentially stable.** React reconciles by element
> type, so building the theme inline — `form={withTheme(myTheme)}` in JSX, or an
> un-hoisted adapter arrow — yields a new component type on every render: the
> form remounts and whatever the user had typed is silently reset to `defaults`.
> Both snippets above are safe because `ShadcnForm` and `ShadcnRjsfForm` are
> module-level bindings. Hoist yours the same way.

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md) — how Zod → JSON Schema flows
- [`acture-forms-autoform`](../forms-autoform) — Zod-native alternative
