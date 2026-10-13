# Projecting the registry into a native application menu

**Status:** reference artifact, hand-written path (no `acture-*` dependency beyond the core registry you already have). Follows [`docs/positioning.md`](positioning.md); see [research-12](research/acture_research_12%20--%20Accessibility%20APIs%20and%20Command%20Dispatch.md) §4.1 for why.

## Why

An Electron or Tauri app draws its UI in a webview, so the operating system's accessibility tree sees one big web page. A **native menu** is the one place the OS sees real, named, enabled-or-not, shortcut-bearing items. Project the registry into it and your commands become visible to VoiceOver, the macOS Help-menu search, Raycast's *Search Menu Items*, Paletro, and every other client that reads menus, with no per-app work. The native menu is the app's accessibility surface for commands.

## The mapping

| `CommandRecord` | Native menu item | Notes |
| --- | --- | --- |
| `title` | `label` | Append `…` when the command takes parameters (the OS convention for "needs more input"); this is acture's handoff split. |
| `category` | top-level submenu | Order is registry order; reorder in the host. |
| `keybinding` | `accelerator` | `$mod` becomes `CommandOrControl`. Chords (`"g i"`) have no accelerator: leave it off. |
| `when` (evaluated) | `enabled` | Menus **show** unavailable commands, disabled. Build from the unfiltered `registry.list()` (see the hidden-vs-disabled rule in the `acture-palette-design` skill). |
| checked state | `checked`, `type: 'checkbox'` | From a separate state projection, below. |
| dispatch | `click` | `registry.dispatch(id, undefined, ctx)`. Parameterised commands call back to the host, which opens its palette or form. |

## Electron

The code below builds the template. It has no Electron import: `MenuItemOptions` is the subset of `MenuItemConstructorOptions` used, so you can pass the result to `Menu.buildFromTemplate`.

```ts
import { evaluateWhen } from 'acture';
import type { AnyCommandRecord, Context, Registry } from 'acture';

interface MenuItemOptions {
  label?: string;
  type?: 'normal' | 'checkbox' | 'separator' | 'submenu';
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  click?: () => void;
  submenu?: MenuItemOptions[];
}

interface MenuOptions {
  /** Current when-clause context. Read at build time. */
  ctx: () => Context;
  /** Checked state per command id, or undefined for a plain item. */
  checked?: (id: string, ctx: Context) => boolean | undefined;
  /** Called for a command that needs parameters; the host opens its form. */
  onParameterized: (cmd: AnyCommandRecord) => void;
}

/** tinykeys token to an Electron accelerator; undefined for chords. Partial:
 *  key names differ (Electron wants `Up`, `Plus`, ...), so extend for your bindings. */
function toAccelerator(keybinding: AnyCommandRecord['keybinding']): string | undefined {
  const first = typeof keybinding === 'string' ? keybinding : keybinding?.[0];
  if (!first || /\s/.test(first)) return undefined; // Electron has no key sequences
  return first.replace(/\$mod/gi, 'CommandOrControl').replace(/\bmeta\b/gi, 'Command');
}

export function toMenuTemplate(registry: Registry, options: MenuOptions): MenuItemOptions[] {
  const ctx = options.ctx();
  const byCategory = new Map<string, AnyCommandRecord[]>();
  for (const cmd of registry.list()) {           // unfiltered: disabled items stay visible
    const key = cmd.category ?? 'Commands';
    byCategory.set(key, [...(byCategory.get(key) ?? []), cmd]);
  }
  return [...byCategory].map(([category, cmds]) => ({
    label: category,
    submenu: cmds.map((cmd): MenuItemOptions => {
      const checked = options.checked?.(cmd.id, ctx);
      const needsParams = cmd.params !== undefined;
      const accelerator = toAccelerator(cmd.keybinding);
      return {
        label: needsParams ? `${cmd.title}…` : cmd.title,   // macOS/Windows convention
        type: checked === undefined ? 'normal' : 'checkbox',
        ...(checked !== undefined ? { checked } : {}),
        ...(accelerator ? { accelerator } : {}),
        enabled: evaluateWhen(cmd.when, ctx),
        click: () => {
          if (needsParams) options.onParameterized(cmd);
          else void registry.dispatch(cmd.id, undefined, options.ctx());
        },
      };
    }),
  }));
}
```

Install it in the main process (or in the renderer and send the template over IPC; `click` functions do not cross IPC, so in practice send `{ id }` and dispatch on the renderer side):

```ts
import { Menu } from 'electron';

const rebuild = () =>
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(toMenuTemplate(registry, { ctx: getCtx, onParameterized: openPalette })),
  );
rebuild();
registry.onCommandsChanged(rebuild); // new or removed commands
// `enabled`/`checked` are read when the menu is built: rebuild() whenever the
// context that `when` reads changes (selection, focus, mode), or mutate the
// MenuItem's `enabled`/`checked` in place.
```

## Tauri

Same mapping, different constructors. In Tauri 2 build the menu with `Menu.new`, `Submenu.new`, `MenuItem.new({ id, text, accelerator, enabled, action })` and `CheckMenuItem.new({ id, text, checked, ... })` from `@tauri-apps/api/menu`, then `menu.setAsAppMenu()`. Tauri accelerators use the same `CommandOrControl+B` spelling. Check the current Tauri docs for exact option names; the Electron code above is the reference; the mapping table is what carries over.

## Checked state (toggle commands)

Checkable commands ("Toggle sidebar", "Word wrap") are `menuitemcheckbox` / `AXMenuItemMarkChar` / UIA Toggle on every platform, and the record has nowhere to say "currently on". **Decision: do not add a `CommandRecord` field.** A record is data about what a command *is*; whether it is on is state, and it changes. Keep it in a projection keyed by command id:

```ts
type CheckedState = (id: string, ctx: Context) => boolean | 'mixed' | undefined;
//   undefined: not a toggle (plain item).   'mixed': indeterminate.
```

The host implements it from the state it already owns (`(id, ctx) => id === 'app.view.sidebar' ? ctx.ui.sidebarOpen : undefined`). Each surface consumes it:

- native menu: `checked`, `type: 'checkbox'` (Electron has no indeterminate state; render `'mixed'` as unchecked);
- web button: `aria-pressed`; menu item: `role="menuitemcheckbox"` + `aria-checked` (`"mixed"` allowed);
- announcer: a custom `formatResult` can speak "Sidebar on" from the same projection.

This is *design only*: the native menu above is the named consumer, and it uses the `checked` option. Revisit a shared helper in `acture-a11y` when a second surface needs it.

## What this does not do

It does not read *other* apps' menus (that is the universal palette of research-12 §5, not an acture task), and it does not make the in-webview UI accessible: pair it with `acture-a11y`'s `toAriaProps` and `announceDispatches` for that.
