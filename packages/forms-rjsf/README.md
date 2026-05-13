# @acture/forms-rjsf

JSON-Schema-native form adapter for [`@acture/palette-react`](../palette-react). Wraps [react-jsonschema-form (`@rjsf/core`)](https://rjsf-team.github.io/react-jsonschema-form/) and projects the command's params schema through acture's `toJsonSchema` bridge.

Use this when:

- the command's `params` are a JSON Schema literal (not Zod), or
- the host wants rjsf's mature theme ecosystem (Bootstrap, MUI, Tailwind).

For Zod-first authoring with a leaner runtime, prefer [`@acture/forms-autoform`](../forms-autoform).

## Install

```sh
pnpm add @acture/forms-rjsf @rjsf/core @rjsf/utils @rjsf/validator-ajv8 react
```

## Use as a palette form adapter

```tsx
import { CommandPalette } from '@acture/palette-react';
import { RjsfForm } from '@acture/forms-rjsf';

<CommandPalette registry={registry} context={ctx} formAdapter={RjsfForm} />;
```

## Theming

The default render is rjsf's bare bones. To use a theme, wrap `RjsfForm` and pass your own `Form` from the themed package (`@rjsf/mui`, `@rjsf/chakra-ui`, etc.). The acture-side bridge is identical.

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md) — how Zod → JSON Schema flows
- [`@acture/forms-autoform`](../forms-autoform) — Zod-native alternative
