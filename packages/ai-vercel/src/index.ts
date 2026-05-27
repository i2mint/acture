/**
 * `acture-ai-vercel` — project an acture registry as Vercel AI SDK
 * tool definitions.
 *
 * Each command's Zod `params` schema is converted to a JSON Schema (with
 * Zod 4's native `z.toJSONSchema()`) and handed to the AI SDK via
 * `jsonSchema()` — see `toParameterSchema` for why the conversion cannot
 * be left to the SDK. Runtime validation is unaffected: `registry.dispatch`
 * still validates against the original Zod schema, so refinements a JSON
 * Schema cannot express (e.g. `z.refine` predicates) are still enforced.
 *
 * **Tool-name sanitization.** The returned record is keyed by a wire-safe
 * tool name (per OpenAI / Anthropic's shared `^[a-zA-Z0-9_-]{1,64}$`
 * constraint), produced by `commandIdToToolName(cmd.id)`. Dotted ids like
 * `app.search.run` therefore reach the model as `app_search_run` — the
 * raw form is rejected by both providers (refs #24). Each tool's
 * `execute` closes over the original `cmd.id`, so dispatch and any
 * `onDispatched` callback always see the canonical id; only the name on
 * the wire is rewritten. Use {@link toToolNameMap} to recover the
 * `cmd.id` from a tool-call's reported name (for traces / macros / UI).
 *
 * Tier filter and deprecation banners mirror `acture-mcp-server`.
 */

import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Tier,
} from 'acture';
import {
  buildToolNameToIdMap,
  commandIdToToolName,
  isFunctionWhen,
  isOk,
} from 'acture';

/** See `acture-mcp-server` tools.ts: identical banner format. */
const DEPRECATION_PREFIX_BARE = '[DEPRECATED]';
function deprecationBanner(reason?: string): string {
  return reason && reason.length > 0
    ? `[DEPRECATED — ${reason}]`
    : DEPRECATION_PREFIX_BARE;
}

export interface ToAIToolsOptions {
  /** Tier filter. Default `['stable']`. */
  tiers?: readonly Tier[] | 'all';
  /** Skip commands with function-form when-clause. Default true. */
  excludeFunctionWhen?: boolean;
  /** Static context forwarded to every dispatch. */
  context?: Context;
  /** Called after each dispatch — useful for logging tool-call results.
   *  Receives the original `AnyCommandRecord` (with the canonical `cmd.id`,
   *  not the sanitized tool name). */
  onDispatched?: (cmd: AnyCommandRecord, result: unknown) => void;
}

/**
 * Project the registry into `Record<string, Tool>` ready for
 * `streamText({ tools: ... })`.
 *
 * Keys are wire-safe tool names (see module doc / refs #24). Use
 * {@link toToolNameMap} to recover the original `cmd.id` from a tool-call's
 * reported name. Both functions apply the same tier + when filter so a key
 * present in the record always has a corresponding entry in the map.
 */
export function toAITools(
  registry: Registry,
  options: ToAIToolsOptions = {},
): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const cmd of selectCommands(registry, options)) {
    out[commandIdToToolName(cmd.id)] = projectCommand(registry, cmd, options);
  }
  return out;
}

/**
 * Build a `{ toolName: cmd.id }` map for the same commands {@link toAITools}
 * would project under `options`.
 *
 * When the model dispatches a tool call by name, the AI SDK reports the
 * **sanitized** wire name (e.g. `'app_search_run'`). Look it up here to
 * recover the original `cmd.id` (`'app.search.run'`) for traces, the
 * command palette, telemetry, or macro replay.
 *
 * @example
 * const tools = toAITools(registry);
 * const nameToId = toToolNameMap(registry);
 * // …after streamText emits a tool-call event with `toolName`:
 * const cmdId = nameToId[toolName] ?? toolName;
 */
export function toToolNameMap(
  registry: Registry,
  options: ToAIToolsOptions = {},
): Record<string, string> {
  return buildToolNameToIdMap(selectCommands(registry, options).map((c) => c.id));
}

function selectCommands(
  registry: Registry,
  options: ToAIToolsOptions,
): readonly AnyCommandRecord[] {
  const excludeFn = options.excludeFunctionWhen ?? true;
  const listOpts: Parameters<Registry['list']>[0] =
    options.tiers !== undefined ? { tiers: options.tiers } : undefined;
  const list = registry.list(listOpts);
  return excludeFn ? list.filter((cmd) => !isFunctionWhen(cmd.when)) : list;
}

/**
 * Project a command's Zod `params` to a JSON Schema the AI SDK can send
 * to the model.
 *
 * The AI SDK's `tool({ parameters })` *accepts* a Zod schema, but `ai`
 * v4 converts it internally with `zod-to-json-schema`, which understands
 * only Zod **v3**'s internals. Given a Zod **v4** schema it silently
 * emits an empty `{}` — the model then sees a tool with no parameters
 * and cannot supply arguments. So we convert up front with Zod 4's
 * native `z.toJSONSchema()` and hand the SDK a ready JSON Schema via
 * `jsonSchema()`. A command with no `params` projects to an empty object
 * schema.
 */
function toParameterSchema(
  params: AnyCommandRecord['params'],
): ReturnType<typeof jsonSchema> {
  const zodParams = (params ?? z.object({})) as z.ZodType<unknown>;
  return jsonSchema(
    z.toJSONSchema(zodParams) as Parameters<typeof jsonSchema>[0],
  );
}

function projectCommand(
  registry: Registry,
  cmd: AnyCommandRecord,
  options: ToAIToolsOptions,
): Tool {
  const description = applyDeprecationPrefix(cmd, cmd.description);
  return tool({
    description: description ?? cmd.title,
    parameters: toParameterSchema(cmd.params),
    execute: async (args: unknown) => {
      // `cmd.id` (not the sanitized wire name) is what the registry
      // dispatches on — sanitization is a wire-format concern, not a
      // dispatch concern.
      const result = await registry.dispatch(cmd.id, args, options.context);
      options.onDispatched?.(cmd, result);
      // The AI SDK serializes whatever execute returns to JSON in the
      // tool-result message. Pass the Result through unchanged — the
      // model sees the same `{ ok, value | error }` shape on every
      // surface (errors-as-data per architecture-primer).
      if (isOk(result)) return { ok: true, value: result.value };
      return { ok: false, error: result.error };
    },
  });
}

function applyDeprecationPrefix(
  cmd: AnyCommandRecord,
  description?: string,
): string | undefined {
  if (cmd.tier !== 'deprecated') return description;
  const base = description ?? '';
  return `${deprecationBanner(cmd.deprecationReason)} ${base}`.trim();
}
