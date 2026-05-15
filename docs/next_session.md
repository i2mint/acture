# Next Session — v1.11: `acture-telemetry` + `acture-undo`

**Your role:** ship two new acture packages. The scope is **settled** by the
user: this session adds `acture-telemetry` and `acture-undo` to the v1.x
suite. Order: telemetry first (smaller, simpler), then undo (larger, builds
on patterns the telemetry pass establishes).

This is **not** a "settle Step 1" session — Step 1 is decided. You are
implementing.

## Step 0 — Orient

Read, in this order:

1. `docs/positioning.md` — **canonical.** Dev-tool-first; the two flexibility
   dimensions. Each new `acture-*` package must keep both open.
2. `docs/redesign_takeaways.md` §6 — the canonical statement on how acture
   maintainers should think about scope. **Note especially:** the "rule of
   three" is for acture *users* deciding when to formalize a command in their
   own app — it is *not* a meta-rule for acture maintainers, and should not
   gate acture's own packages or features. The principles that govern what
   acture ships are YAGNI / wait for a concrete need, hard-don't #2 (no
   god-package), architecture-astronaut avoidance, and the dev-tool-first
   principle.
3. `docs/roadmap.md` — "Status snapshot", the v1.10 "Done" entry, and the
   "Post-v1" section's entries for `acture-telemetry` and `acture-undo`. Both
   have type-system reservations already in place (`Result<R>` carries
   `patches?` and `effects?`; `PatchCapableAdapter` is implemented by both
   state adapters).
4. `docs/v1_10-reflection.md` — what just shipped.
5. `.claude/skills/acture-architecture-primer/SKILL.md` and
   `.claude/skills/acture-hard-donts/SKILL.md` — load before any non-trivial
   change. Hard-don't #2 (no god-package) and #3 (adapters translate, don't
   decide) are the load-bearing constraints for both new packages.
6. `.claude/skills/acture-consumer-integration/SKILL.md` — telemetry and undo
   are *consumer surfaces*; the standing rule applies.
7. **For telemetry specifically:** examine `packages/devtools/src/` —
   `instrumentRegistry` is `acture-devtools`'s monkey-patch-dispatch
   instrument. v1.6's reflection observed that `enableTierWarnings` was
   "structurally identical to `acture-devtools`'s `instrumentRegistry`."
   Telemetry is another specialization of the same pattern. Reuse the
   dispatch-instrument hook acture-devtools already exposes; do not invent a
   parallel one.
8. **For undo specifically:** examine `packages/state-zustand/src/` and
   `packages/state-redux/src/` — both implement `PatchCapableAdapter`
   (`supportsPatches: true`, `setStateWithPatches`, `applyPatches`). Undo
   *consumes* that capability; do not duplicate it.

## Step 1 — Shape the two packages with the user before building

Each package has one or two scope decisions that benefit from a short
conversation with the user before code is written. They are not gates;
they are choices that lock in the shape, and surfacing them early avoids
churn.

For each item, use `AskUserQuestion` to settle:

### `acture-telemetry`

- **Redaction model.** Pass-through `redact(record) => record` callback, or a
  declarative `redact: { params: ['email', 'token'] }` config? The first is
  more flexible and zero acture decision; the second is more ergonomic for
  the common case but acture decides the key-deletion semantics.
- **Sampler shape.** A function `(record) => boolean`, a fraction `0.1`, or
  both? Same trade-off — flexibility vs. ergonomics.

### `acture-undo`

