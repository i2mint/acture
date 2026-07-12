# The hand-written assistant runtime — a reproducible reference (orchestration)

**Status:** reference artifact. This document makes acture's dev-tool-first promise
true for the **orchestration** of an app-operating AI assistant: the confirmation
gate for destructive actions, capturing the assistant's dispatch chain as a macro,
and wiring the registry into an agent loop — with **zero `acture-*` dependency**
beyond your chosen AI SDK.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. This doc sits
on top of two others: [`docs/hand-written-registry.md`](hand-written-registry.md)
(the command registry / write side) and
[`docs/hand-written-view-registry.md`](hand-written-view-registry.md) (the view
registry / read side). The evidence base is
[`docs/research/acture_research_11 -- AI Assistant Operating a Command-Dispatch App.md`](research/acture_research_11%20--%20AI%20Assistant%20Operating%20a%20Command-Dispatch%20App.md)
§§5–7.

---

## What acture does NOT ship, and why this is a doc

acture ships **no agent loop** — deliberately. Every serious runtime (Vercel
`ToolLoopAgent`, OpenAI Agents SDK `Runner`, Anthropic Agent SDK, LangGraph) runs
the decision loop server-side, and the loop's `maxSteps`/stop-condition is the
SDK's concern, not acture's (research-11 §5). What acture *owes* its users is not a
runtime but a **bridge**: how the registry + view registry feed the loop, how
destructive dispatch is gated, and how the assistant's actions become undoable,
replayable macros. That bridge is small and stable — so the right delivery is this
reference, which an agent adapts into the target project.

The only pieces here that could plausibly earn a package are the **confirmation
middleware** and the **dispatch-chain capture** (both tiny). The loop itself is your
SDK; the chat UI is your choice (research-11 §11 — reach for assistant-ui,
CopilotKit, or AI Elements). Name those, don't sell them.

---

## Piece 1 — the confirmation gate (human-in-the-loop for destructive dispatch)

The industry converged on one pattern: **model proposes → runtime pauses with
serializable state → UI renders the proposal (viewable/editable) → user
approves/denies/edits → run resumes** (research-11 §6). For a command-dispatch app,
the gate belongs at the **dispatch boundary, driven by declarative command
metadata** — not scattered in UI code. *The model proposes; the registry disposes.*

Declare risk per command as a **convention** (a `sideEffect` class + an explicit
`requiresConfirmation` override) — an external `getRisk(id)` map, so the closed
`CommandRecord` is untouched. Then gate by **wrapping `registry.dispatch`** — the
same reassignment idiom `recordSequence` uses (`docs/hand-written-command-sequence.md`).
acture exposes **no formal middleware type**; `Dispatch` / `Middleware` below are
local aliases for that wrapper shape, not acture exports.

### The trust boundary — read this first

The approval token must be **minted by the runtime *after* a human approves, and
never returned to the model.** If the gate handed a usable token back in the
`confirmation_required` proposal, the model — which reads that tool result — could
lift the token and re-dispatch to **self-approve**, defeating HITL entirely. So the
proposal carries only `{command, params, preview}`; the *runtime* mints the token
out-of-band once the human clicks Approve. Tokens are **one-use** and **bound to the
exact `{command, params}`**, so an approval can't be replayed against different args.

