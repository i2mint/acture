# @acture/palette-react

Phase 1 command palette for [acture](https://npm.im/acture). Wraps [cmdk](https://cmdk.paco.me) and exposes commands from an acture `Registry`.

**Phase 1 scope:** parameter-free commands only. Parameterized commands appear with a "Phase 2" badge and are not dispatched — Phase 2 ships the picker chain (`kind: "atomic"`) and form hand-off (`kind: "handoff"`) per research-2.

```tsx
import { CommandPalette } from '@acture/palette-react';
import { createRegistry, defineCommand, ok } from 'acture';

const registry = createRegistry();
registry.register(
  defineCommand({
    id: 'app.view.zoomToFit',
    title: 'Zoom to fit',
    category: 'View',
    keybinding: '$mod+0',
    execute: () => ok(undefined),
  }),
);

export function App() {
  const [open, setOpen] = useState(false);

  // Ctrl/Cmd+K opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()}>
        <CommandPalette
          registry={registry}
          onDispatched={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
```

Pair with `[acture]` styles for cmdk:

```css
[cmdk-root] { /* … */ }
[cmdk-input] { /* … */ }
[cmdk-item][aria-selected='true'] { /* … */ }
```

See the `examples/greenfield/graph-editor` worked example for a full setup.
