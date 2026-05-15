---
name: acture-ai
description: Build an AI-tool-calling consumer surface in a target project — project the command registry as LLM function-calling tool definitions so a model can invoke commands. Covers the SDK choice (Vercel AI SDK / Anthropic SDK / OpenAI SDK / LangChain), the schema-projection fork (pass Zod through vs project to JSON Schema), the agent-written vs `acture-ai-vercel` package paths, errors-as-data, and the prompt-injection guardrails. Use when exposing a command-dispatch app to an LLM, or when working ON the `acture-ai-vercel` package. Triggers on "AI tool calling", "LLM function calling", "tool use", "expose commands to an AI", "Vercel AI SDK", "streamText tools", "let the model call commands", "AI agent loop".
---

# acture ai — the registry as LLM tool definitions

LLM function calling needs exactly the metadata a command registry already carries: a name, a description, and a parameter schema. The Vercel AI SDK's `tool({ description, parameters, execute })`, the Anthropic and OpenAI tool-use APIs, and LangChain all converge on this shape (journal article §3.2). Projecting a registry as AI tools is a thin adapter that iterates the registry and emits per-tool definitions — the same registry, a different projection.

> **Load `acture-consumer-integration` first.** AI tool calling is a consumer — this skill covers AI specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the tool-library-is-the-user's-choice rule) lives there.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the AI SDK (the tool-library choice — the user's)

AI tool calling rests on an SDK. Realistic choices: **Vercel AI SDK**, the **Anthropic SDK**, the **OpenAI SDK**, **LangChain**, or a direct provider HTTP call. **This choice belongs to the project, not to acture.** acture ships one tested per-tool binding — `acture-ai-vercel`, built on the Vercel AI SDK — for projects that chose it. It does not imply the Vercel SDK is the only option.

The SDK choice drives a real implementation fork — **how the parameter schema is projected**:

- **SDKs that accept a schema library object directly** (Vercel AI SDK, LangChain) — pass `record.params` (the Zod schema) **through unchanged**. This preserves `z.refine` / `z.transform` validators that JSON Schema would silently drop.
- **SDKs that want JSON Schema on the wire** (raw Anthropic / OpenAI tool definitions) — project through `toJsonSchema(record)` and put the result in `input_schema` / `parameters`.

Name this fork explicitly when you surface the SDK choice — it changes the adapter's core line.

### Decision 2 — agent-written vs package-reuse

- **Agent-written** — write the projection directly: iterate `registry.list({ tiers })`, build the SDK's tool-definition shape per command, and give each an `execute` that routes through `registry.dispatch`. ~30 lines, owned. This is the **only** path if the SDK is not the Vercel AI SDK — adapt the pattern in `packages/ai-vercel/src/index.ts` (a worked example, not an import).
- **Package-reuse — only if the SDK is the Vercel AI SDK** — install `acture-ai-vercel`. `toAITools(registry, { tiers?, excludeFunctionWhen?, context?, onDispatched? })` returns `Record<string, Tool>` ready to drop into `streamText({ tools })` / `generateText({ tools })`. Cost: a dependency to track (`ai` and `zod` are peer deps).

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes.

## The build — what every path produces, and what to get right

- **`execute` routes through `registry.dispatch` — always.** The tool's `execute(args)` calls `registry.dispatch(id, args, ctx)`; it never invokes a handler directly. This is what gives the model the same validation and middleware as every other surface.
- **Errors are data.** `execute` resolves to `{ ok: true, value }` on success and `{ ok: false, error: { code, message, details } }` on failure — never throws. The model sees the error in the tool-result message and can recover. This is the *same shape* the model sees on every surface (palette, hotkeys, MCP) — do not invent a per-surface error format.
- **Tier filtering is a parameterized projection, not adapter logic.** Default `tiers: ['stable']`; `experimental` opt-in; `internal` never exposed. This is core's `registry.list({ tiers })` — the adapter passes the option through (hard-don't #3).
- **`@deprecated` → a deterministic banner.** A `deprecated`-tier command's description is prefixed `[DEPRECATED — <reason>]` so the model sees the deprecation before composing a tool call. This banner is the *one* description rewrite the adapter is allowed — and it mirrors `acture-mcp-server` exactly.
- **Function `when`-clauses are skipped by default** (`excludeFunctionWhen: true`) — a function `when` is opaque to static projection and unsafe to expose to a model as available.
- **An AI multi-step sequence IS a macro.** When the model composes a chain of tool calls, its output is structurally a `{commandId, params}` sequence — the same shape as a recorded macro (journal §3.2, §3.7). If the project also has a macros surface, the AI-emitted format and the recorded-macro format are *one format*; load `acture-macros` and do not invent a second one.

## The security guardrails — this surface takes input from a model

The LLM is an untrusted caller. The prompt-injection / tool-poisoning attack class applies directly (hard-don'ts #5 and #10):

- **The LLM proposes; the registry decides.** `execute` routes the model's `(name, args)` through `registry.dispatch` — `Map.get(name)` + schema validation. Never `eval`, `new Function`, or reflective invocation of a model-supplied string.
- **Schema validation happens at the dispatcher, regardless of caller.** There is no "this call came from the AI surface, so skip validation" fast path. The model's choice of function is *not* authorization.
- **Authorization is a separate concern** — a `when`-clause or middleware, never the caller's identity. The model has zero special trust.

## When working ON `acture-ai-vercel`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- `ai` and `zod` are peer dependencies, framed as the user's tool choice — named, not sold.
- The package **translates** the registry to Vercel AI SDK tool definitions; it holds no business logic and makes no architectural decisions (hard-don't #3). The deprecation banner is the only allowed description rewrite, it is deterministic, and it mirrors `acture-mcp-server`'s.
- It passes `record.params` (Zod) through directly rather than re-projecting — because the Vercel SDK accepts Zod. A JSON-Schema-wanting SDK adapter would project through `toJsonSchema` instead; that difference is per-SDK, not a core change.
- No agent loop, no orchestration, no prompt construction — those belong to the host. The package emits tool definitions and nothing more.

## What NOT to build (rule of three)

No per-surface trust fast-path (hard-don't #10), no prompt-engineering or description-rewriting beyond the deprecation banner (that is business logic — hard-don't #3), no agent loop / multi-step orchestration in the adapter (the host owns that — `maxSteps` is the SDK's, not acture's), no acture-authored system prompt. Wait for a concrete caller. The registry → tool-definitions projection covers the overwhelming majority of AI-tool-calling needs.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-schema-bridge` — `toJsonSchema(record)` and the JSON-Schema-representable subset rule; relevant when the SDK wants JSON Schema rather than Zod.
- `acture-tier-system` — tier semantics and what `@deprecated` does.
- `acture-mcp` — the sibling AI-facing surface; shares tier filtering, deprecation banners, function-when exclusion, and errors-as-data. MCP always projects to JSON Schema; AI SDKs may take Zod directly.
- `acture-macros` — an AI-composed tool-call sequence is a macro; share the format.
- `packages/ai-vercel/src/index.ts` — the Vercel AI SDK binding's source, a worked example to adapt for other SDKs.
- `docs/command_dispatch_journal_article.md` §3.2 — AI tool calling.
