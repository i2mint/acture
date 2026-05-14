---
name: acture-macros
description: Build a macros (record / compose / replay) consumer surface in a target project. A macro is a serializable list of `{commandId, params}` pairs replayed through the registry. Use when a project wants to record user/agent command sequences and replay them — workflows, pipelines, saved actions, AI-composed sequences. There is NO acture-macros package: macros ship as a pattern + skill, hand-written from docs/hand-written-command-sequence.md. Triggers on "macros", "record/replay", "command sequence", "workflow", "pipeline", "saved actions", "replay a sequence", "macro recorder". For e2e testing (a macro with assertions) load acture-e2e instead.
---

# acture macros — record / compose / replay

A **macro** is "a serializable list of `{commandId, params}` pairs" — a persisted command sequence a user or system composes and replays as one unit (journal article §3.7). It is a *consumer surface* of the registry, not a new primitive.

> **Load `acture-consumer-integration` first.** Macros are a consumer — this skill covers macro specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the two dimensions) lives there.

## The one thing to know first: there is no `acture-macros` package

Decided in the v1.7 increment (see `docs/roadmap.md`): macros ship as a **pattern + this skill**, not a package. Reasons:

- The recorder/player is ~60 lines (`docs/hand-written-command-sequence.md`) — the journal calls the macro layer "a thin consumer, not a new primitive."
- The recorder is structurally identical to `acture-devtools`' `instrumentRegistry` — wrap `dispatch`, observe. Nothing novel to package.
- The rule of three: no third concrete *package* caller exists. A package can come later if one does.

So the **agent-written path is the path** for macros. You hand-write the engine into the target project from the reference doc. (The same engine *is* shipped, tested, inside `acture-e2e-playwright` — a project already depending on that package for e2e can import `recordSequence` / `replaySequence` from it rather than re-writing. That is the only "package-reuse" option, and only if the e2e dependency already exists for its own reasons.)

## The build

The canonical reference is **`docs/hand-written-command-sequence.md`** — read it, then adapt it into the target project (e.g. `src/command-sequence.ts`). It gives you:

- `recordSequence(registry)` → `{ steps, stop() }` — wraps `dispatch`, accumulates `{commandId, params}`. Reversible, opt-in. **Never wrap a production registry.**
- `replaySequence(registry, sequence, options?)` → `{ ok, results }` — iterates and dispatches; never throws (errors-as-data); `stopOnError` defaults to `true`.
- Composition is just array concatenation — no API.
- Persistence is `JSON.stringify(steps)` — a sequence is already plain data.

That is a complete macros tool. Adapt names and delete what the project doesn't need.

## Macro specifics — what to get right

- **Recording mutates the registry; recording is reversible.** `recordSequence` swaps `registry.dispatch`. Always pair it with `stop()`. Gate it behind a dev/record-mode flag — a recorder must never run in a normal production session.
- **A macro is plain data.** An array of `{commandId, params}`. Inspectable, diffable, JSON-serializable, AI-authorable. Do not wrap it in a class. Composition happens *above* the registry (journal §3 "Macros as composition, not a third granularity") — the registry stays flat; there is no recursive "macro command" entry type.
- **Replay routes through `dispatch` — never reflective invocation.** A sequence loaded from disk or authored by an AI gets the same `Map.get` + schema validation as any other dispatch. An unknown `commandId` returns `{ ok: false }` and nothing runs. Never `eval` a step. (Hard-don't #5.)
- **`stopOnError` defaults to true.** A macro is a unit — if step 3 fails, step 4 usually shouldn't run against broken state. A best-effort batch can opt out.
- **The AI sequence is the same shape.** When an AI composes a multi-step response, its output *is* a macro (journal §3.2, §3.7). If the project also has an AI surface, the recorded-macro format and the AI-emitted format are one format — do not invent a second one.

## What NOT to build (rule of three — wait for a real caller)

`docs/hand-written-command-sequence.md` §"What this reference deliberately omits" is the authority. In short: no DAG/branching sequences, no parallel replay, no recorder filter option, no schema-version validation of saved macros — until a concrete caller needs it. A linear sequence covers the overwhelming majority of macros.

## Recording the choice

Per `acture-consumer-integration` §Step 4: note in the project's adoption notes that macros were hand-written from the reference doc (the expected path), and where the engine lives. A later session adding e2e may want to share that engine.

## See also

- `docs/hand-written-command-sequence.md` — the canonical reference; the engine you adapt.
- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-e2e` — e2e testing: the same engine plus assertions and a browser adapter.
- `acture-devtools` (`instrumentRegistry`) — the same "wrap dispatch, observe" mechanism the recorder uses.
- `docs/command_dispatch_journal_article.md` §3.7 — the macro-composition framing.
