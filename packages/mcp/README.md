# acture-mcp

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

Project an [acture](https://npm.im/acture) registry as a [Model Context Protocol](https://modelcontextprotocol.io) server. Every command becomes a tool; tier-filtered by default; errors are returned as data.

## Install

```sh
pnpm add acture-mcp @modelcontextprotocol/sdk acture
```

## The two layers

### Pure functions (transport-agnostic)

```ts
import { buildToolsList, callTool } from 'acture-mcp';

const tools = buildToolsList(registry);           // tier: ['stable'] by default
const response = await callTool(registry, 'app.search', { query: 'foo' });
//      { content: [{ type: 'text', text: '...' }], isError?: true }
```

Use these from any transport — stdio, HTTP, in-browser WebSocket, custom.

### Node-side stdio server (the common path)

```ts
import { createMcpServer, connectStdio } from 'acture-mcp';
import { registry } from './registry';

const server = createMcpServer(registry, {
  name: 'graph-editor',
  version: '0.1.0',
  // tiers: ['stable'],            // default
  // context: { user: 'agent-1' }, // optional static context
});

await connectStdio(server);
// inspect with:
//   npx @modelcontextprotocol/inspector node ./dist/mcp.js
```

The server registers `tools/list` and `tools/call` handlers, and fires `notifications/tools/list_changed` whenever the registry's tier-filtered view changes.

## Tier semantics

| Tier | In `tools/list` by default? | Notes |
| --- | --- | --- |
| `stable` | ✅ | The user-facing surface. |
| `experimental` | ❌ | Pass `tiers: ['stable', 'experimental']` to include. |
| `deprecated` | ❌ | Description prefixed with `[DEPRECATED]` when included. |
| `internal` | ❌ (never) | Filtered unconditionally by the registry. |

## Errors as data

Failing dispatches do NOT throw on the MCP wire. They return `isError: true` with the JSON-serialized `{ code, message, details }` as content text. Per `acture-architecture-primer` §"errors as data" — the model sees errors, can recover.

## Function when-clauses are skipped by default

A command whose `when` clause is a function is not exposable to MCP (the body is opaque to static projection). `buildToolsList` skips such commands by default. Override with `excludeFunctionWhen: false` if you have a reason.

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md)
- [`acture-tier-system`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-tier-system/SKILL.md)
