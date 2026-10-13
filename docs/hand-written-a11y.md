# The hand-written accessibility projections: a reproducible reference

**Status:** reference artifact. A developer can make a command registry accessible with **zero `acture-*` dependency** by hand-writing the two small pieces below. `packages/a11y/src/` (`acture-a11y`, currently unpublished) is the tested implementation; read it for the full version, with edge cases (`$mod++`, de-duplication, throwing formatters). Read [`docs/positioning.md`](positioning.md) first.

Why these two: [research-12](research/acture_research_12%20--%20Accessibility%20APIs%20and%20Command%20Dispatch.md) §3 found that `CommandRecord` already matches the accessibility action shape, so only projections are missing. Neither needs a new record field.

## 1. The record to ARIA projection (~20 lines)

```ts
import type { AnyCommandRecord, Context } from 'acture';
// `evaluateWhen` is exported by acture core. Hand-written registries use their own.

export function toAriaProps(cmd: AnyCommandRecord, ctx: Context = {}, apple = false) {
  const available = evaluateWhen(cmd.when, ctx);
  const keys = [cmd.keybinding ?? []].flat()
    .filter((k) => !/\s/.test(k))                      // ARIA cannot express chords
    .map((k) => k.split('+').map((p, i, all) =>
      p === '$mod' ? (apple ? 'Meta' : 'Control')
      : i === all.length - 1 && p.length === 1 ? p.toUpperCase() : p).join('+'));
  return {
    'aria-label': cmd.title,                           // WCAG 2.5.3: name contains the visible label
    ...(cmd.description ? { 'aria-description': cmd.description } : {}),
    ...(available ? {} : { 'aria-disabled': 'true' }), // not the `disabled` attribute: it leaves the tab order
    ...(available && keys.length ? { 'aria-keyshortcuts': keys.join(' ') } : {}),
  };
}
```

Emit `aria-keyshortcuts` only where the shortcut is live (buttons, menu items). On palette options it is misleading: pressing the shortcut does not activate the option.

## 2. The dispatch-result announcer (~25 lines)

```ts
import type { Context, DispatchOptions, Registry, Result } from 'acture';

export function announceDispatches(registry: Registry): () => void {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');               // polite live region
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
  document.body.appendChild(region);

  let flip = false;
  const original = registry.dispatch.bind(registry);
  (registry as { dispatch: Registry['dispatch'] }).dispatch = async function announced<R>(
    id: string, params?: unknown, ctx?: Context, opts?: DispatchOptions,
  ): Promise<Result<R>> {
    const result = await original<R>(id, params, ctx, opts);
    const name = registry.get(id)?.title ?? id;
    flip = !flip;                                      // identical text twice must still change the DOM
    region.textContent = (result.ok ? `${name} done` : `${name} failed: ${result.error.message}`) + (flip ? '' : ' ');
    return result;
  };
  return () => { (registry as { dispatch: Registry['dispatch'] }).dispatch = original; region.remove(); };
}
```

Why each piece: the region must exist *before* it is written to, or some screen readers miss the first message, so create it once at install. `aria-atomic` makes the whole message be read. Wrapping `dispatch` (not the palette) is what makes every surface announce: hotkeys, menus, macros and AI included. Dispose in reverse install order when other instrumenters wrap the same registry.

For the native-menu projection and the checked-state design, see [`hand-written-native-menu.md`](hand-written-native-menu.md).
