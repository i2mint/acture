---
"acture-mcp-server": minor
"acture-ai-vercel": minor
---

`context` now also hides commands whose `when` is false from the tool list: `buildToolsList(registry, { context })`, `createMcpServer(registry, { context })` and `toAITools(registry, { context })`. It may be a function, read on every `tools/list`, build and dispatch, so the list follows a changing context. Without a context every command is listed, as before; `when_clause_failed` at dispatch remains the backstop.

Function-form `when`s are never run while listing (they stay excluded by `excludeFunctionWhen`). The list is fixed when built: a context that changes needs a rebuild (`toAITools` per step) or, on the MCP server, a `notifications/tools/list_changed`.
