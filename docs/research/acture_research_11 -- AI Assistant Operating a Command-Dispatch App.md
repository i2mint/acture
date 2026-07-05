# An AI Assistant That *Operates* a Command-Dispatch App — State of the Art & Reference Architecture

**Author:** Thor Whalen
**Date:** July 2026
**Status:** research finding for the brief at `docs/research/acture_research_prompts.md` §11 — drives acture's support for an embedded AI assistant that **operates** the app (reads current state + takes actions), beyond the command→tool bridge acture already ships. **Companion to — not a replacement for —** [`docs/research/ai_assistants 03 -- From Command Dispatch to MCP...md`](ai_assistants%2003%20--%20From%20Command%20Dispatch%20to%20MCP-%20Annotation%20Schemas,%20Multi-Provider%20Tool%20Formats,%20and%20Agent-Friendly%20Design.md), which owns the *write-side*: the command→MCP bridge, multi-provider tool-format normalization, the annotation taxonomy (incl. HITL *annotations* §5.3, permission scoping §5.4, side-effect classification §5.6), and context-overflow / tool-search. This doc owns the four dimensions that report does **not**: the **read side**, the **runtime bridge**, the **confirmation UX**, and the **macro tie-in**. Cross-referenced throughout as *ai_assistants-03*.

---

## 0. Read this first — the recommendation

acture already projects the *command registry* (actions) to two write-side agent surfaces — Vercel AI SDK tools (`toAITools`) and MCP tools (`buildToolsList`/`createMcpServer`) — routing every call through `registry.dispatch`, returning errors-as-data, tier-filtering `internal`, and rewriting `@deprecated` to a banner (`acture-ai`, `acture-mcp` skills). An assistant that *operates* the app needs four things acture does **not** yet provide. The survey's headline is that acture is **structurally closer to a best-in-class "operate my app" substrate than any surveyed framework**, because it already owns the typed state model and typed action registry the frameworks each only half-have — so the remaining work is **projection and documentation, not new architecture**.

1. **Close the read side with a `ViewRegistry` — the read-side dual of the command registry.** A *view* is a named, described, tier-tagged, sensitivity-scoped, typed **selector over state** (the dual of a command's action). Project one `ViewRegistry` to three read channels exactly as the schema bridge projects one command to palette/AI/MCP: **(a)** MCP **resources** (the semantically-correct, app-driven representation), **(b)** a universal read-only **`getState` tool** annotated `readOnlyHint:true` (the portable hedge for tools-only hosts like Cursor), and **(c)** an optional **AG-UI `STATE_SNAPSHOT`/`STATE_DELTA` bridge** that reuses `PatchCapableAdapter`'s RFC-6902 patches for free. **Do both resources and the tool** — the spec says resources, host reality says tools.
2. **Gate destructive dispatch with declarative `requiresConfirmation` middleware at the dispatch boundary** — *not* in UI code. "The model proposes; the **registry** disposes." Confirmation returns a *proposal* as errors-as-data (`code: 'confirmation_required'`, with `{command, params, preview}`), which the runtime turns into the industry-standard *propose → pause → approve/deny/edit → resume* HITL beat. Derive MCP tool `annotations` (`readOnlyHint`/`destructiveHint`) from a `sideEffect` class.
3. **Do not ship a runtime; ship a bridge doc.** Every serious runtime runs the agent loop **server-side**; only rendering/voice is client-side. acture is right to ship no loop. The owed artifact is a worked recipe (`hand-written-assistant-runtime.md`) for the backend-loop and frontend-loop shapes, plus wiring that feeds the *existing* macro/undo layer.
4. **Capture the dispatch chain as a macro — not the reasoning trace.** An assistant turn is structurally `{commandId, params}[]` — acture's existing macro/replay format. This gives undo (concatenated inverse patches), replay (save-as-command), and test fixtures for free. **Load-bearing caveat:** the *dispatch chain* is a deterministic macro; the *LLM reasoning trace* is not (LangGraph's own "time travel" re-executes forward nodes, firing fresh model calls). Capture the deterministic slice.

