/**
 * `@acture/ai-vercel` — project an acture registry as Vercel AI SDK
 * tool definitions.
 *
 * The Vercel AI SDK's `tool({ description, parameters, execute })`
 * accepts Zod schemas directly, so this adapter passes `record.params`
 * through without re-projection — preserving validators that JSON
 * Schema would silently drop (e.g., `z.refine` predicates).
 *
 * Tier filter and deprecation banners mirror `@acture/mcp`.
 */

import { tool } from 'ai';
import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Tier,
} from 'acture';
import { isFunctionWhen, isOk } from 'acture';

/** See `@acture/mcp` tools.ts: identical banner format. */
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
  /** Called after each dispatch — useful for logging tool-call results. */
  onDispatched?: (cmd: AnyCommandRecord, result: unknown) => void;
}

/**
 * Project the registry into `Record<string, Tool>` ready for
 * `streamText({ tools: ... })`.
 */
export function toAITools(
  registry: Registry,
  options: ToAIToolsOptions = {},
): Record<string, Tool> {
  const excludeFn = options.excludeFunctionWhen ?? true;
  const listOpts: Parameters<Registry['list']>[0] = options.tiers !== undefined
    ? { tiers: options.tiers }
    : undefined;
  const list = registry.list(listOpts);

  const out: Record<string, Tool> = {};
  for (const cmd of list) {
    if (excludeFn && isFunctionWhen(cmd.when)) continue;
    out[cmd.id] = projectCommand(registry, cmd, options);
  }
  return out;
}

function projectCommand(
  registry: Registry,
  cmd: AnyCommandRecord,
  options: ToAIToolsOptions,
): Tool {
  const description = applyDeprecationPrefix(cmd, cmd.description);
  // The AI SDK requires a parameters schema. Use an empty object schema
  // when the command takes no params.
  const parameters = (cmd.params ?? z.object({})) as z.ZodTypeAny;
  return tool({
    description: description ?? cmd.title,
    parameters,
    execute: async (args: unknown) => {
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