```ts
/* Risk metadata — a CONVENTION keyed by command id (external map or a small
 * lookup), so the closed CommandRecord stays closed. `getRisk` is the app's. */
type SideEffect = 'query' | 'additive' | 'destructive';
interface RiskMeta {
  sideEffect?: SideEffect;
  requiresConfirmation?: boolean;
  preview?: (params: unknown) => unknown; // e.g. read a view: "what will change"
}

/** One-use approval store. `approve` is called by the RUNTIME after a human
 *  approves — NEVER by the model. `consume` is called by the gate on re-dispatch;
 *  a token is valid only for the exact {command, params} it was minted for, and
 *  is deleted on use. */
function createApprovalStore() {
  const issued = new Map<string, string>(); // token → key(command, params)
  const key = (command: string, params: unknown) =>
    `${command} ${JSON.stringify(params ?? null)}`;
  return {
    approve(command: string, params: unknown): string {
      const token = crypto.randomUUID();
      issued.set(token, key(command, params));
      return token;
    },
    consume(token: string, command: string, params: unknown): boolean {
      if (issued.get(token) !== key(command, params)) return false;
      issued.delete(token); // one-use
      return true;
    },
  };
}

// Local aliases — the dispatch-wrapper shape, NOT an acture-exported pipeline.
// Mirror `registry.dispatch`'s real 4-arity: the 4th `options` arg carries the
// `internalToken` for `@internal` commands and MUST be forwarded, or dispatching
// a gated `@internal` command starts failing once the gate is installed.
type Dispatch = (cmd: string, args: unknown, ctx?: any, options?: unknown) => Promise<{ ok: boolean; [k: string]: unknown }>;
type Middleware = (next: Dispatch) => Dispatch;

/** Confirmation is a dispatch-boundary concern, uniform across every AI surface
 *  that labels its channel (see the wiring note below). A risky command from the
 *  assistant WITHOUT a valid one-use token does not execute — it returns a
 *  PROPOSAL as errors-as-data (no token in it). */
function confirmationGate(
  getRisk: (id: string) => RiskMeta,
  approvals: ReturnType<typeof createApprovalStore>,
): Middleware {
  return (next) => async (command, params, ctx, options) => {
    const risk = getRisk(command);
    const needs = risk.requiresConfirmation ?? risk.sideEffect === 'destructive';
    if (!needs || ctx?.channel !== 'assistant') return next(command, params, ctx, options);
    // Approved for THIS exact call? Consume the one-use token and proceed.
    if (ctx?.approvedToken && approvals.consume(ctx.approvedToken, command, params)) {
      return next(command, params, ctx, options);
    }
    // Otherwise propose — errors-as-data, and crucially NO token for the model.
    // `preview` is app code (it reads a view); a throw here must not escape the
    // gate, or the confirmation proposal turns into an exception and breaks
    // errors-as-data. Compute it defensively.
    let preview: unknown;
    try {
      preview = risk.preview?.(params);
    } catch {
      preview = undefined;
    }
    return { ok: false, error: {
      code: 'confirmation_required',
      message: `"${command}" needs your approval before it runs.`,
      details: { command, params, preview },
    }};
  };
}

// Wire it once, like recordSequence — reassign dispatch in place:
const approvals = createApprovalStore();
const original = registry.dispatch.bind(registry);
registry.dispatch = confirmationGate(getRisk, approvals)(original) as typeof registry.dispatch;
```

> **⚠ Load-bearing: the `channel` label IS the trust boundary — set it on every
> AI surface, or the gate silently does nothing.** The gate only fires when
> `ctx.channel === 'assistant'`. That is deliberate — a human clicking a palette
> entry or pressing a hotkey is already the human-in-the-loop and must not be
> asked to re-confirm — but it means a risky command dispatched with the channel
> **unset runs ungated (fail-open)**. The shipped AI projections do **not** set it
> for you: `toAITools(registry)` and `createMcpServer(registry, …)` default
> `context` to `undefined`, so a destructive tool call through either would
> bypass the gate. Thread it explicitly on **every** assistant-driven surface:
>
> ```ts
> const tools  = toAITools(registry, { context: { channel: 'assistant' } });   // Vercel/AI SDK
> const server = createMcpServer(registry, { context: { channel: 'assistant' } }); // MCP
> // frontend loop: registry.dispatch(cmd.id, args, { channel: 'assistant' })
> ```
>
> **Hardening (fail-closed).** Keying the *danger* path on a positive
> `channel === 'assistant'` is fail-open: a forgotten label bypasses confirmation.
> For defense-in-depth, invert it — mark the trusted human surfaces
> (`channel: 'user'`) and gate a risky command *unless* the channel is a trusted
> human one. Then a forgotten label fails **safe** (one extra confirmation), never
> unsafe (a silent destructive run).

