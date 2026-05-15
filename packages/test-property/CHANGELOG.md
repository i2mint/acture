# acture-test-property

## 1.1.0

### Minor Changes

- ccd63d3: Initial release. Property-testing adapter for acture: **fast-check arbitraries over the command registry**, random `CommandSequence`s replayed via `acture-e2e-playwright`'s `replaySequence`, invariants asserted end-of-sequence. On a counter-example the thrown `PropertyTestFailure` carries the (shrunk) failing sequence and the invariant name — replay verbatim through `replaySequence(registry, err.sequence)` for deterministic reproduction.

  Surface: `propertyTest({ registry, adapter, invariants, runs?, sequenceLength?, tiers?, schemaToArbitrary?, ctx?, resetState?, seed? })`, plus `commandArbitrary`, `sequenceArbitrary`, `zodToArbitrary`, `PropertyTestFailure`, `UnsupportedZodTypeError`. Default `runs: 100`, `sequenceLength: { min: 1, max: 10 }`, `tiers: ['stable']`.

  The in-package Zod→arbitrary mapper covers the JSON-Schema-representable subset every other adapter sees (`string`, `number`, `boolean`, `literal`, `enum`, `array`, `object`, `union`, `optional`, `nullable`). Unsupported Zod constructs throw `UnsupportedZodTypeError` with a clear hint — silent skipping would mean a counter-example the user couldn't reproduce. Pass `schemaToArbitrary` to override the mapper.

  State is reset between runs (default: JSON-clone snapshot of `adapter.getState()` at start). A failing dispatch is treated as a property failure with the sequence preserved. Builds _on_ the v1.7 sequence engine — no re-derivation. Hand-written equivalent: `docs/hand-written-test-property.md` (~60 lines). Consumer skill: `acture-test-property`.

  Tested against both `acture-state-zustand` and `acture-state-redux` adapters.
