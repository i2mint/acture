---
"acture": minor
---

New `acture/lite` entry: the same `Registry` and `CommandRecord` for byte-budgeted pages, about 2.9 kB minified instead of about 12 kB. `when` is function-only there (a DSL string is refused at `register` unless an `evaluateWhen` is injected) and `defineCommand` only freezes. The full entry gains `validateCommand(spec)` (the checks `defineCommand` runs, for lite records in tests or dev builds). CJS builds now share chunks, so both entries throw the same error classes. Per-entry size budgets are checked in CI.