The runtime turns `confirmation_required` into a HITL pause — the chat UI renders
`{command, params, preview}` as an approve/deny/edit card (assistant-ui
`respondToApproval`, Vercel `addToolApprovalResponse`, CopilotKit HITL). On the
human's approval — **not the model's** — the runtime mints the token and re-dispatches:

```ts
// RUNTIME-side, after the human clicks Approve (the model never sees this):
const token = approvals.approve(command, params);      // one-use, bound to this call
await registry.dispatch(command, params, { channel: 'assistant', approvedToken: token });
```

Why this shape: the gate stays **schema-validated at the dispatcher** (acture's
existing invariant) and **uniform across every AI surface that labels its
channel** (per the wiring note above — the label is what routes a dispatch onto
the gated path); confirmation is **declarative** (one convention lookup, not
per-action UI); and it reuses
**errors-as-data** as the pause channel, so the same mechanism works on MCP (as
`elicitation` or an `isError` proposal), Vercel, CopilotKit, or this hand-written
loop. The `preview` can call a *view* (`hand-written-view-registry.md`) to show
*what will change* — read-before-you-write made concrete.

> **Convention, not a record field.** `getRisk` is an external map, so this adds
> nothing to the closed `CommandRecord` (the deliberate choice — the alternative,
> `sideEffect`/`requiresConfirmation` as record fields, opens the guarded surface
> and needs the named-need/rule-of-three test). And like macros, this ~40-line gate
> ships as a **pattern**, not a package (hard-don't #2 — no god-package-of-one; no
> natural existing package home). Copy it; own it.

---

## Piece 2 — capture the dispatch chain as a macro (undo / replay)

An assistant turn is a chain of tool calls; each, routed through the registry, is a
`{commandId, params}` pair — **structurally a macro**, the exact shape
`docs/hand-written-command-sequence.md` already defines. *Do not invent a second
format.* Reuse `recordSequence` from that doc to capture the assistant's dispatches:

```ts
import { recordSequence } from './command-sequence'; // the sibling reference

const recording = recordSequence(registry);   // wrap dispatch
await runAssistantTurn(userMessage);           // the model dispatches N commands
recording.stop();
const macro = recording.steps;                 // {commandId, params}[] — save it
```

This yields three capabilities for free (research-11 §7):

