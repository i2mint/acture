/**
 * `acture-mcp-server` — project an acture registry as an MCP server.
 *
 * Per `acture-schema-bridge` and `acture-tier-system` skills:
 *
 *   - `buildToolsList(registry, { tiers })` returns JSON-Schema tool
 *     descriptors for the MCP `tools/list` response. Tier filter
 *     defaults to `['stable']`. `@internal` is never emitted.
 *     `@deprecated` descriptions are prefixed with `[DEPRECATED — ...]`.
 *
 *   - `callTool(registry, name, args, ctx?)` dispatches through the
 *     registry and returns an MCP-compatible response (errors-as-data).
 *
 *   - `createMcpServer(registry, options)` wraps the
 *     `@modelcontextprotocol/sdk` `Server` and registers
 *     ListTools / CallTool handlers. Sends `notifications/tools/list_changed`
 *     when the registry's tier-filtered view changes.
 *
 *   - `connectStdio(server)` is a thin convenience over the SDK's
 *     stdio transport — for the common Node-side path.
 *
 *   - `buildResourcesList(views, opts)` / `readResource(views, uri)` project
 *     the READ side — `ViewSource` (typed selectors over app state) as MCP
 *     resources, so an assistant can see current state before it acts. Wire
 *     them via `createMcpServer(registry, { views })`, which adds
 *     `resources/list` + `resources/read` + `resources/subscribe`. Omit
 *     `views` for a tools-only server (unchanged).
 *
 *   - `buildGetStateTool(views, opts)` / `callGetState(views, args)` are the
 *     portable read-side hedge — a single read-only `getState` tool for
 *     tools-only hosts that don't support MCP resources (Cursor, or a direct
 *     Anthropic/Vercel projection). Enable on the server via
 *     `createMcpServer(registry, { views, getStateTool: true })`.
 */

export {
  buildToolsList,
  callTool,
  formatToolResponse,
} from './tools.js';
export type {
  BuildToolsListOptions,
  McpToolDescriptor,
  McpToolAnnotations,
  CallToolResponse,
} from './tools.js';

export {
  createMcpServer,
  connectStdio,
} from './server.js';
export type { CreateMcpServerOptions } from './server.js';

export {
  buildResourcesList,
  readResource,
  viewIdToUri,
  buildGetStateTool,
  callGetState,
  DEFAULT_RESOURCE_PREFIX,
  DEFAULT_GET_STATE_TOOL_NAME,
} from './resources.js';
export type {
  ViewSource,
  ResourceView,
  McpResourceDescriptor,
  BuildResourcesListOptions,
  ResourceContents,
  GetStateToolOptions,
  GetStateResponse,
} from './resources.js';
