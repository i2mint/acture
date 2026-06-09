# acture

## 1.3.0

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

## 1.2.1

### Patch Changes

- d225011: Cross-language increment: the **Python companion** ships in this release as a thin MCP-client facade.

  This npm release carries no source change to `packages/core`; the patch bump drives the `scripts/sync-python-version.mjs` step in the release workflow, which keeps the PyPI `acture` distribution at the same version as the npm one. Starting with this version, PyPI `acture` is **no longer a name-reservation placeholder** — it is the real Python client.

  What the Python release adds (PyPI; not in this npm package):

  - `ActureClient` — a `Mapping[str, Command]` facade over an `acture-mcp-server` instance. Connect via stdio (subprocess) or streamable HTTP. Tier filtering happens on the server side; the Python client sees what `acture-mcp-server` published.
  - `Command` — a callable: `await client['cmd.id'](**params)` returns `structuredContent`; `call_raw` returns the raw `CallToolResult`. Schemas exposed as `command.input_schema` for downstream Pydantic codegen by the host project if desired.
  - `ActureError` — errors-as-data across the language boundary. A TS dispatch's `{ ok: false, error }` arrives as a typed exception with `code`, `message`, `command_id`, `details`.
  - Helpers: `acture.stdio_transport`, `acture.http_transport` — async context managers yielding `(read, write)` streams; a custom transport (in-memory channel, WebSocket bridge) just needs the same shape.

  Out of scope for v1 (per `docs/research/acture_research_6`): Pydantic-codegen SDK, OpenAPI emitter, CLI shim, inverse-direction skill kit. Each is post-v1 if real demand surfaces.

  Cross-language semver is in lockstep with the npm `acture` package by the existing `scripts/sync-python-version.mjs` convention; loosening that is a future decision, deliberately not made in this increment.

  Reference: `docs/hand-written-python-client.md` (~50 lines). Consumer skill: `acture-python`.

## 1.2.0

### Minor Changes

- b12aa3b: Core positioning-alignment review: `enableTierWarnings` moves from `acture` core to `acture-devtools`. It is dispatch instrumentation (it wraps `registry.dispatch` to observe it), not a core primitive — structurally identical to `instrumentRegistry`. `acture` core stays the minimal primitive: registry + dispatcher + when-clause DSL + schema bridge + state-adapter interface. Consumers using `enableTierWarnings` should import it from `acture-devtools` instead of `acture`.
