# The hand-written view registry — a reproducible reference (the read side)

**Status:** reference artifact. This document makes acture's dev-tool-first
promise true for the **read side** of an AI assistant: exposing the app's
*current state* to a model so it can decide what to do — with **zero `acture-*`
dependency**, by hand-writing the ~60-line layer below.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. This doc is
the **read-side dual** of [`docs/hand-written-registry.md`](hand-written-registry.md):
that one makes the *command registry* (actions / the write side) reproducible; this
one makes the *view registry* (state projection / the read side) reproducible. The
evidence base is
[`docs/research/acture_research_11 -- AI Assistant Operating a Command-Dispatch App.md`](research/acture_research_11%20--%20AI%20Assistant%20Operating%20a%20Command-Dispatch%20App.md)
§3. The orchestration that consumes it — the agent loop, confirmation, capture — is
[`docs/hand-written-assistant-runtime.md`](hand-written-assistant-runtime.md).

---

## Why this exists — the read side is an industry-wide gap

research-11's central finding: across CopilotKit, Vercel AI SDK, OpenAI/Anthropic
Agents SDKs, LangGraph, and the rest, **none ships a first-class, typed channel for
exposing an app's *current state* to the model.** An assistant can *act* (tool
calling — acture's write side, already shipped) but has no principled way to *see*
what's on screen, what's selected, what mode the app is in. acture is unusually
placed to close this because its state adapter already exposes `getState()` /
`subscribe()` and (via `PatchCapableAdapter`) emits **RFC-6902-*compatible* JSON
Patches** (the Immer-subset shape — `path` is a segment array, not a JSON-Pointer
string), near-identical to what AG-UI's `STATE_DELTA` and MCP resource-updates use —
a trivial `path`→pointer transform away.

A **view** is the read-side dual of a command: where a `CommandRecord` is a named,
described, tier-tagged *action*, a `ViewRecord` is a named, described, tier-tagged,
sensitivity-scoped **selector over state**. One `ViewRegistry` projects to three
read channels exactly as the schema bridge projects one command to palette / AI /
MCP.

---

## The minimal view-registry layer

Complete. Copy into the target project (e.g. `src/view-registry.ts`), adapt names,
delete what you don't need. It depends only on the state-adapter shape
(`getState` / `subscribe`) — nothing imported from acture.

```ts
/* ── The view shape ─────────────────────────────────────────────────── */

type Tier = 'stable' | 'experimental' | 'internal' | 'deprecated'; // matches acture core

/** The read-side dual of a CommandRecord: a named selector over state. */
export interface ViewRecord<S = unknown, T = unknown> {
  /** URI-friendly id, e.g. 'app.selection'. */
  readonly id: string;
  /** Model-facing: what this view means and when to read it. */
  readonly description: string;
  /** Pure selector over the current state. Keep it NARROW — a slice,
   *  not the whole tree (token budget, research-11 §3.2). */
  readonly select: (state: S) => T;
  /** Default 'stable'. 'internal' is NEVER projected to any surface. */
  readonly tier?: Tier;
  /** Read-side leakage control. 'secret' is never projected; 'redacted'
   *  passes through the registry's redactor. Default 'public'. */
  readonly sensitivity?: 'public' | 'redacted' | 'secret';
}

/* ── Minimal state-adapter shape this layer needs ───────────────────── */

interface StateSource<S> {
  getState(): S;
  // acture's StateAdapter passes (state, previous); a bare () => void listener
  // is assignable here (extra params are ignored). Returns unsubscribe.
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

/* ── The registry: register, list (tier-filtered), read ─────────────── */

export interface ViewRegistry<S> {
  register(view: ViewRecord<S>): void;
  /** Tier-filtered listing. Default: stable only. 'internal' never listed. */
  list(opts?: { tiers?: readonly Tier[] | 'all' }): ViewRecord<S>[];
  /** Read one view's current value, applying the sensitivity policy. */
  read(id: string): unknown;
  /** Subscribe to state changes (for pushing resource-update notifications). */
  onStateChanged(listener: () => void): () => void;
}

export function createViewRegistry<S>(
  source: StateSource<S>,
  redact: (value: unknown) => unknown = (v) => v,
): ViewRegistry<S> {
  const views = new Map<string, ViewRecord<S>>();
  return {
    register(view) {
      views.set(view.id, view);
    },
    list({ tiers = ['stable'] } = {}) {
      const allow = (t: Tier) =>
        t !== 'internal' && (tiers === 'all' || tiers.includes(t));
      return [...views.values()].filter((v) => allow(v.tier ?? 'stable'));
    },
    read(id) {
      const v = views.get(id);
      if (!v || (v.tier ?? 'stable') === 'internal') return undefined;
      if (v.sensitivity === 'secret') return undefined;
      const value = v.select(source.getState());
      return v.sensitivity === 'redacted' ? redact(value) : value;
    },
    onStateChanged: source.subscribe,
  };
}
```

That's the whole read-side primitive. ~60 lines, zero dependencies, owned by the
project. Registering a view is symmetric to registering a command:

```ts
const views = createViewRegistry(adapter);
views.register({
  id: 'app.selection',
  description: 'IDs and kinds of the currently selected nodes.',
  select: (s) => s.selection.map((id) => ({ id, kind: s.nodes[id].kind })),
  tier: 'stable',
  sensitivity: 'public',
});
```

