# acture-devtools

> **acture is a development tool first.** This is dev/build-time tooling — it never becomes a runtime dependency of the apps it serves, and using it is entirely optional. See [`docs/positioning.md`](../../docs/positioning.md).

Embeddable React Inspector + dispatch-log instrumentation for acture registries. Dev-only — production builds skip the imports and tree-shake to nothing.

## Install

```bash
pnpm add -D acture-devtools
```

## Mount the Inspector

```tsx
import { Inspector, instrumentRegistry } from 'acture-devtools';
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

## `enableTierWarnings(registry, options?)`

Wraps `registry.dispatch` to emit a once-per-command `console.warn` on the first dispatch of each `@experimental` command in a process — a nudge that an unstable surface is being exercised.

```ts
import { enableTierWarnings } from 'acture-devtools';
import { registry } from './registry';

enableTierWarnings(registry);
```

Options:

- `enabled?: boolean` — force on/off. Default: auto — suppressed when `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1` is set in `process.env`.
- `warn?: (message: string) => void` — custom sink. Default: `console.warn`.

Returns a disposer that restores the original `dispatch`. Idempotent: calling twice returns the same disposer.

Like `instrumentRegistry`, this is dispatch *instrumentation* — it observes dispatch without changing its semantics — so it lives here, not in `acture` core. The core stays the minimal primitive (registry + dispatcher + schema bridge + state-adapter interface); anything that wraps `dispatch` to observe it is an opt-in devtools concern. The agent-written equivalent is a few lines around `registry.dispatch`; see [`docs/hand-written-registry.md`](../../docs/hand-written-registry.md).
