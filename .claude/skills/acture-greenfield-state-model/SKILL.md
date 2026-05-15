---
name: acture-greenfield-state-model
description: The state-model design walkthrough for a greenfield command-dispatch project — deciding what application state EXISTS before authoring any command. Expands Step 1 of the acture-greenfield foundation. Covers the four hard constraints on the state shape (JSON-serializable, typed slices, normalized, stored-vs-derived), the deterministic id-generation pattern, the StateAdapter seam, and what does NOT belong in state. Use when designing or reviewing the state shape of a new acture project. Triggers on "design the state model", "state shape", "what state should the app have", "normalize state", "state slices", "JSON-serializable state", "id generation", "greenfield state".
---

# acture greenfield — designing the state model

This skill expands **Step 1 of the `acture-greenfield` foundation**: before any command exists, decide *what state exists*. The state model is the **noun layer** (`what is there`); commands are the **verb layer** (`what can be done to it`). Authoring commands before the state model is settled produces commands that fight the state shape — design the nouns first.

> **Load `acture-greenfield` first.** That skill owns the four-step greenfield sequence and the dev-tool-first positioning; this skill is the detail of its Step 1.

## The four hard constraints on the state shape

A greenfield acture state model is a typed schema the project owns. These four constraints are not style — each one keeps a later consumer surface (macros, e2e, undo, MCP) from breaking. Honour all four:

### 1. JSON-serializable — `JSON.stringify(state)` must round-trip

No `Set`, `Map`, `Date`, class instances, functions, or DOM handles in state. Why: macros and e2e tests persist state snapshots as JSON; undo diffs serialize patches; MCP/AI surfaces describe state to a model. A non-serializable value silently breaks all of them.
- Use `Record<id, T>` instead of `Map`.
- Use `string[]` of ids instead of `Set`.
- Store an ISO string, not a `Date`.
- The test: `structuredClone(JSON.parse(JSON.stringify(state)))` must equal `state`.

### 2. Typed slices — first-class TS interfaces, not runtime-only shapes

Every slice of state is a named `interface`. The substrate (zustand, RTK, …) is where the state *lives*; the *types* are the project's, written out. This is what lets `execute` handlers, selectors, and the eventual schema bridge all reason about the same shape.

### 3. Normalized — entities keyed by id, references by id

Store entities in a `Record<id, Entity>`; refer to them by id everywhere else. A graph editor stores `nodes: Record<string, NodeRecord>` and `edges: Record<string, EdgeRecord>`, and selection as `selectedNodes: string[]` — *not* nested node objects, *not* duplicated entity copies. Normalization keeps mutations local (a command touches one entity, not a tree) and keeps patches small.

### 4. Stored vs derived — store the minimum, derive the rest

If a value can be computed from other state, do not store it — derive it in a selector or in `execute`. Stored derived data is a second source of truth that drifts. Store `nodes` and `edges`; derive "node count", "is graph connected", "selection bounding box" on read.

## The deterministic id-generation pattern

Entities need stable ids, and id minting must be **deterministic and replay-safe** — a macro or e2e test that replays `addNode` twice must produce the same ids both times. So id generation is *state*, not a side effect:

```ts
interface GraphState {
  nodes: Record<string, NodeRecord>;
  nextNodeNum: number;          // ← the id counter lives IN state
}
// in execute:
const id = `n${draft.nextNodeNum}`;
draft.nextNodeNum += 1;
```

Counter-in-state, incremented inside the `execute` that mints the id. Never `Math.random()`, `Date.now()`, or `crypto.randomUUID()` for entity ids in command handlers — those make replay non-deterministic and break macro/e2e/undo equality.

## The StateAdapter seam

The registry never touches the substrate directly — it talks through a `StateAdapter<S>` (`getState` / `setState` / `subscribe`). Greenfield picks the substrate; the adapter is the seam. This is its own hand-write-vs-install decision (Dimension 2):

- **Hand-write** the ~3-method adapter over whatever the project uses (or over a plain object + listener set).
- **Install a reference adapter** — `acture-state-zustand` (the documented happy path) or `acture-state-redux`.

**Load the `acture-state-adapter` skill** for the interface contract, the `PatchCapableAdapter` extension (patches power `acture-undo`, shipped v1.11), and the reference adapters. The state model (this skill) is *what* the state is; the adapter is *how the registry reaches it*.

## What does NOT belong in state

- **Derived data** — see constraint 4. Compute it.
- **Non-serializable handles** — DOM refs, timers, sockets, class instances. These live in module scope or component scope, not state.
- **Server cache** — remote data is a different layer (react-query, RTK Query, …). State is the *application's own* model. If a command needs server data, it fetches in `execute`.
- **Purely visual ephemera that no command targets** — hover state, a focus ring. *But* be careful: anything a `when`-clause reads, or anything a command mutates, *is* state. Selection is almost always state — it gates `when: 'selection.length == 2'` and is mutated by `app.selection.set`. The test for "is this state": does a command read or write it? If yes, it is state.

## Checklist before you finish

- [ ] Does `JSON.stringify` → `JSON.parse` → `structuredClone` round-trip the whole state?
- [ ] Is every slice a named TS `interface`?
- [ ] Are entities in `Record<id, T>`, referenced by id — not nested or duplicated?
- [ ] Is every derived value derived, not stored?
- [ ] Is every entity-id counter a field *in* state, incremented in `execute` — no `random` / `Date.now` / `uuid` for entity ids?
- [ ] Did you pick the substrate and decide hand-write-vs-install for the `StateAdapter` (load `acture-state-adapter`)?
- [ ] Is everything a command reads (`when`-clauses) or writes actually in the state model?

## See also

- `acture-greenfield` — the foundation; this skill is the detail of its Step 1.
- `acture-greenfield-bootstrap` — the worked end-to-end bootstrap; Step 1's output (`state.ts`) is the first file it produces.
- `acture-state-adapter` — the `StateAdapter<S>` interface, `PatchCapableAdapter`, and the reference adapters.
- `examples/greenfield/graph-editor/src/state.ts` — a worked state model: normalized `Record` entities, counter-in-state id generation, JSON-serializable throughout.
- `docs/research/acture_research_3 -- State-Management Substrate ...md` — the substrate constraints behind the four rules.
