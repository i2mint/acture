---
"acture-mcp-server": minor
"acture-ai-vercel": minor
---

`context` now also hides commands whose `when` is false from the tool list: `buildToolsList(registry, { context })`, `createMcpServer(registry, { context })` and `toAITools(registry, { context })`. It may be a function, read on every `tools/list`, build and dispatch, so the list follows a changing context. Without a context every command is listed, as before; `when_clause_failed` at dispatch remains the backstop.
