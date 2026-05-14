# acture-devtools

## 1.1.0

### Minor Changes

- b12aa3b: Core positioning-alignment review: `enableTierWarnings` moves from `acture` core to `acture-devtools`. It is dispatch instrumentation (it wraps `registry.dispatch` to observe it), not a core primitive — structurally identical to `instrumentRegistry`. `acture` core stays the minimal primitive: registry + dispatcher + when-clause DSL + schema bridge + state-adapter interface. Consumers using `enableTierWarnings` should import it from `acture-devtools` instead of `acture`.
