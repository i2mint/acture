# acture-test-property

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md). The agent-written equivalent is [`docs/hand-written-test-property.md`](../../docs/hand-written-test-property.md).

Property-testing adapter for [acture](https://npm.im/acture). **fast-check arbitraries over your command registry**: random `CommandSequence`s replayed via [`acture-e2e-playwright`](https://npm.im/acture-e2e-playwright)'s sequence engine, with invariants asserted end-of-sequence. On a counter-example, the shrunk failing sequence is attached to the thrown error — replay it deterministically.

## Install

```sh
pnpm add -D acture-test-property fast-check
```

`fast-check` is a peer dependency — install whatever version your project pins. `acture-e2e-playwright` is a runtime dependency; install it too if you don't have it already.

## Use

```ts
import { propertyTest } from 'acture-test-property';
import { registry } from './registry';
import { adapter } from './state';

await propertyTest({
  registry,
  adapter,
  invariants: [
    { name: 'count never negative', check: (s) => s.count >= 0 },
    { name: 'selection is a known node', check: (s) => !s.sel || s.nodes[s.sel] },
  ],
  runs: 100,
  sequenceLength: { min: 1, max: 20 },
});
```

`propertyTest` resolves on success. On a counter-example it throws a `PropertyTestFailure` carrying the (shrunk) sequence and the invariant name:

```ts
import { propertyTest, PropertyTestFailure } from 'acture-test-property';
import { replaySequence } from 'acture-e2e-playwright';

try {
  await propertyTest({ /* ... */ });
} catch (e) {
  if (e instanceof PropertyTestFailure) {
    console.log('failing invariant:', e.invariantName);
    console.log('shrunk sequence:', e.sequence);
    // Reproduce deterministically:
    await replaySequence(registry, e.sequence);
  } else {
    throw e;
  }
}
```

## What's generated

```ts
import { commandArbitrary, sequenceArbitrary } from 'acture-test-property';

// One random { commandId, params } pair:
const cmdArb = commandArbitrary(registry, { tiers: ['stable'] });

// A random CommandSequence — exactly the shape replaySequence expects:
const seqArb = sequenceArbitrary(registry, { length: { min: 1, max: 10 } });
```

- `commandArbitrary` picks an id from `registry.list({ tiers })` and generates params from that command's Zod schema.
- `sequenceArbitrary` is `fc.array(commandArbitrary, ...)` with the configured length bounds.
- Both accept a `schemaToArbitrary` override if you need to extend the supported Zod subset.

## The Zod subset

The in-package mapper covers what acture's `toJsonSchema` projection already serializes — the JSON-Schema-representable subset:

| Zod | Arbitrary |
| --- | --- |
| `z.string()` | `fc.string()` |
| `z.number()` | `fc.double({ noNaN: true, noDefaultInfinity: true })` |
| `z.boolean()` | `fc.boolean()` |
| `z.literal(v)` | `fc.constant(v)` |
| `z.enum([a, b, c])` | `fc.constantFrom(a, b, c)` |
| `z.array(T)` | `fc.array(T)` (length ≤ 5) |
| `z.object({ ... })` | `fc.record({ ... })` |
| `z.union([A, B])` | `fc.oneof(A, B)` |
| `z.optional(T)` | `fc.option(T, { nil: undefined })` |
| `z.nullable(T)` | `fc.option(T, { nil: null })` |

Any other Zod construct (`z.date`, `z.lazy`, `z.intersection`, `z.refine`, …) throws `UnsupportedZodTypeError` with a clear message. Two ways forward:

1. Constrain the command's schema to the supported subset (matches what every other adapter — palette, MCP, AI — sees anyway).
2. Pass a custom `schemaToArbitrary` to extend the mapping.

Silent skipping would mean a "valid" failing sequence the user couldn't reproduce — the loud throw is deliberate.

## Invariants run end-of-sequence

`propertyTest` replays the whole generated sequence and then runs every invariant against `adapter.getState()`. End-of-sequence is the simpler contract: each invariant sees the same final state once, the replay engine's `stopOnError` rule still applies, and the shape matches `replayTest`'s pattern. Per-step invariants are a future option if a concrete need surfaces — right now, write a coarser invariant or a shorter sequence.

A failing **dispatch** is treated as a property failure too (the user's invariants assume the sequence ran to completion). The thrown error carries the sequence with the failing step preserved.

## State reset between runs

`propertyTest` snapshots `adapter.getState()` at start and resets to that snapshot before every generated sequence (default: `JSON.parse(JSON.stringify(...))`). Pass a custom `resetState` if your adapter needs richer recreation:

```ts
await propertyTest({
  registry,
  adapter,
  invariants,
  resetState: () => adapter.setState(() => freshInitialState()),
});
```

## What this package deliberately does NOT do

YAGNI applied per increment. Each of these would be its own future package if real demand surfaces:

- **A Vitest / Jest matcher** (`expect.toPassProperty(...)`). The thrown `PropertyTestFailure` is already a perfectly good test failure; runners catch and format it.
- **An HTML report.** fast-check already produces a structured counter-example; format it however the host runner formats failures.
- **A CI integration.** It's a function call; run it in whatever test job already runs.
- **Per-step invariant checking.** Pick coarser invariants or shorter sequences.

Per the "translate, don't decide" hard-don't (#3): the package projects the registry into fast-check; everything downstream is the user's choice.

## See also

- [`docs/hand-written-test-property.md`](../../docs/hand-written-test-property.md) — the agent-written equivalent (~60 lines).
- [`acture-e2e-playwright`](../e2e-playwright/) — the sequence engine `propertyTest` builds on.
- [`docs/hand-written-command-sequence.md`](../../docs/hand-written-command-sequence.md) — the sequence engine reference.
- [`docs/positioning.md`](../../docs/positioning.md) — canonical positioning.
- [`acture-test-property`](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-test-property/SKILL.md) consumer skill.