- **The effect-semantics call.** `Result<R>.effects?` is type-reserved.
  When undo rewinds a patch, *effects must not be re-applied* (sending an
  email on the original dispatch shouldn't unsend on undo). Surface to the
  user: (a) host supplies an `onEffect(effect, { isUndo })` callback and
  decides per-effect; (b) effects are typed by an enum the host extends.
  Both are valid; pick before locking in.
- **Transaction failure semantics.** If `transaction(() => { a; b; c; })`
  fails mid-way, do the partial dispatches stay applied (the simpler, more
  predictable choice — matches today's dispatch semantics) or does the
  transaction auto-rewind on failure (more "atomic" feeling)? Surface, pick.

If the user has stated preferences for any of these, follow them; otherwise
ask. Record what was settled in the package README so a future reader
understands the shape.

## Step 2 — Build, in order

### Item 1 (smaller, first) — `acture-telemetry`

A middleware-style package that observes every `dispatch` and forwards
structured records to a configurable sink. Shape (adjust per the
hard-don'ts review and the Step 1 decisions):

- **Surface:** `instrumentTelemetry(registry, { sink, redact?, sampler? })`
  → disposer. Built on top of `acture-devtools`'s `instrumentRegistry` (or a
  shared hook in core if it cleanly belongs there) — do not duplicate the
  monkey-patch-dispatch mechanism.
- **Sink:** a function `(record: TelemetryRecord) => void`. Hand-written
  sinks are first-class — `console.log`, a structured logger, an
  OpenTelemetry exporter, a network beacon. The package ships **one**
  built-in sink (likely `consoleSink`) as a reference; an OTel sink or any
  other tool-bound binding is not in scope for this increment — those are
  separate accelerators that can come later if a real need surfaces.
- **Record shape:** `{ commandId, params, result, durationMs, ts, ctx }` —
  closed and minimal. `result` is the full `Result<R>` (errors-as-data
  preserved); `params` may be redacted via the optional `redact` callback.
- **What it does NOT do:** no business logic, no decisions about which
  commands to log (the registry's `list({ tiers })` is the projection — the
  caller passes filtered ids if they want a subset), no per-surface trust
  fast-path (every dispatch is logged regardless of caller). Hard-don't #3
  applies inward.
- **Reference doc:** `docs/hand-written-telemetry.md` — the ~30-line
  agent-written equivalent (wrap `dispatch`, call sink, restore on dispose).
  Mirrors `docs/hand-written-registry.md` and
  `docs/hand-written-command-sequence.md`. Makes the dev-tool-first promise
  *true in the code*.
- **Consumer skill:** `acture-telemetry` consumer skill (mirrors `acture-mcp`
  / `acture-ai` structure). Surfaces both the hand-written path and the
  package-reuse path; names the realistic sink-library choices as the
  user's.

`minor` changeset on the new package at `1.0.0` debut. Update
`acture-architecture-primer`'s consumer-surface list (#5 currently says
"post-v1") to reference the shipped artifacts.

### Item 2 (larger, second) — `acture-undo`

Patch-based undo, transactions, effect queue. Builds on
`PatchCapableAdapter` (zustand + redux already implement it; do not
duplicate). Shape (adjust per the hard-don'ts review and the Step 1
decisions):

- **Surface:** `createUndoHistory(adapter: PatchCapableAdapter<S>, options?)`
  → `{ undo, redo, canUndo, canRedo, clear, transaction, dispose }`.
- **The dispatch hook:** undo records the `patches` field off `Result<R>`
  for every dispatch that returns one — i.e., the registry's `dispatch` is
  wrapped via the same `instrumentRegistry` hook telemetry uses. **This is
  the central reuse:** both packages instrument dispatch; telemetry observes,
  undo records. If `instrumentRegistry` is currently a single-instrument hook
  (i.e., installing two instruments tramples), extending it to a chain is
  the one small core change the increment may need. Verify before designing
  around it; if the core change is non-trivial, escalate.
- **Transactions:** `transaction(() => { dispatch(...); dispatch(...); })`
  groups N dispatches into one undo unit. Atomic at the undo boundary; the
  *failure-mid-transaction* semantics are settled with the user in Step 1.
- **Effects:** `Result<R>.effects?` is already reserved on the type. The
  effect-handling shape (host callback vs. typed enum) is settled with the
  user in Step 1. `acture-undo` itself does not enact effects (hard-don't
  #3).
- **What it does NOT do:** no remote-state undo, no operational-transform /
  CRDT merge, no time-travel UI. Linear `undo`/`redo` stack covers the
  overwhelming majority of cases.
- **Reference doc:** `docs/hand-written-undo.md` — the ~80-line agent-written
  equivalent (record patches array, `setStateWithPatches` on apply, inverse
  patches on undo). Same reproducibility commitment as registry / sequence /
  telemetry.
- **Consumer skill:** `acture-undo` consumer skill (mirrors the pattern).

`minor` changeset on the new package at `1.0.0` debut. Update
`acture-architecture-primer`'s consumer-surface list (#6 currently says
"post-v1") to reference the shipped artifacts.

### One-shot vs. split

If both items in one increment is too much, split into **v1.11 (telemetry)**
+ **v1.12 (undo)**. The reference docs and the consumer skills are not
optional; a half-shipped item that drops them violates the dev-tool-first
positioning. If you must split, do it at the v1.11/v1.12 boundary, not
mid-item.

## Step 3 — Wrap up (per increment if split, or combined if shipped together)

- `pnpm -r build && pnpm -r test && pnpm -r typecheck` green across the
  workspace; example apps still build + pass.
- Changesets: `minor` for each new package. If extending `acture` core or
  `acture-devtools` (for the instrument-hook chain), `minor` on those too.
- Update `docs/roadmap.md`:
  - Move `acture-telemetry` and `acture-undo` from "Post-v1" to a v1.11 Done
    entry.
  - Record the shape decisions surfaced in Step 1.
  - Update the tracking table.
- Write a short reflection (`docs/v1_11-reflection.md`, or
  `docs/v1_11-reflection.md` + `docs/v1_12-reflection.md` if split).
- Replace this file with the next handoff.

## What to escalate to the user mid-flight

1. **The `instrumentRegistry` hook-chain question.** If `acture-devtools`'s
   `instrumentRegistry` is single-shot (installing a second instrument breaks
   the first), the increment touches `acture-devtools` (or core). Confirm
   that's acceptable before changing it; it's the one place the increment
   may *grow* a primitive rather than just consume one.
2. **A Step 1 shape decision the user didn't pre-resolve.** Don't lock in
   silently.
3. **Anything that smells like hard-don't drift.** A god-package temptation,
   business logic creeping into the adapter, React leaking into the core
   surface, etc.

## Hard constraints (re-state of the standing rules — they bind for v1.11)

- **Hard-don't #2: no god-package.** Each new package is *one* accelerator.
  Telemetry has *one* built-in sink (console); undo has *one* shape (linear
  patch stack). Other sinks / other undo flavours wait for new packages and
  a real named need.
- **Hard-don't #3: adapters translate, don't decide.** Telemetry observes;
  undo records. Neither decides what to log, what to undo, or what an effect
  *means*.
- **Hard-don't #6: no React in core, no React in core-instrument code.**
  Both new packages are plain TS. React hooks (`useUndo`, `useTelemetry`)
  live in a separate `./react` entry point with React as an *optional* peer
  (mirror `acture-hotkeys/react`).
- **The dev-tool-first principle:** each package gets a
  `docs/hand-written-*.md` reference doc that lets a developer get the same
  value with zero `acture-*` dependency. Non-negotiable.

## Publishing state

16 packages in the workspace. **15 published on npm** (latest publishes
2026-05-15: `acture-codemods@1.2.0`, `eslint-plugin-acture-migration@1.1.0`,
`acture-mcp-server@1.0.1`). `acture-e2e-playwright` still ships with the
next release.

No pending changesets right now. Two new packages this increment will
produce two new `minor` changesets (`acture-telemetry` and `acture-undo` at
debut, each at `1.0.0`).

## When unsure

Re-read `docs/positioning.md`, `docs/redesign_takeaways.md` §6, and
`docs/roadmap.md`. If a change is irreversible or you cannot tell whether it
honours the positioning, append to `docs/escalations.md` and ask the user.

**Good luck.** v1.11 is the suite's first post-v1 promotion. Single
accelerators, translate not decide, the agent-written path documented in
`docs/hand-written-*.md`, the hard-don'ts intact.
