# acture-mcp-server

## 1.1.0

### Minor Changes

- 8343c90: Sanitize command ids to wire-safe tool names for LLM tool-calling adapters (refs #24).

  OpenAI, Anthropic, and MCP all constrain tool / function names to `^[a-zA-Z0-9_-]{1,64}$`. The dotted command ids that acture encourages (`app.search.run`, `app.corpus.create`) were emitted verbatim as the tool name, which made every projected tool rejected at request-validation time with e.g.:

  > Invalid `tools[0].function.name`: `app.search.run`. Expected a string that matches the pattern `^[a-zA-Z0-9_-]+$`.

  **`acture` (core)**

  - Added `commandIdToToolName(id)` — pure, idempotent projection that replaces forbidden chars with `_` and truncates with a stable hash suffix past 64 chars.
  - Added `buildToolNameToIdMap(ids)` — inverse map for translating tool-call events back to canonical `cmd.id`.
  - Exported `TOOL_NAME_PATTERN` / `TOOL_NAME_MAX_LENGTH` constants.

  **`acture-ai-vercel`**

  - `toAITools(registry)` now keys its output by the sanitized wire name. Dispatch still uses the canonical `cmd.id` (closed over per tool), so `onDispatched` and the registry's command lookup are unchanged.
  - Added `toToolNameMap(registry, opts)` — `{ toolName: cmd.id }` for the same filter `toAITools` would apply, so consumers can recover the original id from `tool-call` events.

  **`acture-mcp-server`**

  - `buildToolsList(...)` names are sanitized the same way.
  - `callTool(registry, name, ...)` now accepts **either** form: the canonical `cmd.id` or the sanitized wire name an MCP client would echo back on `tools/call`.

## 1.0.1

### Patch Changes

- 6d803a5: Pin the MCP protocol-spec version this package is built against (currently `2025-11-25`). New test (`spec-version.test.ts`) asserts the SDK's `LATEST_PROTOCOL_VERSION` matches the pinned expected value and that `SUPPORTED_PROTOCOL_VERSIONS` still contains the older dates we interoperate with — so an SDK upgrade that bumps the spec is caught explicitly and can be evaluated as a deliberate, semver-major refresh of `acture-mcp-server` rather than an accidental transitive-dep pickup. README documents the policy and points at the test's upgrade checklist.
