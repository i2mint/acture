# acture-mcp-server

## 1.3.0

### Minor Changes

- e58263e: Add a read-only **`getState` tool** — the portable read-side hedge for tools-only
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

## 1.2.0

### Minor Changes

- a78169a: Add a read-side **MCP resources** projection — the state-exposure half of an
  "operate my app" AI assistant (research-11 §3). Where `buildToolsList` projects
  commands (actions) to MCP tools, the new `buildResourcesList` / `readResource`
  project **views** (typed selectors over app state) to MCP resources, so a model
  can _see_ current state before it acts.

  - **Pure layer (`resources.ts`, no SDK dependency):** `buildResourcesList(views, opts)`,
    `readResource(views, uri)`, `viewIdToUri`, and the `ViewSource` interface —
    mirroring the hand-written `ViewRegistry` (`list` / `read` / `onStateChanged`)
    from `docs/hand-written-view-registry.md`. Tier-filtered like tools (`internal`
    never projected); a `ViewSource` supplies the state, so acture-mcp stays
    state-library-agnostic.
  - **Server glue (`createMcpServer`):** a new optional `views` option wires
    `resources/list` + `resources/read`, advertises the `resources` capability, and
    wires `resources/subscribe` liveness to the source's `onStateChanged`
    (`notifications/resources/updated`). Omit `views` for a tools-only server — the
    default is unchanged, fully backward-compatible.

  Additive only; no change to the existing tools projection.

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
