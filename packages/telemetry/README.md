# acture-telemetry

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md). The agent-written equivalent is [`docs/hand-written-telemetry.md`](../../docs/hand-written-telemetry.md).

Telemetry adapter for [acture](https://npm.im/acture). Observes every `dispatch` and forwards a structured record to a configurable sink. **Errors-as-data preserved end-to-end** — failed dispatches appear in telemetry with their error code, not as exceptions.

## Install

```sh
pnpm add acture-telemetry
```

## Use

```ts
import { instrumentTelemetry, consoleSink } from 'acture-telemetry';
import { registry } from './registry';

const stop = instrumentTelemetry(registry, {
  sink: consoleSink,
});

// later, on teardown:
stop();
```

`consoleSink` is a one-line summary printer (`[acture] app.foo ok 1.2ms`). For real apps, pass your own sink — a structured logger, a network beacon, an OpenTelemetry exporter:

```ts
import { instrumentTelemetry } from 'acture-telemetry';
import { logger } from './my-logger';

instrumentTelemetry(registry, {
  sink: (record) => {
    logger.info({
      cmd: record.commandId,
      ok: record.result.ok,
      ms: record.durationMs,
      ...(record.result.ok ? {} : { error: record.result.error }),
    });
  },
});
```

## The record shape

Every sink receives the same closed, minimal record:

```ts
interface TelemetryRecord {
  readonly seq: number;        // monotonic in-process id
  readonly ts: number;          // Date.now() at sink time
  readonly commandId: string;   // even if unknown to the registry
  readonly params: unknown;     // what the caller passed
  readonly ctx: Context;        // dispatch ctx (defaults to {})
  readonly result: Result<unknown>;  // full Result — errors-as-data
  readonly durationMs: number;  // dispatch in → resolved
}
```

`result` is the full `Result<unknown>` from the dispatcher. A failed dispatch arrives as `{ ok: false, error: { code, message, details? } }` — the sink sees the same shape every other surface sees (palette, hotkeys, AI, MCP).

## Optional `sampler` and `redact`

Both are simple callbacks — same shape as `sink`. No mini-DSL:

```ts
instrumentTelemetry(registry, {
  sink: mySink,
  // Drop dev-only dispatches AND ratio-sample the rest at 10%.
  sampler: (record) =>
    !record.commandId.startsWith('app.dev.') && Math.random() < 0.1,
  // Strip secrets from `params` before any sink sees them.
  redact: (record) => ({
    ...record,
    params: stripSecrets(record.params),
  }),
});
```

Order of operations: `sampler` → `redact` → `sink`. A `sampler` returning `false` drops the record before `redact` runs (no point redacting what won't be emitted). Each callback is wrapped in `try`/`catch` — **telemetry never breaks dispatch**: a throwing sink/sampler/redact is swallowed and dispatch returns its `Result<R>` unchanged.

## Composing sinks

There is one built-in sink, deliberately. To fan out to multiple destinations, compose on the user side rather than installing the instrument twice:

```ts
instrumentTelemetry(registry, {
  sink: (r) => {
    consoleSink(r);
    otelSink(r);
    networkBeaconSink(r);
  },
});
```

This is the "translate, don't decide" pattern applied inward: the package doesn't own a sink list, an order, a failure-handling policy across sinks, or a parallel-vs-serial choice — those are host decisions.

## Composition with other instrumenters

`acture-telemetry` follows the same monkey-patch-dispatch pattern as `acture-devtools` (`instrumentRegistry`, `enableTierWarnings`) and `acture-undo`. Multiple instrumenters wrap each other at install time, in install order. **Dispose in reverse install order** — disposing an outer wrapper while inner wrappers still reference its captured dispatch will leave dangling wrappers on the registry.

In practice, instrumenters are installed once at host boot and never disposed, so this rarely matters. Tests that install + dispose between cases should still respect the reverse-order rule.

## Idempotency

Calling `instrumentTelemetry(registry, ...)` twice on the same registry returns the same disposer; the second call's options are ignored. Use sink-level composition (above) instead of repeat installation.

## See also

- [`docs/hand-written-telemetry.md`](../../docs/hand-written-telemetry.md) — the ~30-line agent-written equivalent
- `acture-devtools` — `instrumentRegistry` (dispatch log) and `enableTierWarnings`; same dispatch-wrap pattern
- [`acture-telemetry`](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-telemetry/SKILL.md) consumer skill
