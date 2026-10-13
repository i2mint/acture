# acture-a11y

> **acture is a development tool first.** This package is an *optional accelerator*: an agent can hand-write these projections into your project with no `acture-*` dependency. See [`docs/hand-written-a11y.md`](../../docs/hand-written-a11y.md) and [`docs/positioning.md`](../../docs/positioning.md).
>
> **Status: unpublished (`private`).** Flip `private` off in `package.json` and add a changeset to release it.

Accessibility projections for a command registry (research-12). A `CommandRecord` already has the shape of a cross-platform accessibility action (label, description, key binding, enabled, invoke); this package renders it as ARIA and announces what happened.

## Announce dispatch results (WCAG 4.1.3)

```ts
import { createAnnouncer, announceDispatches } from 'acture-a11y';

const announcer = createAnnouncer();               // hidden polite live region
const stop = announceDispatches(registry, { announcer });
// every dispatch, from any surface, now speaks: "Export failed: disk full"
```

Default messages are `"<title> done"` and `"<title> failed: <message>"`. Pass `formatResult` to say something better (`"3 nodes deleted"`) or return `null` to stay silent when the effect is already visible.

## ARIA attributes for a button, menu item or toolbar item

```tsx
import { toAriaProps } from 'acture-a11y';

<button {...toAriaProps(cmd, { ctx })} onClick={() => registry.dispatch(cmd.id, undefined, ctx)}>
  {cmd.title}
</button>
```

You get `aria-label` (the title), `aria-description`, `aria-disabled="true"` when `when` is false, and `aria-keyshortcuts` (`$mod` resolved to `Control` or `Meta`; chords are omitted because ARIA cannot express sequences). A disabled command advertises no shortcut. Pass `keys` (for example `resolveKeys(cmd, userKeymap)` from `acture-hotkeys`) so the attribute reflects the shortcut that is really bound. Choosing the element and role is the surface's job.

Menus show unavailable commands as disabled; the palette hides them. See the hidden-vs-disabled rule in the `acture-palette-design` skill, and [`docs/hand-written-native-menu.md`](../../docs/hand-written-native-menu.md) for the Electron/Tauri menu projection and the checked-state design.
