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
shape-identical across the two majors, so the same code serves both. **Prefer
6.x**: `@rjsf/shadcn` — the theme most hosts want — is published on the 6.x line
only, and 6.x is what CI installs and tests. 5.x is supported but exercised by
hand, not on every commit (a single dev tree cannot hold both majors; pnpm
matches peer deps by package name, so an aliased 5.x install silently binds the
6.x `@rjsf/utils`).

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

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md) — how Zod → JSON Schema flows
- [`acture-forms-autoform`](../forms-autoform) — Zod-native alternative
