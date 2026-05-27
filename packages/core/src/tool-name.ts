/**
 * Command-id ↔ wire-safe tool-name translation.
 *
 * `acture` command ids are conventionally dotted (`app.search.run`) — that
 * shape carries scope information and reads well in code. But every LLM
 * tool-calling consumer (OpenAI, Anthropic, MCP) constrains the on-the-wire
 * tool/function name to a single regex:
 *
 *   ^[a-zA-Z0-9_-]{1,64}$
 *
 * Dots are not allowed; lengths over 64 are rejected. Passing a dotted
 * `cmd.id` through to those providers fails the request before the model
 * ever sees the tool.
 *
 * This module provides the canonical `cmd.id → tool name` projection so
 * every adapter package (`acture-ai-vercel`, `acture-mcp-server`, future
 * Anthropic / OpenAI adapters) sanitizes the same way and consumers can
 * recover the original id from the wire name through a single inverse map.
 *
 * Per `acture-architecture-primer`: tool-name shape is a wire concern that
 * belongs at the schema-bridge layer, not in business logic.
 */

/** The pattern OpenAI, Anthropic, and MCP all enforce on tool / function names. */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Max length OpenAI/Anthropic/MCP accept for a tool / function name. */
export const TOOL_NAME_MAX_LENGTH = 64;

/**
 * Project a command id to a wire-safe tool name.
 *
 * The transform is:
 *
 * 1. Any character outside `[a-zA-Z0-9_-]` is replaced by `_`. In practice
 *    this is the dot in dotted ids (`app.search.run` → `app_search_run`).
 * 2. If the result is longer than {@link TOOL_NAME_MAX_LENGTH}, it is
 *    truncated and a short stable suffix (8 hex chars derived from the
 *    original id) is appended, so two long ids that share a prefix do not
 *    collide.
 *
 * The function is **idempotent** on names that already match
 * {@link TOOL_NAME_PATTERN}: a safe id passes through unchanged.
 *
 * @example
 * commandIdToToolName('app.search.run');  // → 'app_search_run'
 * commandIdToToolName('already_safe-id'); // → 'already_safe-id'
 */
export function commandIdToToolName(id: string): string {
  if (TOOL_NAME_PATTERN.test(id)) return id;
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (sanitized.length <= TOOL_NAME_MAX_LENGTH) return sanitized;
  // Collision-resistant truncation: keep enough prefix to remain readable,
  // append a short stable suffix derived from the full original id.
  const suffix = shortHash(id);
  const head = sanitized.slice(0, TOOL_NAME_MAX_LENGTH - suffix.length - 1);
  return `${head}_${suffix}`;
}

/**
 * Build a reverse map `{ toolName: commandId }` for an iterable of ids.
 *
 * Pass `registry.list().map(c => c.id)` to recover original ids from the
 * tool names the model called. If two distinct ids project to the same
 * tool name (extremely rare — only on length-collision past 64 chars
 * past truncation), the **second** wins and a warning is logged via
 * the optional `onCollision` callback.
 */
export function buildToolNameToIdMap(
  ids: Iterable<string>,
  onCollision?: (toolName: string, firstId: string, secondId: string) => void,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of ids) {
    const name = commandIdToToolName(id);
    if (name in map && map[name] !== id) {
      onCollision?.(name, map[name]!, id);
    }
    map[name] = id;
  }
  return map;
}

/** 8-hex-char FNV-1a-style hash. Stable, deterministic, dependency-free. */
function shortHash(s: string): string {
  // FNV-1a 32-bit. Sufficient for collision-avoidance on a per-registry
  // basis (handful of overlapping prefixes, not cryptographic).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned, hex-encode, left-pad to 8.
  return (h >>> 0).toString(16).padStart(8, '0');
}
