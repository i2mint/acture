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
import { isFunctionWhen, isOk } from 'acture';

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
