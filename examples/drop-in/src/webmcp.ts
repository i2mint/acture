/**
 * WebMCP projection: the registry's commands as tools on `document.modelContext`,
 * so an agent in the user's own browser tab can call them. Hand-written path over
 * acture core only; see docs/hand-written-webmcp.md.
 *
 * Feature-detected: without WebMCP (no browser ships it on by default yet) it is a
 * no-op. It lists the same commands `acture-mcp-server`'s `buildToolsList` would
 * for the same tiers and context, and every call goes through `registry.dispatch`,
 * so params are validated and `when` is checked again at call time.
 */
import { evaluateWhen, isFunctionWhen, isOk, toJsonSchema } from 'acture';
import type { AnyCommandRecord, Context, Registry, Tier } from 'acture';

/** The part of the WebMCP `ModelContext` interface this projection uses. */
export interface ModelContextLike {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (input: unknown) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ): unknown;
}

export interface WebMcpOptions {
  /** Where to register. Default: `document.modelContext` when the browser has it. */
  modelContext?: ModelContextLike;
  /** Tier filter, as for the MCP server. Default `['stable']`. */
  tiers?: readonly Tier[] | 'all';
  /** The when-clause context, read on every sync and every call. */
  context?: Context | (() => Context);
}

export interface WebMcpProjection {
  /** Re-register to match the registry and the current context. Call it after
   *  the context changes; registry changes re-sync on their own. */
  sync(): Promise<void>;
  /** Unregister every tool and stop following the registry. */
  dispose(): void;
}

function defaultModelContext(): ModelContextLike | undefined {
  const doc = (globalThis as { document?: { modelContext?: ModelContextLike } }).document;
  return doc?.modelContext;
}

export function projectToWebMCP(
  registry: Registry,
  options: WebMcpOptions = {},
): WebMcpProjection {
  const modelContext = options.modelContext ?? defaultModelContext();
  if (!modelContext) return { sync: async () => {}, dispose() {} };
  const tiers = options.tiers ?? ['stable'];
  const readContext = (): Context =>
    typeof options.context === 'function' ? options.context() : (options.context ?? {});
  const registered = new Map<string, AbortController>();

  const wanted = (): AnyCommandRecord[] => {
    const ctx = readContext();
    // As buildToolsList: function `when`s are opaque to an agent and never exposed.
    return registry
      .list({ tiers })
      .filter((cmd) => !isFunctionWhen(cmd.when) && evaluateWhen(cmd.when, ctx));
  };

  async function sync(): Promise<void> {
    const want = wanted();
    const ids = new Set(want.map((cmd) => cmd.id));
    for (const [id, controller] of registered) {
      if (!ids.has(id)) {
        controller.abort(); // WebMCP unregisters a tool when its signal aborts
        registered.delete(id);
      }
    }
    for (const cmd of want) {
      if (registered.has(cmd.id)) continue;
      const controller = new AbortController();
      registered.set(cmd.id, controller);
      const { inputSchema, description } = toJsonSchema(cmd);
      await modelContext!.registerTool(
        {
          name: cmd.id, // WebMCP allows [A-Za-z0-9_.-]{1,128}: dotted ids fit as they are
          title: cmd.title,
          description: description ?? cmd.title,
          inputSchema,
          async execute(input) {
            const result = await registry.dispatch(cmd.id, input, readContext());
            if (isOk(result)) return result.value;
            throw new Error(JSON.stringify(result.error));
          },
        },
        { signal: controller.signal },
      );
    }
  }

  const off = registry.onCommandsChanged(() => void sync());
  void sync();
  return {
    sync,
    dispose() {
      off();
      for (const controller of registered.values()) controller.abort();
      registered.clear();
    },
  };
}
