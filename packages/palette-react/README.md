# @acture/palette-react

Command palette for [acture](https://npm.im/acture). Wraps [cmdk](https://cmdk.paco.me) and reads commands directly off the registry.

## Phase 2 surface

- **Parameter-free commands** dispatch on selection.
- **Parameterized commands** route through `deriveKind`:
  - `kind: 'atomic'` → inline **picker chain** (Linear / Discord-style) inside the palette.
  - `kind: 'handoff'` → renders a host-supplied **form adapter** inline; if none, fires `onParameterizedSelect` and the host opens its own form view.
- **`commandsChanged`** events drive incremental re-renders.

The `kind` is auto-derived from the schema unless `record.kind` is set explicitly. Per research-2 §9.3:

| Param shape | Auto `kind` |
| --- | --- |
| 0 params | `atomic` |
| 1–2 params, all picker-typed (enum, boolean) | `atomic` |
| 3 params, all picker-typed + all with defaults | `atomic` |
| Anything else | `handoff` |

## Install

```sh
pnpm add @acture/palette-react cmdk react
# pick a form adapter for handoff commands:
pnpm add @acture/forms-autoform   # Zod-native (recommended)
# or
pnpm add @acture/forms-rjsf       # JSON-Schema-native
```

## Usage

```tsx
import { CommandPalette } from '@acture/palette-react';
import { AutoForm } from '@acture/forms-autoform';
import { registry } from './registry';

function PaletteOverlay({ context, onClose }) {
  return (
    <div className="palette-overlay">
      <CommandPalette
        registry={registry}
        context={context}
        formAdapter={AutoForm}
        onDispatched={() => onClose()}
      />
    </div>
  );
}
```

## Picker-typed schemas

The atomic picker chain renders for `z.enum`, `z.boolean`, and `z.nativeEnum` schemas out of the box. To mark a custom string field as picker-typed, attach an explicit hint:

```ts
import { z } from 'zod';

params: z.object({
  channel: z.string().meta({ paramKind: 'picker' }),  // treated as picker
});
```

## Context prefill

Use `paramDefaults` to inject context-aware defaults (Things-style — research-2 L2):

```tsx
<CommandPalette
  registry={registry}
  context={ctx}
  paramDefaults={(cmd) => {
    if (cmd.id === 'app.task.assign') return { assignee: ctx.user.id };
    return undefined;
  }}
/>
```

## Styling

Every meaningful node carries a `data-acture-*` attribute. Style with CSS — the package does not ship a stylesheet.

- `[data-acture-palette-view="list" | "picker-chain" | "form"]`
- `[data-acture-palette-item]`
- `[data-acture-kind="atomic" | "handoff"]`
- `[data-acture-picker-chain]`

## See also

- [acture-palette-design](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-palette-design/SKILL.md) — the design rationale
- [@acture/forms-autoform](../forms-autoform) — Zod-native form adapter
- [@acture/forms-rjsf](../forms-rjsf) — JSON-Schema-native form adapter