**Positioning.** Every recommendation is a *projection* or a *doc*, honouring dev-tool-first and the hard-don'ts: the `ViewRegistry` + confirmation middleware are small, translation-only additions (candidates for the state/mcp packages *or* the hand-written reference); the runtime and chat UI stay the app's choice — named, not sold. This single symmetric addition turns acture from "a registry an AI can call" into "a substrate an AI can *operate*."

---

## 1. What acture already has vs. what "operate my app" needs

acture's three primitives are a **state model**, a **command registry**, and a **schema bridge**. It already projects the *registry* (actions) to write-side agent surfaces; both route through `registry.dispatch`, return errors-as-data, tier-filter (`internal` never exposed), and banner `@deprecated` (see `acture-ai`, `acture-mcp`, and ai_assistants-03 §§1–5 for the full write-side treatment).

An assistant that *operates* the app needs four things acture does not yet provide: **(1)** read-side situational awareness of *current state*; **(2)** the runtime (chat UI + agent loop); **(3)** human-in-the-loop confirmation of destructive dispatch; **(4)** recognition that a chain of assistant-emitted commands *is a macro*. The rest of this doc treats each.

The central finding: acture is *structurally closer* to a best-in-class "operate my app" substrate than any surveyed framework, because it already owns the typed state model and typed action registry the frameworks only half-have. The gap is **projection and documentation**.

## 2. Framework × capability comparison

