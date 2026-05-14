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
 */

export {
  buildToolsList,
  callTool,
  formatToolResponse,
} from './tools.js';
export type {
  BuildToolsListOptions,
  McpToolDescriptor,
  CallToolResponse,
} from './tools.js';

export {
  createMcpServer,
  connectStdio,
} from './server.js';
export type { CreateMcpServerOptions } from './server.js';
