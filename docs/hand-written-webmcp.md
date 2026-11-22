# Projecting the registry into WebMCP

**Status:** reference artifact, hand-written path (no `acture-*` dependency beyond the core registry you already have). Follows [`docs/positioning.md`](positioning.md). The worked example is [`examples/drop-in/src/webmcp.ts`](../examples/drop-in/src/webmcp.ts), with its tests beside it. Weighed in [#78](https://github.com/i2mint/acture/issues/78).

## Why

[WebMCP](https://webmachinelearning.github.io/webmcp/) lets a page register tools on `document.modelContext`, so an agent working *inside the user's own tab* (a browser assistant, an extension) can call them with the user's session and no separate process. That is one more door for acture's registry, next to the palette, the hotkeys, `acture-mcp-server` and the AI-SDK tools: the same command records, projected once more.

It does not replace any of them. WebMCP has no palette, no hotkeys, no undo, no telemetry and no tiers; acture keeps those, and WebMCP only adds the in-tab agent.

**Where it stands (November 2026):** a Draft Community Group Report of the W3C Web Machine Learning CG, not on the standards track. Chrome (from 149) and Edge run origin trials; no browser enables it by default, and the API has already moved once (`navigator.modelContext` became `document.modelContext`). So the projection is feature-detected and costs nothing where WebMCP is absent. When a browser enables it outside a trial, this pattern becomes an `acture-webmcp` package.

## The mapping

| `CommandRecord` | WebMCP tool | Notes |
| --- | --- | --- |
| `id` | `name` | WebMCP allows `[A-Za-z0-9_.-]{1,128}`, so dotted ids fit as they are (the MCP server has to sanitise them). |
| `title` | `title` | |
| `description` (else `title`) | `description` | |
| `params` | `inputSchema` | `toJsonSchema(cmd).inputSchema`, the same bridge every other surface uses. |
| `tier` | registered or not | `['stable']` by default, as for the MCP server. `@internal` is never exposed. |
| `when` (evaluated) | registered or not | Function `when`s are never exposed (opaque to an agent), as in `buildToolsList`. Re-sync after the context changes. |
| dispatch | `execute` | `registry.dispatch(id, input, ctx)`: Zod validation and the `when` check run again at call time. An error result is thrown, which WebMCP reports to the agent. |
| (none yet) | `annotations.readOnlyHint`, `consequentialHint` | `CommandRecord` has no field for these (`kind` is `atomic` or `handoff`). Map them once commands can declare them. |

The tool list is the one `acture-mcp-server`'s `buildToolsList` builds for the same tiers and context; the example's test asserts that.

## The code

```ts
import { evaluateWhen, isFunctionWhen, isOk, toJsonSchema } from 'acture';
import type { Context, Registry, Tier } from 'acture';

export function projectToWebMCP(
  registry: Registry,
  { modelContext = (globalThis as any).document?.modelContext, tiers = ['stable'] as readonly Tier[],
    context = {} as Context | (() => Context) } = {},
) {
  if (!modelContext) return { sync: async () => {}, dispose() {} }; // no WebMCP: no-op
  const ctx = () => (typeof context === 'function' ? context() : context);
  const registered = new Map<string, AbortController>(); // aborting a signal unregisters

  async function sync() {
    const want = registry.list({ tiers })
      .filter((cmd) => !isFunctionWhen(cmd.when) && evaluateWhen(cmd.when, ctx()));
    const ids = new Set(want.map((cmd) => cmd.id));
    for (const [id, c] of registered) if (!ids.has(id)) { c.abort(); registered.delete(id); }
    for (const cmd of want) {
      if (registered.has(cmd.id)) continue;
      const c = new AbortController();
      registered.set(cmd.id, c);
      const { inputSchema, description } = toJsonSchema(cmd);
      await modelContext.registerTool({
        name: cmd.id, title: cmd.title, description: description ?? cmd.title, inputSchema,
        async execute(input: unknown) {
          const r = await registry.dispatch(cmd.id, input, ctx());
          if (isOk(r)) return r.value;
          throw new Error(JSON.stringify(r.error));
        },
      }, { signal: c.signal });
    }
  }

  const off = registry.onCommandsChanged(() => void sync());
  void sync();
  return { sync, dispose() { off(); for (const c of registered.values()) c.abort(); registered.clear(); } };
}
```

Call it once at start-up, `projectToWebMCP(registry, { context: () => currentContext() })`, and call `sync()` wherever your when-context changes (the same place the palette re-filters). Registry changes re-sync on their own.

## Before you expose a command to an in-tab agent

- **The agent acts as the user.** Everything it calls runs with the user's session. Keep destructive commands out of the exposed tiers, or gate them with a `when` the agent cannot satisfy, until commands can carry `consequentialHint` and the host asks for confirmation (the `acture-ai-assistant` skill's confirmation gate is the pattern).
- **Handoff commands** (`kind: 'handoff'`): handoff is a palette distinction (the palette closes and opens a form for the params). An agent passes the params itself, so the command runs like any other, validated by the same schema.
- **Trying it today:** the origin trial in Chrome or Edge, or the [`@w3c/webmcp-polyfill`](https://github.com/w3c-oss/webmcp-polyfill) (Apache-2.0, no runtime dependencies, about 95 kB unpacked) in development. Keep the polyfill out of production bundles: the projection works without it, and the browser's own `document.modelContext` will replace it.