---

## Projecting the view registry to the three read channels

The recommendation is **both MCP resources and a `getState` tool** — the spec says
resources, host reality (Cursor and many IDE clients are tools-only) says tools
(research-11 §3.2). Both project from the *same* `ViewRegistry`, so they never
drift.

### (a) MCP resources — the correct, app-driven representation

```ts
/** Views → MCP resource descriptors. Pair with a resources/read handler
 *  that returns JSON.stringify(views.read(id)), and declare
 *  resources.subscribe:true so state changes push notifications. */
export function toMcpResources<S>(views: ViewRegistry<S>) {
  return views.list().map((v) => ({
    uri: `app://state/${v.id}`,
    name: v.id,
    description: v.description,
    mimeType: 'application/json',
  }));
}

// Liveness: wire the state subscription to resource-update notifications.
// views.onStateChanged(() => server.notifyResourcesUpdated());  // per-URI ideally
```

Use RFC-6570 URI templates for parameterized views (`app://state/node/{id}`).
Resources are **application-driven**: the app decides what enters context.

### (b) A universal read-only `getState` tool — the portable hedge

```ts
/** One tool the model can always call, on any host. readOnlyHint lets
 *  well-behaved hosts auto-approve without friction. Routes through the
 *  same registry — no second source of truth. */
export function getStateTool<S>(views: ViewRegistry<S>) {
  const ids = views.list().map((v) => v.id);
  return {
    name: 'app.getState',
    description: `Read current app state. view ∈ {${ids.join(', ')}}`,
    inputSchema: { type: 'object', properties: { view: { enum: ids } }, required: ['view'] },
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: (args: { view: string }) => views.read(args.view),
  };
}
```

### (c) AG-UI state bridge — for an in-app assistant (optional)

If the app runs an in-app assistant over AG-UI / CopilotKit / assistant-ui, wire the
adapter's initial `getState()` into `STATE_SNAPSHOT` and — if the adapter is
`PatchCapableAdapter` — map its **RFC-6902-*compatible* patches** into `STATE_DELTA`
with a **trivial `path`-segments→JSON-Pointer transform** (acture's `path` is an
array; AG-UI's is a string pointer). Live, structured, delta-based sync from one
small adapter over the patches you already emit.

---

## Why each piece is shaped this way

- **A view is a pure selector, not a stored copy.** State stays single-sourced in
  the adapter; a view is a *projection*, computed on read. Same discipline as a
  command being a dispatch, not a stored result.
- **Tier + sensitivity gate leakage at the source.** `internal` and `secret` views
  are never projected — mirroring how `internal` *commands* are unconditionally
  filtered from every write-side surface. The model cannot see what the registry
  won't list. `redacted` passes through one documented redactor.
- **Narrow-by-design selectors are the token-budget answer.** A view returns a
  slice, not the tree. Combined with the just-in-time pull of the `getState` tool
  and MCP resource `priority` annotations, this keeps state out of the context
  window until it's needed and small when it lands.
- **Both resources and a tool, from one registry.** Resources are semantically
  correct and app-driven but under-supported by hosts; the tool is universal but
  model-controlled. Shipping both from one `ViewRegistry` gives the correct answer
  where hosts support it and the portable answer everywhere else — with no drift.
- **Liveness reuses the subscription you already have.** `onStateChanged` is the
  adapter's `subscribe`; on capable hosts it drives `resources/updated`. No polling.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears:

- **Parameterized-view argument validation.** `app://state/node/{id}` templates can
  carry a Zod schema like a command's params; add it when a view actually takes
  arguments the model could get wrong.
- **A history / time-travel read.** Views read *current* state. Exposing past states
  is a distinct feature — wire it to the undo layer's patch history if a concrete
  need appears.
- **Per-view caching / memoized selectors.** Selectors are cheap and state is
  single-sourced; memoize only if profiling shows a hot view.
- **A second wire format.** Don't invent a bespoke state-sync protocol — MCP
  resources + AG-UI `STATE_DELTA` (canonical RFC-6902; `PatchCapableAdapter` emits
  the compatible Immer-subset form — a trivial `path`→pointer transform away) cover
  external and in-app assistants respectively.

---

## Faithfulness note

The shapes here — `ViewRecord`, `ViewRegistry`, `createViewRegistry`,
`toMcpResources`, `getStateTool` — are deliberately the shapes an acture read-side
projection would export (symmetric to `toAITools` / `buildToolsList` on the write
side). An agent that hand-writes from this doc and later installs such a helper
finds the migration mechanical. If a package ships and its contract changes, this
doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- [`docs/hand-written-registry.md`](hand-written-registry.md) — the write-side dual (command registry + dispatcher) this mirrors.
- [`docs/hand-written-assistant-runtime.md`](hand-written-assistant-runtime.md) — the orchestration (loop, confirmation, capture) that consumes this read side.
- [`docs/research/acture_research_11 -- AI Assistant Operating a Command-Dispatch App.md`](research/acture_research_11%20--%20AI%20Assistant%20Operating%20a%20Command-Dispatch%20App.md) §3 — the evidence base (four read-side patterns, MCP resources-vs-tools).
- `acture-ai-assistant` skill — walks an agent through building an app-operating assistant using this reference.
- `acture-mcp` skill — the write-side MCP projection this sits beside; resources join its tools.