| Framework | State exposure (read-side) | Action exposure (write-side) | Runtime / loop | Human-in-the-loop | Generative UI | MCP support | Where it runs |
|---|---|---|---|---|---|---|---|
| **CopilotKit** (v1→v2) | **First-class**: `useCopilotReadable`/`useAgentContext` → `{description,value}` → injected into **system prompt** [23][24] | `useCopilotAction`/`useFrontendTool` (Zod) | Backend agent via **AG-UI**; runtime in *your* server [25] | `useHumanInTheLoop` (LLM-initiated) + `useInterrupt` (graph-enforced) [16][26] | Six primitives (components-as-tools, MCP Apps…) [27] | **Both**: consume MCP tools + MCP Apps UI [28] | Frontend hooks + your server + backend agent |
| **assistant-ui** | **First-class**: `useAssistantContext` (re-evaluated each read), `makeAssistantVisible` [2] | Frontend tools; `defineToolkit`/`"use generative"` | Runtime abstraction (local / external-store / adapters) | `humanTool()`+`addResult`; `respondToApproval` (AI SDK v6) [29] | Tool UIs = React per tool-part state | Via AI SDK / LangGraph adapters | React client + your backend |
| **Vercel AI SDK v6** | **None** (system prompt/messages/read tools only) [1] | `tool({description,inputSchema,execute})`; `ToolLoopAgent` | **Server** route; multi-step loop default `stepCountIs(20)` | `toolApproval` (call-level) → `addToolApprovalResponse` [30][14] | Tool-part → component; **AI Elements** | **`@ai-sdk/mcp`** stable — tools **+ resources + prompts + elicitation** [31] | Server loop + `useChat` client |
| **AG-UI protocol** | **First-class**: `STATE_SNAPSHOT` + `STATE_DELTA` (**RFC-6902 JSON Patch**) [11] | Frontend tools in `RunAgentInput.tools` | Transport (SSE/WS/webhook) for backend agent → frontend | Frontend-tool confirm *or* shared-state proposal (approve/reject/**edit**) [11][32] | Via consuming client | Sibling protocol (MCP=agent→tool, AG-UI=agent→user) | Backend agent → any AG-UI client |
| **LangGraph (+Platform)** | Graph `State` streamed | Tools as nodes; `Command` merges update+routing | **Backend** state-machine; checkpointer-persisted | `interrupt()` + `Command(resume=…)`; **node re-runs on resume** [15] | agent-chat-ui reference | Consumes MCP | Python/JS backend |
| **OpenAI Agents SDK / Responses** | **None** first-class | `tool` (Zod) + handoffs + guardrails; `Runner` loop | **Backend** `Runner` (client-side only for voice) | `needsApproval` → `interruptions` → `state.approve()`; serializable `RunState` [12] | **ChatKit** widgets; AI Apps SDK | **Native** in Responses (`type:"mcp"`) [33] | Backend (+ browser for voice) |
| **Anthropic (tool use / Agent SDK)** | **None** first-class | `tools:[{name,description,input_schema}]`; client vs server tools | Agent SDK loop; permission engine | **Permission engine**: modes + allow/deny + `canUseTool` [34]; computer-use auto-confirm [35] | (chat-native) | Authored MCP; Messages API connector | Backend / Claude host |
| **MS Agent Framework** (GA) | **Context providers** + session [3] | Tools + MCP; middleware | **Backend**; Agents + graph Workflows | Middleware + Workflow HITL | OpenAI Apps SDK widgets | **Native** (MCP + A2A) | .NET/Python backend |
| **Pydantic AI / Mastra** | **AG-UI shared state** [5] | Typed tools; `DeferredToolRequests` / graph workflows | **Backend** loop | `requires_approval` / durable `suspend()/resume()` (pause indefinitely) [17] | Via AG-UI client | Consume + emit | Python / Node backend |
| **Thesys C1** | **None** (rendering only) | (via your tool-calling) | Your backend → C1 UI DSL | (app-level) | **UI-in-chat** (LLM returns UI DSL) [38] | n/a | Backend + React SDK |
| **MCP (protocol)** | **Resources** (app-driven, `subscribe`/`updated`) + `getState` tool workaround [6][9] | **Tools** (model-controlled) | n/a (transport) | Spec: "**SHOULD** always be a human in the loop"; `elicitation` [7][8] | MCP Apps (RC) | — | stdio / Streamable HTTP |

Two structural reads matter for acture. **(1)** The read-side column is mostly empty — the only "First-class" cells (AG-UI, assistant-ui, CopilotKit-on-AG-UI) all converge on the *same* mechanism acture already implements internally: a subscribable store that emits JSON-Patch deltas. **(2)** The runtime / where-it-runs columns all say "backend, your server" — validating acture's decision to ship no loop, and telling us the bridge acture owes is "here is how your registry + state model feed a backend agent loop and a chat UI."

## 3. State exposure (the read side) — the core gap

### 3.1 Four patterns, and their trade-offs

- **(a) System-prompt / message snapshot injection** — serialize state into the prompt each turn (what CopilotKit readable ultimately does [23][24]). *Universal, zero round-trips;* but **token budget** (a large tree blows context — CopilotKit ships no truncation guidance), **freshness** (stale the instant the user acts unless re-sent), **leakage** (everything injected is model-visible).
- **(b) MCP resources** — `resources/read` + `resources/subscribe` liveness. *Semantically correct* (resources are **application-driven**: the app decides what enters context [6]); push-based liveness via `notifications/resources/updated`. *But* resources are the **least-supported** primitive — Cursor and many IDE clients are tools-only; "unless the client proactively injects resources… the LLM never sees them" [9][10].
- **(c) A read-only `getState` tool ("context as tools")** — the model pulls state just-in-time. *Works on every host;* `readOnlyHint:true` lets hosts auto-approve without friction [7][19]. *But* model-controlled — it decides *when* to look and may forget.
- **(d) AG-UI / assistant-ui shared state** — a subscribable state object synced via `STATE_SNAPSHOT`/`STATE_DELTA` (RFC-6902) [11] or `useAssistantContext` [2]. *The only patterns that are both live and structured;* but framework/protocol coupling.

### 3.2 Recommendation — one `ViewRegistry`, three projections

acture's state model is the ideal source: `StateAdapter<S>` gives `getState()`/`subscribe()`, and `PatchCapableAdapter` emits **RFC-6902 patches** — *the same wire format* AG-UI uses for `STATE_DELTA` and MCP uses conceptually for resource updates. Define **one read-side projection primitive** — a *view* (the read-side dual of a command) — and project it to all three read channels.

```ts
// Read-side dual of a CommandRecord — lives beside the registry.
interface ViewRecord<S, T> {
  id: string;                      // 'app.selection'  (URI-friendly)
  description: string;             // model-facing: what this view means
  select: (state: S) => T;         // pure selector over the state model
  schema?: StandardSchemaV1<T>;    // optional output schema (Zod) → JSON Schema
  tier?: Tier;                     // stable | experimental | internal
  sensitivity?: 'public' | 'redacted' | 'secret'; // read-side leakage control
}

const views = createViewRegistry(adapter); // shares the state adapter
views.register({
  id: 'app.selection',
  description: 'IDs and kinds of the currently selected nodes.',
  select: (s) => s.selection.map((id) => ({ id, kind: s.nodes[id].kind })),
  tier: 'stable', sensitivity: 'public',
});
```

Then project the view registry to each read channel with thin adapters symmetric to `toAITools`/`buildToolsList`:

- **MCP resources** — map views to `{ uri: 'app://state/<id>', name, description, mimeType:'application/json' }`; `resources/read` returns `JSON.stringify(v.select(getState()))`; declare `resources.subscribe:true` and wire `adapter.subscribe(...)` to emit `notifications/resources/updated` for changed URIs. Use RFC-6570 templates for parameterized views (`app://state/node/{id}`). The *correct, app-controlled* representation.
- **A universal `getState` tool** — one read-only `app.getState({ view: enum(viewIds) })` (or per-view `get_<id>` tools) annotated `readOnlyHint:true, openWorldHint:false, idempotentHint:true`, routing through the same `views` registry. The **pragmatic hedge for tools-only hosts**.
- **AG-UI / readable-context bridge** — for an in-app assistant, wire `PatchCapableAdapter` patches straight into `STATE_DELTA` (same RFC-6902 format) and `getState()` into `STATE_SNAPSHOT`. Live, structured, delta-based sync essentially for free.

**Selective exposure & leakage** — the `sensitivity` field + tiers: `internal`/`secret` views are never projected (mirroring `internal` command filtering); `redacted` passes through a documented redactor. **Token budget** — views are *narrow by design* (a selector, not the tree), plus MCP `priority` annotations and the just-in-time pull. **Freshness** — `subscribe`/patches (push) on capable hosts; re-pull on the rest.

The load-bearing, slightly counterintuitive recommendation is **both resources and a tool**: ship the resource projection as the *correct* answer and the `getState` tool as the *portable* one, both from one `ViewRegistry`. This is the read-side symmetric completion of acture's write-side story.

## 4. Action exposure (write side) — already best-practice

acture's write side is already best-practice (see `acture-mcp`, `acture-ai`, and ai_assistants-03 §§4–5 for the full treatment: dispatch-not-eval, errors-as-data, tier filtering, deprecation banners, function-`when` exclusion). Two additive refinements from this survey:

1. **Emit MCP tool `annotations`** from the command's side-effect class: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` [7][19]. **Critical — the defaults are hostile:** omit them and every command is treated as destructive + open-world, maximizing confirmation friction [19]. Annotations are *hints, not security* ("clients MUST treat annotations from untrusted servers as untrusted" [7]) — they drive host UX (auto-approve vs confirm), feeding §6.
2. **`defer_loading` for large catalogs** — Anthropic's Tool Search Tool marks long-tail tools deferred (~85% token reduction at scale; see ai_assistants-03 §8). A large registry should let the projection mark long-tail commands deferred.

## 5. The agent runtime / loop — where it should live

**Multi-step is the default.** Every current runtime runs a multi-step ReAct loop (Vercel v6 default `stepCountIs(20)`; OpenAI `Runner` auto-cycles) [30][12]. An "operate my app" assistant is inherently multi-step (read state → decide → dispatch → read new state → …). **The loop is backend** in every serious stack; only *rendering* and *voice* run client-side [1][12][13].

**Where the loop lives for acture.** acture ships *no* loop (correct — `maxSteps` is the SDK's, not acture's). The registry is dispatch-agnostic and runs in Node *and* the browser, so two deployment shapes both work and both keep the loop out of acture:

- **Backend loop (recommended default):** registry server-side, projected to MCP tools + resources; a backend runtime (Vercel `ToolLoopAgent`, OpenAI Agents SDK, or LangGraph for long/durable/audited runs) runs the loop; the browser renders via assistant-ui/AI Elements and executes any *frontend* tools. Matches AG-UI's model.
- **Frontend loop (thin apps):** registry in the browser (constructible outside React by design); an in-app assistant (CopilotKit/assistant-ui) advertises the registry as frontend tools whose executors call `registry.dispatch`, and exposes views via `useAssistantContext`. No backend agent server needed.

The bridge acture owes is a **worked recipe** (`hand-written-assistant-runtime.md`) for both shapes — analogous to `hand-written-registry.md` — not a package.

## 6. Human-in-the-loop — confirmation for destructive dispatch

### 6.1 The industry converged on one shape

MCP makes it normative: "there **SHOULD** always be a human in the loop with the ability to deny," and clients **SHOULD** "show tool inputs to the user before calling" [7][8]. Every runtime implements the same five-beat pattern:

> **model proposes a tool call → runtime pauses with serializable state → UI renders the proposed call (viewable, often editable) → user approves / denies / edits → run resumes with the decision folded in as the tool result.**

Verified instantiations: Vercel `toolApproval` → `addToolApprovalResponse` [30][14]; OpenAI `needsApproval` → `result.interruptions` → `state.approve()`, with `RunState` serializable across processes [12]; LangGraph `interrupt()` + `Command(resume=…)` [15]; CopilotKit `useHumanInTheLoop`/`useInterrupt` [16]; MCP `elicitation` [8]; Pydantic `DeferredToolRequests`; Mastra durable `suspend()/resume()` [17]. Two orthogonal axes: **who initiates the pause** (model calls a confirm-tool vs. the code path deterministically gates — CopilotKit's `useHumanInTheLoop` vs `useInterrupt`), and **inline pause/resume vs. a policy engine** (Anthropic's Agent SDK is the richest: modes + allow/deny + `canUseTool` [34]). ai_assistants-03 §5.3 covers the *annotation* side of this (`requiresApproval` hints); this section covers the *runtime* side.

### 6.2 Recommended pattern — gate at the dispatch boundary

Because acture carries per-command metadata and a central dispatcher, the gate belongs at the **dispatch boundary, driven by declarative command metadata** — not scattered in UI code. "The model proposes; the **registry** disposes."

1. **Declare risk on the command**, projected to MCP annotations: a `sideEffect: 'query' | 'additive' | 'destructive'` (deriving `readOnlyHint`/`destructiveHint`) plus an explicit `requiresConfirmation?: boolean` override. A `destructive` command defaults to requiring confirmation.
2. **Gate as dispatch middleware, not a caller check:**

```ts
// Confirmation is a dispatch-boundary concern, uniform across surfaces.
const confirmGate: Middleware = (next) => async (cmd, args, ctx) => {
  const rec = registry.get(cmd);
  if (rec?.requiresConfirmation && ctx.channel === 'assistant' && !ctx.approvedToken) {
    return { ok: false, error: {
      code: 'confirmation_required',
      message: `"${rec.description}" is destructive and needs approval.`,
      details: { command: cmd, params: args, preview: rec.previewEffect?.(args) },
    }};
  }
  return next(cmd, args, ctx);   // approved (or non-destructive) → dispatch
};
```

3. **The runtime turns `confirmation_required` into a HITL pause** — the chat UI renders `{command, params, preview}` as an approve/deny/edit card (assistant-ui `respondToApproval`, Vercel `addToolApprovalResponse`, CopilotKit HITL); on approve, the runtime re-dispatches with `ctx.approvedToken` — a **one-use token bound to the exact `{command, params}` hash**, so approval can't be replayed against different args.

This keeps the gate **caller-independent and schema-validated at the dispatcher regardless of surface** (acture's existing invariant), makes confirmation **declarative** (one field, not per-action UI), and reuses **errors-as-data** as the pause channel — so the same mechanism works on MCP (as `elicitation` or an `isError` proposal), Vercel, CopilotKit, or a hand-written loop. The `previewEffect` can call a *view* (§3) to show *what will change* — read-before-you-write made concrete.

## 7. The assistant's dispatch chain is a macro — undo/replay

An assistant operating the app emits a chain of tool calls; each, routed through the registry, is a `{commandId, params}` pair. **A completed assistant turn is structurally a macro** — the exact shape acture already uses (`acture-ai` §"AI multi-step sequence IS a macro"; `docs/hand-written-command-sequence.md`). *Do not invent a second format.* Three capabilities fall out once the assistant's dispatches are captured:

- **Undo** — every dispatch through `PatchCapableAdapter` yields `{patches, inversePatches}`; a whole turn is undone by applying concatenated inverse patches in reverse. One "Undo AI action" over an arbitrarily long chain — *more* robust than any surveyed framework's undo story.
- **Replay / macro-ification** — a captured chain saves as a named macro and re-dispatches deterministically ("the assistant did a useful 8-step thing; save it as a one-click command").
- **Test fixtures** — the captured chain + JSON-serializable state snapshots is a replayable e2e test; the assistant's own runs become regressions.

**The load-bearing caveat (surprising).** LangGraph's "time travel" exposes an agent run as a replayable, forkable *history* — but replay **re-executes** forward nodes: "LLM calls, API requests, and interrupts fire again and may return different results" [18]. So an *agent run* is **not** a deterministic macro; only the **captured dispatch chain** is. The correct framing: **separate the reasoning trace (non-deterministic, replays as fresh LLM calls) from the dispatch chain (deterministic, replays exactly).** acture should capture and offer-to-save the *dispatch chain* — explicitly *not* the LLM transcript. This is a genuine differentiator: acture's macro layer captures precisely the deterministic slice LangGraph's checkpoints deliberately do not guarantee.

## 8. Generative UI — render-in-chat vs. act-on-the-app

Two flavors: **UI-in-chat** (the result renders as a component inside the chat — Vercel maps `tool-<name>` parts to components; CopilotKit's six primitives; ChatKit widgets; C1's model-authored DSL [30][27][38]) and **act-on-the-app** (the executor drives your existing UI — assistant-ui `"use client"` executors, AG-UI frontend tools [2][32]).

For a command-dispatch app the mapping is clean: **most commands act on the app** (dispatch → state changes → your existing UI re-renders — no generative UI needed; the app *is* the UI). Generative-UI-in-chat is reserved for exactly two moments: **(1) parameter collection** — render the command's schema as a form in chat (the palette's param-collector, reused); **(2) the confirmation card** from §6. Both are *schema-driven from the command record* — a projection of the same schema bridge, not bespoke chat components. Reach for AI Elements / assistant-ui tool UIs; don't build a generative-UI framework into acture.

## 9. Guardrails / security checklist

Distilled from MCP Security Best Practices, the OWASP MCP Top 10, Invariant Labs' tool-poisoning research, Anthropic's computer-use guidance, and acture's hard-don'ts [7][19][35][39][40][41] (ai_assistants-03 §5 covers the annotation/permission-scoping layer):

- **Dispatch, never `eval`.** Route `(name, args)` through `Map.get(name)` + schema validation; never reflective invocation of a model string (hard-don't #5).
- **Validate at the dispatcher regardless of caller.** No "came from the AI, so trust it" fast path (hard-don't #10). The model's *choice of function is not authorization*.
- **Authorization is a separate concern** from caller identity — a `when`-clause or middleware. For multi-user MCP: filter `tools/list`/`resources/list` by scope **and** re-check inside each handler.
- **Tier-filter to hide internal/destructive surface** — `internal` commands *and internal views* never projected; `experimental` opt-in.
- **Confirmation gate on destructive dispatch** — declarative `requiresConfirmation`, gated at dispatch (§6). Show the exact `{command, params}` before executing.
- **Emit tool annotations, mindful of hostile defaults** — set `readOnlyHint`/`destructiveHint` explicitly; treat inbound annotations from *other* servers as untrusted.
- **Treat all model-visible content and tool results as untrusted input** — a "read-only" resource's *content* can carry injection payloads once in context. Sanitize/annotate; keep `openWorldHint` honest.
- **Leakage control on the read side** — `sensitivity` scoping on views; never project `secret`; document the `redacted` redactor.
- **Prefer the typed registry over computer-use** — a typed registry (injection surface = declared params only) beats pixel-driving (whole-screen surface); Anthropic itself gates computer use behind an injection classifier that auto-forces confirmation [35].
- **MCP transport/authz hygiene** (if remote) — OAuth 2.1 + PKCE + Resource Indicators (RFC 8707); never accept tokens not issued *to* your server; per-client consent (confused-deputy) [39].

## 10. Observability

The registry is the single choke point, so *every* assistant dispatch is observable by construction (acture already has a telemetry surface — `docs/hand-written-telemetry.md`), tagged with the originating channel (`ctx.channel === 'assistant'`), the `{commandId, params}`, the errors-as-data result, and (via patches) the exact state delta. Recommendations: (a) tag assistant-originated dispatches distinctly for audit; (b) log the *proposal → approval → dispatch* triple for every gated command; (c) emit OpenTelemetry spans from dispatch middleware so acture drops into any tracer (LangSmith, OpenAI/Vercel tracing) without taking a tracing dependency — a middleware seam, per the "no devtools in the adapter" discipline.

## 11. Library / tool recommendations

**What acture should build (small, projection-shaped, dev-tool-first):**
- A **`ViewRegistry`** read-side primitive (§3) + projections: `toMcpResources(views)`, a `getState` tool projection, and an optional AG-UI `STATE_SNAPSHOT`/`STATE_DELTA` bridge reusing `PatchCapableAdapter` patches. The single highest-leverage addition — it closes the industry-wide read-side gap with machinery acture already owns.
- A **`requiresConfirmation` dispatch-middleware** + the errors-as-data proposal shape (§6), plus MCP tool-annotation emission from `sideEffect`.
- **Docs, not packages, for the runtime** — `hand-written-assistant-runtime.md` (backend-loop + frontend-loop shapes) and capture-the-dispatch-chain wiring feeding the existing macro/undo layer (§7).

**What stays the app's choice (name, don't sell):**
- **Backend agent runtime** — Vercel AI SDK `ToolLoopAgent` (clean loop, stable `toolApproval`, `@ai-sdk/mcp` consumes resources) or the OpenAI Agents SDK (`needsApproval` + resumable `RunState`); LangGraph for long/durable/audited runs. All consume acture's MCP projection unchanged.
- **Chat UI** — assistant-ui (the only chat layer that *also* ships first-class read-side Model Context + clean HITL, and adapts to Vercel/LangGraph/AG-UI backends); Vercel AI Elements if already all-in on the AI SDK; CopilotKit for a batteries-included in-app copilot on AG-UI.
- **Protocol** — MCP (tools + the new resource projection) for *external* assistants; AG-UI for the *in-app* assistant's live state sync. Complementary, not competing (MCP = agent→tool/data; AG-UI = agent→user/frontend).

The through-line: acture needs no runtime, chat UI, or protocol of its own — it needs to **project its already-typed state model to the read side** the way it already projects its command registry to the write side, and to **document the bridge** into the runtimes and chat UIs the app already chose.

## 12. Decision this unblocks

- **Whether the `ViewRegistry` + read-side projections ship as package additions** (`acture-mcp` resources projection; a state-side `createViewRegistry`) **or as a hand-written reference** (`docs/hand-written-view-registry.md`) — a real, named need (`reelee-web`) exists, but the package/pattern split per consumer is the user's call.
- **Whether `requiresConfirmation` + `sideEffect` become command-record fields** (a closed-surface change — needs the rule-of-three/named-need test) **or middleware + convention** layered outside the record. The middleware path adds nothing to `CommandRecord`; the field path is cleaner but touches the closed surface — surface both.
- **The AI-assistant bridge skill** — a new consumer skill connecting acture to the general `ai-assistant-*` skill family (chat UI, prompts/skills, agent runtime), owning the read-side + HITL + macro specifics; and a `hand-written-assistant-runtime.md` reference.

---

## REFERENCES

[1] [Vercel AI SDK — Agents / Loop Control](https://ai-sdk.dev/docs/agents/loop-control)
[2] [assistant-ui — Model Context (read-side primitives)](https://www.assistant-ui.com/docs/copilots/model-context)
[3] [Microsoft Agent Framework — Overview](https://learn.microsoft.com/en-us/agent-framework/overview/)
[4] [Pydantic AI — Deferred tools / approval](https://ai.pydantic.dev/deferred-tools/)
[5] [Pydantic AI — AG-UI integration](https://pydantic.dev/docs/ai/integrations/ui/ag-ui/)
[6] [MCP Specification — Resources (application-driven; subscribe/updated)](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
[7] [MCP Specification — Tools (model-controlled; annotations; HITL)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
[8] [MCP Specification — Elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)
[9] [MCP Architecture overview — tools/resources/prompts split](https://modelcontextprotocol.io/docs/learn/architecture)
[10] [MCP Prompts and Resources: The Primitives You're Not Using — dev.to](https://dev.to/aws-heroes/mcp-prompts-and-resources-the-primitives-youre-not-using-3oo1)
[11] [AG-UI — State Management (STATE_SNAPSHOT / STATE_DELTA = RFC 6902 JSON Patch)](https://docs.ag-ui.com/concepts/state)
[12] [OpenAI Agents SDK (JS) — Human-in-the-Loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)
[13] [OpenAI Agents SDK (Python) — Agents/Runner](https://openai.github.io/openai-agents-python/agents/)
[14] [Vercel AI SDK — Human-in-the-Loop cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop)
[15] [LangGraph — Interrupts (interrupt() + Command(resume=…); node re-runs)](https://docs.langchain.com/oss/python/langgraph/interrupts)
[16] [CopilotKit — Human-in-the-Loop (useHumanInTheLoop vs useInterrupt)](https://docs.copilotkit.ai/agent-spec/human-in-the-loop)
[17] [Mastra — Suspend & Resume (durable HITL)](https://mastra.ai/en/docs/workflows/suspend-and-resume)
[18] [LangGraph — Use time-travel (replay re-executes; not deterministic playback)](https://docs.langchain.com/oss/python/langgraph/use-time-travel)
[19] [MCP Blog — Tool Annotations as a Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
[20] [acture — architecture primer (state model, command registry, schema bridge)](https://github.com/i2mint/acture)
[21] [acture — acture-ai skill (registry → LLM tool definitions; AI chain = macro)](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-ai/SKILL.md)
[22] [acture — acture-mcp skill (registry → MCP tools; errors-as-data; guardrails)](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-mcp/SKILL.md)
[23] [CopilotKit — useCopilotReadable (serialized {description,value} → system prompt)](https://docs.copilotkit.ai/reference/hooks/useCopilotReadable)
[24] [CopilotKit — Agent context delivery](https://docs.copilotkit.ai/direct-to-llm/guides/connect-your-data)
[25] [CopilotKit — Architecture (frontend/runtime/agent; backend loop)](https://docs.copilotkit.ai/concepts/architecture)
[26] [CopilotKit — useCopilotAction / renderAndWaitForResponse](https://docs.copilotkit.ai/reference/hooks/useCopilotAction)
[27] [CopilotKit — Generative UI overview (six primitives)](https://docs.copilotkit.ai/direct-to-llm/guides/generative-ui)
[28] [CopilotKit — MCP (client tools + MCP Apps UI resources)](https://docs.copilotkit.ai/guides/model-context-protocol)
[29] [assistant-ui — Tool UI / HITL (respondToApproval, humanTool)](https://www.assistant-ui.com/docs/guides/ToolUI)
[30] [Vercel AI SDK — Tools and Tool Calling (toolApproval; deprecates needsApproval)](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
[31] [Vercel AI SDK — MCP tools (@ai-sdk/mcp: tools + resources + prompts + elicitation)](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
[32] [AG-UI — Tools (frontend tools = "operate the app" primitive)](https://docs.ag-ui.com/concepts/tools)
[33] [OpenAI — Tools, Connectors & MCP (Responses API; mcp_approval_request)](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
[34] [Anthropic — Claude Agent SDK permissions (modes + canUseTool + allow/deny)](https://code.claude.com/docs/en/agent-sdk/permissions)
[35] [Anthropic — Computer use tool (injection classifier auto-confirm)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
[36] [OpenAI — Voice agents / Realtime](https://developers.openai.com/api/docs/guides/voice-agents)
[37] [acture — state-adapter skill (StateAdapter/PatchCapableAdapter; RFC-6902 patches)](https://github.com/i2mint/acture/blob/main/.claude/skills/acture-state-adapter/SKILL.md)
[38] [Thesys — How C1 works (generative UI DSL)](https://docs.thesys.dev/guides/how-c1-works)
[39] [MCP Specification — Security Best Practices (confused deputy, token passthrough)](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
[40] [Invariant Labs — MCP Tool Poisoning Attacks](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks)
[41] [OWASP — MCP Top 10: MCP03 Tool Poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning)
[42] [OpenAI — Assistants API deprecation (sunset 2026-08-26) → Responses API](https://developers.openai.com/api/docs/deprecations)
[43] [CopilotKit — The State of Agentic UI: AG-UI vs MCP vs A2A](https://www.copilotkit.ai/blog/the-state-of-agentic-ui-comparing-ag-ui-mcp-ui-and-a2ui-protocols)
