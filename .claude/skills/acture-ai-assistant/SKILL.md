---
name: acture-ai-assistant
description: Build an embedded AI assistant that OPERATES a command-dispatch app — not just a chatbot that answers, but an assistant that reads current app state and takes actions on the user's behalf. Composes acture's write-side (command→tool/MCP, via acture-ai / acture-mcp) with the missing read side (a ViewRegistry projected to MCP resources + a getState tool), a dispatch-boundary human-in-the-loop confirmation gate, and dispatch-chain capture (undo/replay). Bridges to the general ai-assistant-* skill family for the runtime, chat UI, and prompts (which stay the app's choice). Use when adding an "operate my app" assistant/copilot to a command-dispatch app, exposing app state to an LLM, wiring MCP resources, or gating destructive AI actions. Triggers on "AI assistant", "operate my app", "copilot", "agent that takes actions", "expose state to the AI", "MCP resources", "getState tool", "human in the loop", "confirmation gate", "CopilotKit", "assistant-ui", "AG-UI", "the assistant should see what's selected".
---

# acture ai-assistant — an assistant that *operates* the app

An "operate my app" assistant does four things a bare tool-calling bridge does not: it **reads current state** to decide what to do, runs a **multi-step loop**, **confirms** destructive actions with the user, and produces a chain of actions that is **undoable/replayable**. acture already ships the write side (the command registry projected to LLM tools and MCP tools). This skill covers everything else — and it is mostly *projection and documentation*, because acture is structurally closer to an "operate my app" substrate than any framework: it already owns the typed state model and typed action registry the frameworks only half-have (research-11).

> **Load `acture-consumer-integration` first.** The assistant is a *consumer* — this skill covers assistant specifics; the foundational pattern (dev-tool-first, the per-consumer hand-write-vs-install choice, tool-library-is-the-user's-choice) lives there. Also load **`acture-ai`** and **`acture-mcp`** — this skill *composes* their write-side projection; do not re-derive it.

## How this relates to the general `ai-assistant-*` skills

There are two skill families and they are complementary — do not duplicate:

- The general **`ai-assistant-*`** family (`ai-assistant-architect` → `-chat-ui`, `-prompts-skills`, `-command-mcp`, `-agent-runtime`) owns the *generic* assistant: the chat UI, system prompt / skills, the agent loop/runtime, and the command→MCP wiring. **These are not acture-specific.** When the task touches the chat UI, the system prompt, or the runtime loop, hand off to them.
- **This skill** owns what is *acture-specific*: the command registry as the action surface (→ `acture-ai` / `acture-mcp`), the **view registry** as the read surface, the **dispatch-boundary confirmation gate**, and the **dispatch-chain-is-a-macro** tie-in. It is the acture bridge *into* the `ai-assistant-*` runtime — not a replacement for it.

The seam: acture projects the registry (write) and state model (read) into whatever runtime + chat UI the app chose via the `ai-assistant-*` skills. acture ships **no** loop, chat UI, or protocol of its own (research-11 §5, §11).

## The four things beyond the write-side bridge

### 1. The read side — a `ViewRegistry` (the industry-wide gap acture is placed to close)

No surveyed framework ships a first-class typed channel for exposing an app's *current state* to the model (research-11 §3). acture can, because its state adapter already exposes `getState()` / `subscribe()` and (via `PatchCapableAdapter`) emits RFC-6902 patches. Define a **view** — the read-side dual of a command: a named, described, tier-tagged, sensitivity-scoped selector over state — and project one `ViewRegistry` to three read channels, symmetric to how the schema bridge projects a command:

- **MCP resources** (`app://state/<id>`, with `resources/subscribe` liveness) — the semantically correct, *application-driven* representation.
- **A universal read-only `getState` tool** (`readOnlyHint: true`) — the portable hedge, because resources are the least-supported MCP primitive (Cursor and many hosts are tools-only).
- **An AG-UI `STATE_SNAPSHOT`/`STATE_DELTA` bridge** — for an in-app assistant; reuses `PatchCapableAdapter` patches for free.

**Ship both resources and the tool**, from one registry (spec says resources, host reality says tools). Reproducible core: `docs/hand-written-view-registry.md`. Leakage control is `tier` + `sensitivity` (`internal`/`secret` never projected); token budget is *narrow selectors* + just-in-time pull.

### 2. Human-in-the-loop confirmation — at the dispatch boundary

The industry converged on one beat: model proposes → runtime pauses with serializable state → UI renders the proposal → user approves/denies/edits → resume (research-11 §6). For a command-dispatch app the gate belongs at the **dispatch boundary, driven by declarative command metadata** — *the model proposes; the registry disposes*. A `requiresConfirmation`/`sideEffect: 'destructive'` command dispatched from the assistant channel without an approval token does not execute — it returns a **proposal as errors-as-data** (`code: 'confirmation_required'`, `{command, params, preview}`) which the chat UI renders as an approve/deny/edit card; on approve, re-dispatch with a **one-use token bound to the exact `{command, params}` hash**. Reproducible core: `docs/hand-written-assistant-runtime.md` Piece 1. This keeps confirmation caller-independent, declarative, and schema-validated regardless of surface — and `preview` can call a *view* to show *what will change*.

### 3. The dispatch chain is a macro — undo / replay / test fixtures

An assistant turn is `{commandId, params}[]` — acture's existing macro format. Capture it with `recordSequence` (`docs/hand-written-command-sequence.md`) and you get undo (concatenated inverse patches via `PatchCapableAdapter`), replay (save-as-command), and e2e fixtures for free. **Load-bearing caveat:** capture the **dispatch chain** (deterministic), NOT the LLM reasoning trace (non-deterministic — LangGraph's own "time travel" re-executes forward nodes). This is acture's differentiator. Do **not** invent a second format — the AI-emitted chain and the recorded macro are one (also stated in `acture-ai`).

### 4. The runtime — the app's choice; bridge, don't build

Every serious loop runs backend; only rendering/voice is client-side. acture ships no loop. Two deployment shapes both keep it out of acture (research-11 §5, reproducible in `docs/hand-written-assistant-runtime.md` Piece 3): **backend loop** (registry server-side → MCP tools + resources → a backend runtime) or **frontend loop** (registry in the browser → an in-app assistant advertises commands as frontend tools). Reach-for runtimes: Vercel `ToolLoopAgent` or the OpenAI Agents SDK (LangGraph for durable runs); reach-for chat UI: assistant-ui (first-class read-side context + HITL), AI Elements, or CopilotKit. Name these; the choice is the app's (hand off to `ai-assistant-agent-runtime` / `ai-assistant-chat-ui`).

## Decisions to surface (per `acture-consumer-integration`)

1. **Read channel(s):** MCP resources + `getState` tool by default (ship both); add the AG-UI bridge only for an in-app assistant. Not really optional — the read side is the gap; the only question is which channels the target host supports.
2. **Confirmation: middleware + convention, or record fields?** The middleware path adds nothing to `CommandRecord` (a `sideEffect`/`requiresConfirmation` convention read by the gate); the record-field path is cleaner but touches the **closed** `CommandRecord` surface (needs the named-need / rule-of-three test — see `acture-command-record-shape` and `acture-hard-donts`). Surface both; default to middleware+convention unless the project has a concrete reason to open the surface.
3. **Runtime + chat UI:** the app's choice — hand off to the `ai-assistant-*` family. Name Vercel / OpenAI / LangGraph and assistant-ui / CopilotKit; respect the pick.
4. **Agent-written vs package-reuse (per piece):** the `ViewRegistry` + confirmation middleware are small and hand-writable (the reference docs); a package would earn its keep only on the UI-bound pieces or a tested resources projection in `acture-mcp`. Per the dev-tool-first rule, this is the user's call.

## Guardrails (this surface takes input from a model)

Beyond the write-side guardrails in `acture-ai` / `acture-mcp` (dispatch-not-eval, validate-at-dispatcher-regardless-of-caller, authorization-is-not-caller-identity, tier-filtering, `@deprecated` banners):

- **Emit MCP tool `annotations` from the command's side-effect class** (`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`). The defaults are **hostile** — omit them and every command reads as destructive + open-world, maximizing friction. Annotations are hints, not security; treat inbound annotations from *other* servers as untrusted.
- **Tier-filter the read side too** — `internal`/`secret` *views* are never projected, exactly like `internal` commands.
- **Treat all model-visible content and tool results as untrusted input** — a "read-only" resource's *content* can still carry an injection payload once in context (tool poisoning). Keep `openWorldHint` honest; sanitize/annotate.
- **Prefer the typed registry over computer-use** — a typed registry's injection surface is its declared params; pixel-driving's is the whole screen.

## What NOT to build (wait for a real need)

- **No agent loop, chat UI, or protocol inside acture** — hard-don't; these are the app's SDK choices. Bridge to them.
- **No second state-sync format** — MCP resources (external) + AG-UI `STATE_DELTA` (in-app, RFC-6902 which `PatchCapableAdapter` already emits) cover it.
- **No approval policy engine yet** — `requiresConfirmation` + `sideEffect` covers the common case; reach for allow/deny lists + `canUseTool` only for per-role, per-tool rules.
- **No history/time-travel view, no per-view caching** until profiling or a concrete need demands it (research-11, view-registry doc "omits").

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-ai`, `acture-mcp` — the write-side projections this composes (command → LLM tools / MCP tools). Load both.
- `ai-assistant-architect` (+ `-chat-ui`, `-prompts-skills`, `-command-mcp`, `-agent-runtime`) — the general assistant family for the runtime, chat UI, and prompts. Bridge to these; don't duplicate.
- `acture-macros` — the dispatch-chain-is-a-macro tie-in (undo/replay).
- `docs/hand-written-view-registry.md` — the reproducible read-side primitive.
- `docs/hand-written-assistant-runtime.md` — the reproducible confirmation gate + capture + loop wiring.
- `docs/research/acture_research_11 -- AI Assistant Operating a Command-Dispatch App.md` — the evidence base (read-side gap, MCP resources-vs-tools, HITL convergence, macro caveat).
- `docs/research/ai_assistants 03 -- From Command Dispatch to MCP...md` — the write-side companion (tool-format normalization, annotation taxonomy, HITL *annotations*).
