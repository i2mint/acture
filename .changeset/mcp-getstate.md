---
"acture-mcp-server": minor
---

Add a read-only **`getState` tool** — the portable read-side hedge for tools-only
hosts (research-11 §3.2). MCP resources are the correct read side but the
least-supported MCP primitive; a single `getState` tool works on **any**
tools-capable host (tools-only MCP hosts like Cursor, or a direct Anthropic/Vercel
tool projection).

- **Pure:** `buildGetStateTool(views, opts)` → a wire-safe (`app_getState` by
  default), `readOnlyHint` tool descriptor whose `view` param enumerates the listed
  view ids; `callGetState(views, args)` reads the requested view (errors-as-data —
  invalid `view` → `isError`, unknown/internal view → `null`). Feed the descriptor
  into a `tools/list` alongside `buildToolsList`, or straight into a non-MCP tool
  array.
- **Server:** `createMcpServer(registry, { views, getStateTool: true })` merges the
  tool into `tools/list` and routes it in `tools/call`. Default off; requires `views`.
- `McpToolDescriptor` gained an optional `annotations` field (`readOnlyHint` etc.);
  the getState tool sets it. Additive; command-tool projection is unchanged.
