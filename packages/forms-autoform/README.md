# @acture/forms-autoform

Zod-native form adapter for [`@acture/palette-react`](../palette-react). Renders a parameterized command's `params` schema as a small form with per-field validation against the schema.

## Install

```sh
pnpm add @acture/forms-autoform @acture/palette-react acture
```

## Use as a palette form adapter

```tsx
import { CommandPalette } from '@acture/palette-react';
import { AutoForm } from '@acture/forms-autoform';

<CommandPalette
  registry={registry}
  context={ctx}
  formAdapter={AutoForm}    // ← all handoff commands render here
/>
```

When a user picks a `kind: 'handoff'` command (e.g., `addNode({x, y, label})`), the palette switches its inner view to `<AutoForm command={...} />`. Submit dispatches the command; Esc / Cancel returns to the list view.

## Keyboard

- **⌘⏎ / Ctrl+⏎** submits.
- **Esc** cancels.
- **Tab** moves between fields.

## What it renders

| Zod | UI |
| --- | --- |
| `z.string()` | text input |
| `z.string().min(...)` | text input + min-length validator |
| `z.number()` | number input |
| `z.boolean()` | checkbox |
| `z.enum([...])` / `z.nativeEnum(...)` | `<select>` |
| Optional / default wrappers | unwrapped, defaults seeded |

For richer schemas (nested objects, arrays, discriminated unions), use [`@acture/forms-rjsf`](../forms-rjsf) instead.

## Why "autoform"?

The name is a nod to [@autoform/zod](https://github.com/vantezzen/autoform). We do NOT depend on @autoform — the surface area we need is small enough to hand-roll without adding a UI-library coupling.
