---
"acture-mcp-server": patch
---

Harden the MCP boundary against non-serializable app values and tool-name
collisions (adversarial pre-wiring review):

- **Errors-as-data is never broken by a thrown `JSON.stringify`.** `callGetState`,
  `readResource`, and `formatToolResponse` now serialize app-supplied values
  through a guarded `safeStringify`. A `BigInt`, a circular reference, or a
  throwing `toJSON` in a view value or command result previously threw a
  `TypeError` past the tool-call handler (a JSON-RPC protocol crash instead of
  an `isError` result); it now returns an `unserializable_state` payload. An
  `err(...)` whose `details` is unserializable still delivers its `code`/`message`.
- **`ok(undefined)` no longer emits a malformed `text: undefined` content field**
  (which drops on the wire and fails a strict client's `CallToolResult` schema);
  it serializes as `"null"`.
- **`createMcpServer({ getStateTool })` fails fast on a name collision.** A command
  whose sanitized wire name equals the getState tool name (e.g. `app.getState` →
  `app_getState`) would emit a duplicate tool (strict hosts reject the entire
  `tools/list`) and silently shadow the command on `tools/call`. Construction now
  throws a clear, actionable error instead.
