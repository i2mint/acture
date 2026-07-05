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

Declare risk on the command (a `sideEffect` class and an explicit
`requiresConfirmation` override), then gate as dispatch middleware:

```ts
/* Command metadata (convention over the record, or record fields if you
 * choose to open the closed surface — see the skill for that decision). */
type SideEffect = 'query' | 'additive' | 'destructive';
interface RiskMeta { sideEffect?: SideEffect; requiresConfirmation?: boolean }

/** Confirmation is a dispatch-boundary concern, uniform across surfaces.
 *  When a risky command arrives from an assistant WITHOUT an approval
 *  token, it does not execute — it returns a PROPOSAL as errors-as-data. */
function confirmGate(getRisk: (id: string) => RiskMeta, previewOf?: (id: string, args: unknown) => unknown) {
  return (next: Dispatch): Dispatch => async (cmd, args, ctx) => {
    const risk = getRisk(cmd);
    const needs = risk.requiresConfirmation ?? risk.sideEffect === 'destructive';
    if (needs && ctx?.channel === 'assistant' && !ctx?.approvedToken) {
      return { ok: false, error: {
        code: 'confirmation_required',
        message: `"${cmd}" is destructive and needs approval.`,
        details: { command: cmd, params: args, preview: previewOf?.(cmd, args) },
      }};
    }
    return next(cmd, args, ctx);   // approved (or non-risky) → dispatch
  };
}
```

The runtime turns `confirmation_required` into a HITL pause — the chat UI renders
`{command, params, preview}` as an approve/deny/edit card (assistant-ui
`respondToApproval`, Vercel `addToolApprovalResponse`, CopilotKit HITL). On approve,
re-dispatch with `ctx.approvedToken` — **a one-use token bound to the exact
`{command, params}` hash**, so an approval can't be replayed against different args:

```ts
const token = await hash({ command, params });         // bind to exact call
await registry.dispatch(command, params, { channel: 'assistant', approvedToken: token });
```

Why this shape: the gate stays **caller-independent and schema-validated at the
dispatcher regardless of surface** (acture's existing invariant); confirmation is
**declarative** (one field, not per-action UI); and it reuses **errors-as-data** as
the pause channel, so the same mechanism works on MCP (as `elicitation` or an
`isError` proposal), Vercel, CopilotKit, or this hand-written loop. The `preview`
can call a *view* (`hand-written-view-registry.md`) to show *what will change* —
read-before-you-write made concrete.

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

- **Undo** — every dispatch through a `PatchCapableAdapter` yields
  `{patches, inversePatches}`; undo the whole turn by applying the concatenated
  inverse patches in reverse. One "Undo AI action" over an arbitrarily long chain.
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
// server: build tools (write) + resources + getState tool (read), run the loop
const tools = { ...toAITools(registry), 'app.getState': getStateTool(views) };
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
// each command → a frontend tool; each executor routes through dispatch
for (const cmd of registry.list({ tiers: ['stable'] })) {
  useFrontendTool({
    name: cmd.id, description: cmd.description, parameters: cmd.params,
    handler: (args) => registry.dispatch(cmd.id, args, { channel: 'assistant' }),
  });
}
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
