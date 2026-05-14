# v1.6 reflection — core positioning-alignment review

**Authored:** 2026-05-14 by the v1.6 implementing agent. Increment scope: audit
`packages/core` against `docs/positioning.md`, refactor only what the audit
justifies. All 396 package tests + 41 example tests still green; every package
and example builds + typechecks. `CommandRecord` unchanged (15 fields).

## What the audit found

The review tested two promises the positioning makes about core.

**Import boundary — clean, no change.** Core depends only on `zod` (peer
dependency). Zero React, zero state-library imports — verified across all
eight source files. Hard-don't #6 holds.

**Promise A — core is the minimal primitive — one extraction.** Of the eight
source files, seven are genuinely primitive: `registry.ts` + `command.ts` +
`types.ts` + `result.ts` are the registry/dispatcher; `schema-bridge.ts` and
`state-adapter.ts` are named explicitly in the promise; `when.ts` is a
~500-line hand-rolled DSL parser but is *defensibly* primitive — the
dispatcher must evaluate the closed `when` field, and the string DSL is part
of the documented `CommandRecord` contract. (It also turns out to be a clean
illustration of the package-reuse value proposition: it is exactly the kind of
thing the hand-written path skips and `acture` core gives you for free.)

The outlier was **`tier-warnings.ts`**. `enableTierWarnings` monkey-patches
`registry.dispatch` to emit a `console.warn` on the first dispatch of an
experimental command — idempotent via a `WeakMap`, opt-in, mutates one method.
It is *structurally identical* to `acture-devtools`'s `instrumentRegistry`,
whose own header comment argues that dispatch interception belongs in a
devtools package, not core. It is dispatch *instrumentation* — it observes
dispatch without changing its semantics — and it is none of the four named
primitives. (`@internal` *enforcement*, by contrast, is real dispatch
semantics and correctly stays inside `dispatch`.) **Moved to
`acture-devtools`.** Low blast radius: nothing imported it but docs.

**Promise B — the agent-written path is reproducible — the central gap, now
closed.** The skills taught acture's *design*; `acture-consumer-integration`
documented the hand-written path for *consumers* but explicitly punted on the
core primitive itself. There was no legible, reproducible reference for the
registry primitive — an agent wanting the zero-dependency path would have had
to reverse-engineer ~1000 lines of source. Two new artifacts close this:

- **`docs/hand-written-registry.md`** — a complete, ~80-line, zero-dependency
  registry + dispatcher reference, with the shapes deliberately mirroring
  `packages/core/src/` so a later swap to `acture` core is mechanical. It
  explains *why* each piece is shaped the way it is (errors-as-data, `Map.get`
  routing, validation-for-every-caller) and what it deliberately omits.
- **`acture-greenfield` skill** — the foundational pattern for standing up the
  core primitive in a new project: design the state model, then *decide* —
  hand-write the registry or install `acture` core — as a surfaced,
  per-project choice rather than a default. `acture-architecture-primer` now
  loads it for greenfield tasks.

## Honest notes

- The biggest judgement call was `when.ts`. ~500 lines is a lot of code to
  call "minimal primitive," and one could argue for extracting the DSL parser
  and leaving core with function-only `when`. I kept it because that would
  break core's own `CommandRecord` contract (the `when` field is documented as
  "DSL string OR function") — extracting it would make core unable to honour
  its own type. The hand-written reference resolves the tension a different
  way: it ships function-only `when` and names the DSL as a concrete thing
  `acture` core buys you.
- `tier-warnings` was added in v1.0 (Phase 4) and its own header comment
  already said "Pattern mirrors `acture-devtools` `instrumentRegistry`." The
  positioning review just made explicit what that comment hinted at: if it
  mirrors a devtools pattern, it belongs in devtools.
- This was a small increment by design. The failure mode the handoff warned
  about — "inventing a refactor to look busy" — was a real temptation around
  `when.ts`; resisting it was the right call.

## Test count

396 package tests, unchanged: the 8 `enableTierWarnings` tests moved with the
code (core 97→89, devtools 12→20). 41 example tests unchanged.