- **Undo** — each state mutation via `PatchCapableAdapter.setStateWithPatches`
  yields `{patches, inversePatches}` (the dispatch `Result` carries only `patches?`,
  so capture the adapter's return value, not the dispatch result); undo the whole
  turn by applying the concatenated inverse patches in reverse. One "Undo AI action"
  over an arbitrarily long chain.
- **Replay / macro-ification** — re-dispatch `macro` deterministically ("the
  assistant did a useful 8-step thing; save it as a one-click command").
- **Test fixtures** — `macro` + JSON-serializable state snapshots is a replayable
  e2e test.

**The load-bearing caveat (research-11 §7):** capture the **dispatch chain**, NOT
the LLM reasoning trace. The dispatch chain replays *exactly*; the reasoning trace
does not (LangGraph's own "time travel" re-executes forward nodes, firing fresh
model calls). Save `{commandId, params}[]` as the durable artifact — explicitly not
the transcript. This is precisely the deterministic slice a checkpointer does not
guarantee, and acture's differentiator.

---

## Piece 3 — wire the registry into a loop (two deployment shapes)

The registry is dispatch-agnostic — it runs in Node and in the browser — so both
shapes below keep the loop out of acture. Pick per the app (research-11 §5).

### Backend loop (recommended default)

Registry server-side, projected to MCP tools (`buildToolsList` / the write side) +
MCP resources (`toMcpResources` / the read side). A backend runtime runs the loop;
the browser renders via a chat UI and executes any *frontend* tools.

```ts
// server: build tools (write) + resources + getState tool (read), run the loop.
// NB the `channel: 'assistant'` context — that label is what arms confirmGate
// (see the wiring warning in Piece 1); without it destructive calls run ungated.
const tools = {
  ...toAITools(registry, { context: { channel: 'assistant' } }),
  'app.getState': getStateTool(views),
};
const agent = new ToolLoopAgent({ model, tools, stopWhen: stepCountIs(20) }); // Vercel, e.g.
// the loop dispatches through registry.dispatch (wrapped by confirmGate + recordSequence)
```

Reach-for backend runtimes: **Vercel AI SDK `ToolLoopAgent`** (clean loop, stable
`toolApproval`, `@ai-sdk/mcp` consumes resources) or the **OpenAI Agents SDK**
(`needsApproval` + resumable `RunState`); **LangGraph** for long / durable / audited
runs. All consume acture's MCP projection unchanged.

### Frontend loop (thin apps, no backend agent server)

Registry in the browser (it's constructible outside React by design). An in-app
assistant (CopilotKit / assistant-ui) advertises the registry as frontend tools
whose executors call `registry.dispatch`, and exposes views via the chat layer's
read-side context (`useAssistantContext` / `useCopilotReadable` / AG-UI
`STATE_SNAPSHOT`+`STATE_DELTA`).

```tsx
// Build ONE tools config from the registry (plain data — NOT hooks in a loop,
// which would violate the Rules of Hooks). Register it with your chat layer in a
// single top-level call; the exact registration API is framework-specific.
// `toJsonSchema(cmd)` yields `{ name, description, inputSchema }` — JSON Schema, not
// raw Zod. Hand the SDK a schema you converted, so the wire contract is yours rather
// than whichever Zod->JSON-Schema converter the SDK bundles. (`ai` v4 bundled a
// Zod-v3-only one that silently emitted `{}` for a Zod v4 schema: the model saw a tool
// with no parameters and could not call it.) Note the field is `inputSchema` on AI SDK
// v5+; v4 called it `parameters`.
const tools = registry.list({ tiers: ['stable'] }).map((cmd) => ({
  ...toJsonSchema(cmd),
  handler: (args: unknown) => registry.dispatch(cmd.id, args, { channel: 'assistant' }),
}));
// e.g. assistant-ui / AG-UI: hand `tools` to the runtime; CopilotKit: register each
// with useCopilotAction at the component top level (a fixed list, never in a loop).
```

---

## The through-line

acture needs no runtime, chat UI, or protocol of its own. It projects its command
registry to the write side (shipped) and its state model to the read side
(`hand-written-view-registry.md`), gates destructive dispatch declaratively at the
boundary (Piece 1), captures the deterministic dispatch chain (Piece 2), and hands
the loop and chat UI to the SDK the app already chose (Piece 3). That is the whole
"operate my app" bridge — projection and documentation, not new architecture.

## What this reference deliberately omits

- **A bundled agent loop / retry / planner.** That's the SDK's job; wrapping it
  would re-import the runtime acture deliberately doesn't ship.
- **A confirmation UI component.** The gate returns *data* (`confirmation_required`
  + `{command, params, preview}`); render it with your chat layer's approval
  primitive. Build a component only inside a package, if one ships.
- **An approval policy engine.** `requiresConfirmation` + `sideEffect` covers the
  common case; reach for a policy engine (allow/deny lists, `canUseTool`) only when
  a project needs per-role, per-tool rules (research-11 §6.1).

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- [`docs/hand-written-view-registry.md`](hand-written-view-registry.md) — the read side this consumes (state → the model).
- [`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md) — `recordSequence` / `replaySequence`, reused verbatim for dispatch-chain capture.
- [`docs/hand-written-registry.md`](hand-written-registry.md) — the registry + dispatcher the middleware wraps.
- [`docs/research/acture_research_11 -- AI Assistant Operating a Command-Dispatch App.md`](research/acture_research_11%20--%20AI%20Assistant%20Operating%20a%20Command-Dispatch%20App.md) §§5–7 — loop placement, confirmation, macros.
- `acture-ai-assistant` skill — the consumer skill that walks an agent through all three pieces.
- `acture-ai` / `acture-mcp` skills — the write-side projections this orchestration drives.
