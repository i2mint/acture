# @acture/devtools

Embeddable React Inspector + dispatch-log instrumentation for acture registries. Dev-only — production builds skip the imports and tree-shake to nothing.

## Install

```bash
pnpm add -D @acture/devtools
```

## Mount the Inspector

```tsx
import { Inspector, instrumentRegistry } from '@acture/devtools';
import { registry } from './registry';

// Instrument once at module load so every dispatch is captured.
// Idempotent — re-imports do not re-wrap.
const dispatchLog = instrumentRegistry(registry);

function App() {
  const [showInspector, setShowInspector] = useState(false);
  return (
    <>
      <YourApp />
      <button onClick={() => setShowInspector((v) => !v)}>
        {showInspector ? 'Hide' : 'Show'} inspector
      </button>
      {showInspector ? <Inspector registry={registry} log={dispatchLog} /> : null}
    </>
  );
}
```

Three tabs:

- **Commands** — list of registered commands with tier badges, filterable by tier (stable / experimental / deprecated / internal) and free-text search.
- **Dispatch log** — ring-buffered most-recent-first list of every `registry.dispatch` call, with params, result, and duration. `clear` button. Default capacity 200 entries.
- **When evaluator** — small REPL: type a when-clause DSL string and a JSON context, see the evaluation result update live.

## Theming

No bundled UI kit. The component uses inline styles only. Theme via the `data-acture-devtools-*` attributes:

```css
[data-acture-devtools-inspector] { font-family: 'Your Font', monospace; }
[data-acture-devtools-tabbar] button { background: var(--your-bg); }
[data-acture-devtools-commands] table { /* ... */ }
```

## `instrumentRegistry(registry, options?)`

Wraps `registry.dispatch` to capture every call. Returns a `DispatchLog` with:

- `entries: readonly DispatchLogEntry[]` — most recent at the end.
- `subscribe(listener): unsubscribe` — fires on each new entry.
- `clear()` — drop all entries.

Options:

- `maxEntries?: number` — ring-buffer size, default 200.

Idempotent: calling twice on the same registry returns the same log. The mutation is local to this package; production builds simply don't call `instrumentRegistry` and pay zero runtime cost.

See [`acture-hard-donts`](../../.claude/skills/acture-hard-donts/SKILL.md) §6 for why dev-only registry mutation is allowed when core React-coupling is not.
