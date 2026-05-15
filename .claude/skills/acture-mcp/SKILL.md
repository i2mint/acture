---
name: acture-mcp
description: Build an MCP-server consumer surface in a target project — project the command registry as Model Context Protocol tools (`{name, description, inputSchema}`), tier-filtered, errors-as-data. Covers the two-layer split (pure projection vs transport glue), the agent-written vs `acture-mcp-server` package paths, tier semantics, function-when-clause exclusion, and the prompt-injection guardrails. Use when exposing a command-dispatch app to MCP clients, or when working ON the `acture-mcp-server` package. Triggers on "MCP", "MCP server", "Model Context Protocol", "tools/list", "tools/call", "expose to Claude", "stdio server", "@modelcontextprotocol/sdk".
---

# acture mcp — the registry as an MCP server

MCP tools *are* commands: the protocol defines a tool as `{name, description, inputSchema}` where `inputSchema` is JSON Schema — literally a serialization of the command pattern (journal article §3.3). Exposing a registry over MCP is a thin adapter that iterates the registry and emits per-tool descriptors. The alternative — hand-writing MCP tool definitions separately from internal commands — creates schema drift and doubles the maintenance surface.

> **Load `acture-consumer-integration` first.** MCP is a consumer — this skill covers MCP specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice) lives there. If this is a strangler-fig adoption, also load the `migration-*` skills.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the SDK and transport (the tool-library choice — the user's)

Unlike palette/hotkeys, MCP has effectively **one** SDK — `@modelcontextprotocol/sdk` — so the fork is not *which library* but **which transport**: stdio (the common Node-side path), HTTP/SSE, streamable HTTP, in-browser WebSocket, or a custom transport. The transport choice belongs to the project. Note the spec is **date-versioned and the transport story churns** (SSE → streamable HTTP); treat a protocol-version upgrade as semver-major and pin the spec version in CI.

### Decision 2 — agent-written vs package-reuse

- **Agent-written** — write the projection directly: a pure layer iterating `registry.list({ tiers })`, projecting each command through `toJsonSchema`, plus a `callTool` that routes through `registry.dispatch`. ~40 lines, owned. Then wire the SDK's `ListToolsRequestSchema` / `CallToolRequestSchema` handlers yourself. Adapt the pattern in `packages/mcp/src/tools.ts` + `packages/mcp/src/server.ts` (worked examples, not imports).
- **Package-reuse** — install `acture-mcp-server`. Two layers ready: the **pure functions** `buildToolsList(registry, opts)` / `callTool(registry, name, args, ctx?)` / `formatToolResponse(result)` — transport-agnostic, no SDK dependency — and the **Node stdio server** `createMcpServer(registry, { name, version, tiers?, context? })` / `connectStdio(server)`. Cost: a dependency to track (`@modelcontextprotocol/sdk` is a peer dep).

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes.

## The build — what every path produces, and what to get right

- **Two layers, kept separate.** The **pure projection** (registry → tool descriptors, dispatch → MCP response) has zero SDK dependency, so any transport can consume it. The **transport glue** wires the SDK's request handlers. Don't fuse them — a project on HTTP transport should reuse the pure layer untouched.
- **Tier filtering is a parameterized projection, not adapter logic.** Default `tiers: ['stable']`. `experimental` / `deprecated` are opt-in (`tiers: ['stable', 'experimental']`); `internal` is *never* emitted (the registry filters it unconditionally). This is core's `registry.list({ tiers })` — the adapter passes the option through; it does not implement visibility rules itself (hard-don't #3: "MCP cares about tier filtering" → a parameterized projection, not adapter business logic).
- **`@deprecated` → a deterministic banner.** A `deprecated`-tier command's description is prefixed `[DEPRECATED — <reason>]` so the model sees the deprecation before composing a tool call. The format is deterministic so downstream schema diffs can detect banner-only changes and skip flagging them as breaking.
- **Errors are data, never thrown on the wire.** A failing dispatch returns `{ content: [...], isError: true }` with the JSON-serialized `{ code, message, details }` as content text — the model sees the error and can recover. Never let a dispatch failure surface as a tool-call exception.
- **Function `when`-clauses are skipped by default.** A command whose `when` is a function (not the DSL) is opaque to static projection — its availability can't be expressed to an MCP client. `buildToolsList` excludes such commands by default (`excludeFunctionWhen: true`); override only with a deliberate reason.
- **Fire `notifications/tools/list_changed`** when the registry's tier-filtered view changes (e.g. a command graduates experimental → stable via re-registration). Wire it to `registry.onCommandsChanged(...)`.

## The security guardrails — this surface is exposed to untrusted callers

MCP clients are external agents. The prompt-injection / tool-poisoning attack class applies directly (hard-don'ts #5 and #10):

- **Replay routes through `registry.dispatch` only** — `Map.get(name)` + schema validation. Never `eval`, `new Function`, or reflective invocation of an LLM-supplied string. An unknown tool name returns `{ ok: false, error: { code: 'unknown_command' } }` and nothing runs.
- **Schema validation happens at the dispatcher, regardless of caller.** There is no "the call came from MCP, so trust it" fast path. The LLM proposes; the registry decides.
- **Authorization is a separate concern** — a `when`-clause or middleware, never the caller's identity. The MCP client has zero special trust.

## When working ON `acture-mcp-server`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- The **pure layer** (`tools.ts`) must stay SDK-free so non-stdio hosts can consume it. The **SDK glue** (`server.ts`) is the only place `@modelcontextprotocol/sdk` is imported.
- `@modelcontextprotocol/sdk` is a peer dependency, framed as the user's choice.
- The package **translates** the registry to MCP shape; it holds no business logic and makes no architectural decisions (hard-don't #3).
- Pin the MCP spec version in CI and treat protocol upgrades as semver-major (a standing backlog item — `docs/roadmap.md`).

## What NOT to build (rule of three)

No per-user / per-client tool-visibility logic in the adapter (that is business logic — push it into a `when`-clause or core middleware), no auth layer in the adapter, no custom transport abstraction over the SDK's, no MCP *resources* / *prompts* projection — wait for a concrete caller. The registry → `tools/list` + `tools/call` projection covers the overwhelming majority of MCP needs.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-schema-bridge` — `toJsonSchema(record)`, the projection MCP relies on, and the JSON-Schema-representable subset rule.
- `acture-tier-system` — tier semantics and what `@deprecated` does.
- `acture-ai` — the sibling AI surface; shares tier filtering, deprecation banners, function-when exclusion, and errors-as-data, but projects Zod differently (see that skill).
- `packages/mcp/src/` — the MCP binding's source; `tools.ts` is the pure layer, `server.ts` the stdio glue.
- `docs/command_dispatch_journal_article.md` §3.3 — MCP server integration.
