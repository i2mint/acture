/**
 * Tool-list construction + dispatch translation. Pure functions — no
 * SDK dependency — so hosts can wire this through any MCP transport
 * (stdio, HTTP, in-browser WebSocket) without forcing a Node import.
 */

import type {
  AnyCommandRecord,
  Context,
  Registry,
  Result,
  Tier,
} from 'acture';
import {
  buildToolNameToIdMap,
  commandIdToToolName,
  isFunctionWhen,
  toJsonSchema,
} from 'acture';

/** MCP tool envelope as understood by `tools/list`. The SDK's exact
 *  type lives in `@modelcontextprotocol/sdk/types.js`; we mirror the
 *  shape here so callers without the SDK on their classpath can
 *  consume this module too. */
export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface BuildToolsListOptions {
  /** Tier filter. Default `['stable']` per research-5. */
  tiers?: readonly Tier[] | 'all';
  /** When true, skip commands whose `when` is a function (function
   *  escape hatches are not exposable to MCP per research-5). Default
   *  is true — exposing opaque availability is unsafe for AI clients. */
  excludeFunctionWhen?: boolean;
}

/** Banner format `[DEPRECATED — <reason>]` is deterministic so downstream
 *  diffs detect deprecation-banner-only changes and skip flagging them as
 *  breaking. Per `acture-tier-system` skill §"What @deprecated does". */
const DEPRECATION_PREFIX_BARE = '[DEPRECATED]';
function deprecationBanner(reason?: string): string {
  return reason && reason.length > 0
    ? `[DEPRECATED — ${reason}]`
    : DEPRECATION_PREFIX_BARE;
}

export function buildToolsList(
  registry: Registry,
  options: BuildToolsListOptions = {},
): McpToolDescriptor[] {
  const excludeFn = options.excludeFunctionWhen ?? true;
  const listOpts: Parameters<Registry['list']>[0] = options.tiers !== undefined
    ? { tiers: options.tiers }
    : undefined;
  const list = registry.list(listOpts);
  const out: McpToolDescriptor[] = [];
  for (const cmd of list) {
    if (excludeFn && isFunctionWhen(cmd.when)) continue;
    out.push(projectCommand(cmd));
  }
  return out;
}

function projectCommand(cmd: AnyCommandRecord): McpToolDescriptor {
  const envelope = toJsonSchema(cmd);
  const description = applyDeprecationPrefix(cmd, envelope.description);
  const out: McpToolDescriptor = {
    // MCP tool names share the OpenAI/Anthropic constraint
    // `^[a-zA-Z0-9_-]{1,64}$`; dotted command ids like `app.search.run`
    // would be rejected by strict MCP clients. Sanitize at the wire
    // boundary (refs #24); dispatch (`callTool`) translates back.
    name: commandIdToToolName(cmd.id),
    inputSchema: envelope.inputSchema,
  };
  if (description !== undefined) out.description = description;
  return out;
}

/** Apply the `@deprecated` banner per `acture-tier-system` §"What
 *  @deprecated does at runtime". Prefix is deterministic so downstream
 *  diffs detect deprecation-banner-only changes and skip flagging them
 *  as breaking. */
function applyDeprecationPrefix(
  cmd: AnyCommandRecord,
  description?: string,
): string | undefined {
  if (cmd.tier !== 'deprecated') return description;
  const base = description ?? '';
  return `${deprecationBanner(cmd.deprecationReason)} ${base}`.trim();
}

/* ───────────────────────── dispatch ────────────────────────────────── */

export interface CallToolResponse {
  /** MCP-conventional content array. We mirror the SDK shape minimally. */
  content: Array<{ type: 'text'; text: string }>;
  /** MCP-conventional flag for "this was an error result". `Result.ok = false`
   *  maps here so the model sees errors as data, not as a tool-call exception. */
  isError?: boolean;
  /** Convenience pass-through of the acture Result. The MCP SDK ignores
   *  unknown top-level fields. */
  _actureResult?: Result<unknown>;
}

/**
 * Dispatch a registered command and return an MCP-shaped response.
 * Errors are reported as `isError: true` content (errors-as-data per
 * `acture-architecture-primer` §"errors as data").
 *
 * `name` may be either the canonical `cmd.id` (e.g. `'app.search.run'`)
 * or the sanitized wire tool name {@link buildToolsList} emits
 * (`'app_search_run'`). The latter is what MCP clients send back on
 * `tools/call` for commands with dotted ids (refs #24). When neither
 * form resolves, the dispatch returns the registry's usual
 * unknown-command error result.
 */
export async function callTool(
  registry: Registry,
  name: string,
  args: unknown,
  ctx?: Context,
): Promise<CallToolResponse> {
  const dispatchId = resolveDispatchId(registry, name);
  const result = await registry.dispatch(dispatchId, args, ctx);
  return formatToolResponse(result);
}

/** Direct id wins; sanitized name falls back to the inverse map. */
function resolveDispatchId(registry: Registry, name: string): string {
  if (registry.has(name)) return name;
  const map = buildToolNameToIdMap(registry.list({ tiers: 'all' }).map((c) => c.id));
  return map[name] ?? name;
}

/** Build an MCP response from an arbitrary acture Result. Exposed for
 *  hosts that want to dispatch directly and pre/post-process. */
export function formatToolResponse(result: Result<unknown>): CallToolResponse {
  if (result.ok) {
    const payload = JSON.stringify(result.value, null, 2);
    return {
      content: [{ type: 'text', text: payload }],
      _actureResult: result,
    };
  }
  const errorPayload = JSON.stringify(
    { code: result.error.code, message: result.error.message, details: result.error.details },
    null,
    2,
  );
  return {
    content: [{ type: 'text', text: errorPayload }],
    isError: true,
    _actureResult: result,
  };
}
