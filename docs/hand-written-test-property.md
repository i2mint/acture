# The hand-written property-test runner — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise *true in the code* for the **property-testing** consumer surface: a
developer can fuzz their command registry with **zero `acture-*` dependency**
by hand-writing the ~60-line layer below.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. Read
[`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md)
too: this doc builds on its `replaySequence`. The sibling
[`docs/hand-written-telemetry.md`](hand-written-telemetry.md) and
[`docs/hand-written-undo.md`](hand-written-undo.md) follow the same pattern.

---

## When to hand-write vs. install `acture-test-property`

| | Hand-write (this doc) | `pnpm add -D acture-test-property` |
| --- | --- | --- |
| Dependency added | one (`fast-check`) | three (`acture-test-property`, `fast-check`, `acture-e2e-playwright`) |
| Code the team owns | ~60 lines, in their repo | the import surface |
| Zod-to-arbitrary mapper | the team writes the subset they use | the published subset, tested |
| Sequence replay | hand-write or import from your own command-sequence module | re-uses `acture-e2e-playwright/replaySequence` |
| Counter-example shrinking | yes (fast-check does it) | yes |
| Maintenance | the team's | acture's |

Hand-writing is the right call when the project already has the
hand-written command-sequence layer in place (per
`docs/hand-written-command-sequence.md`) and wants a small, owned
property-test surface that uses *only* the team's own primitives.
Installing `acture-test-property` is the right call when the team wants
the tested mapper (every Zod node the package supports), the shrinking
glue, and zero re-derivation — at the cost of three install lines and
the dependency it implies. **It is a per-project trade, made
deliberately — never a default.**

The two paths are compatible: the shapes below are deliberately the same
shapes `acture-test-property` exports, so swapping later is mechanical.

---

## The minimal property-test layer

Below is a complete, self-contained property-test runner. Copy it into
the target project (e.g. `src/property-test.ts`), adapt the names, delete
what the project doesn't need. The only dependency is `fast-check`; the
registry / dispatch / replay shapes are the team's own (from
`docs/hand-written-registry.md` and
`docs/hand-written-command-sequence.md`) or `acture`'s.

```ts
import * as fc from 'fast-check';
import type { Registry } from 'acture';                 // or your own type
import { replaySequence } from './command-sequence.js';  // or 'acture-e2e-playwright'
import type { CommandSequence, SequenceStep } from './command-sequence.js';

/* ── Zod → fast-check (subset the project uses) ──────────────────────── */

/** Walk a Zod schema and return a fast-check arbitrary.
 *  Cover only the constructs your commands actually use; throw on the
 *  rest so a failure is loud, not silent. */
function zodToArb(schema: unknown): fc.Arbitrary<unknown> {
  // `_def.type` is Zod 4; `_def.typeName` is Zod 3 ('ZodString', ...).
  const def = (schema as { _def?: { type?: string; typeName?: string } })._def;
  const tag = def?.type ?? def?.typeName?.replace(/^Zod/, '').toLowerCase();
  switch (tag) {
    case 'string':  return fc.string();
    case 'number':  return fc.double({ noNaN: true, noDefaultInfinity: true });
    case 'boolean': return fc.boolean();
    case 'object': {
      const shape = (schema as { shape: Record<string, unknown> }).shape;
      const r: Record<string, fc.Arbitrary<unknown>> = {};
      for (const [k, child] of Object.entries(shape)) r[k] = zodToArb(child);
      return fc.record(r);
    }
    case 'array':
      return fc.array(
        zodToArb((schema as { _def: { element: unknown } })._def.element),
        { maxLength: 5 },
      );
    // Extend with literal / enum / union / optional / nullable as needed.
    default:
      throw new Error(`zodToArb: unsupported Zod type "${tag}"`);
  }
}

/* ── Arbitraries over the registry ───────────────────────────────────── */

/** One random { commandId, params } pair drawn from the registry. */
export function commandArbitrary(registry: Registry): fc.Arbitrary<SequenceStep> {
  const commands = registry.list({ tiers: ['stable'] });
  if (commands.length === 0) throw new Error('no commands to fuzz');
  return fc.constantFrom(...commands).chain((cmd) => {
    if (cmd.params === undefined) return fc.constant({ commandId: cmd.id });
    return zodToArb(cmd.params).map((params) => ({ commandId: cmd.id, params }));
  });
}

/** A random sequence of length in [min, max]. */
export function sequenceArbitrary(
  registry: Registry,
  length = { min: 1, max: 10 },
): fc.Arbitrary<CommandSequence> {
  return fc.array(commandArbitrary(registry), {
    minLength: length.min,
    maxLength: length.max,
  });
}

/* ── The property runner ─────────────────────────────────────────────── */

export interface Invariant<S> {
  readonly name: string;
  readonly check: (state: S) => boolean;
}

export class PropertyTestFailure extends Error {
  override name = 'PropertyTestFailure';
  constructor(
    msg: string,
    public sequence: CommandSequence,
    public invariantName?: string,
  ) { super(msg); }
}

/**
 * Generate `runs` random sequences. Replay each one; after the last
 * step, check every invariant. A failing invariant or a failing
 * dispatch fails the property; fast-check shrinks the sequence; the
 * final shrunk sequence is attached to the thrown error.
 */
export async function propertyTest<S>(opts: {
  registry: Registry;
  getState: () => S;
  resetState: () => void;
  invariants: readonly Invariant<S>[];
  runs?: number;
  length?: { min: number; max: number };
}): Promise<void> {
  const { registry, getState, resetState, invariants, runs = 100, length } = opts;
  let failure: PropertyTestFailure | null = null;

  try {
    await fc.assert(
      fc.asyncProperty(sequenceArbitrary(registry, length), async (sequence) => {
        resetState();
        const replay = await replaySequence(registry, sequence, { stopOnError: false });
        if (!replay.ok) {
          failure = new PropertyTestFailure('dispatch failed', sequence);
          return false;
        }
        const s = getState();
        for (const inv of invariants) {
          if (!inv.check(s)) {
            failure = new PropertyTestFailure(
              `invariant "${inv.name}" violated`, sequence, inv.name,
            );
            return false;
          }
        }
        return true;
      }),
      { numRuns: runs },
    );
  } catch (e) {
    if (failure) throw failure;
    throw e;
  }
}
```

That's the whole consumer layer. Add the Zod cases you need (`literal`,
`enum`, `union`, `optional`, …) when a command's schema needs them — copy
each case verbatim from `packages/test-property/src/arbitraries.ts` if
you want a reference.

---

## Why each piece is shaped this way

- **The arbitrary draws commands from the registry, not from a static
  list.** Adding a command means adding a tested fuzz target — no
  separate test-property registration step. Property tests stay in
  sync with the registry by construction.
- **Invariants run end-of-sequence, not per step.** End-of-sequence is
  the simpler contract; it matches `replayTest`'s pattern; it lets the
  user write coarser, more meaningful invariants ("the graph is still a
  valid DAG"). Per-step is a future option if a concrete need appears.
- **A failing dispatch fails the property.** A counter-example you can't
  even replay-to-completion is useless to the user. Sequences must run;
  invariants then hold.
- **The shrunk sequence is attached to the thrown error.** fast-check's
  shrinking is the whole point — surfacing a 20-step counter-example
  when a 3-step one suffices wastes the user's time. The attached
  `sequence` is replayable verbatim through `replaySequence`.
- **`schemaToArbitrary` is a single function override.** Hard-don't #3:
  translate, don't decide. The package doesn't own a mini-DSL for
  "extend the supported types"; pass a function.
- **Reset state between runs.** Otherwise sequence N's state pollutes
  sequence N+1's invariant, and the counter-example reproducer fails to
  reproduce. The default reset (snapshot + restore via JSON clone) works
  for the JSON-serializable state acture's state model promises.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears:

- **Per-step invariant checking.** End-of-sequence covers the
  overwhelming majority; per-step doubles the contract surface for a
  rare-in-practice need.
- **A Vitest / Jest matcher** (`expect.toPassProperty(...)`). The thrown
  error is already a perfectly good test failure.
- **An HTML report.** fast-check produces a structured counter-example;
  format it the way the host runner formats other failures.
- **Async-only invariants** (`(s) => Promise<boolean>`). Synchronous
  invariants cover state checks; async escapes belong in custom
  assertion steps inside the sequence, not in the invariant list.
- **Stateful model testing** (fast-check's `fc.commands`). The flat
  sequence model is the same shape your e2e tests and macros use;
  introducing a second shape for fuzzing alone is duplication.

---

## Faithfulness note

The shapes here are deliberately the shapes `acture-test-property`
exports — `commandArbitrary`, `sequenceArbitrary`, `propertyTest`,
`PropertyTestFailure`, `Invariant`. An agent that hand-writes from this
doc and later installs the package finds the migration mechanical. If
the package's contract changes, this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- [`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md) — the sequence engine this layer replays through.
- [`docs/hand-written-registry.md`](hand-written-registry.md) — the registry primitive this layer reads commands from.
- `acture-test-property` skill — walks an agent through using this reference vs. installing the package.
- `acture-consumer-integration` skill — the per-consumer hand-write-vs-install choice.
