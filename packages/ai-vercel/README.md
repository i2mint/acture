# acture-ai-vercel

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

Project an [acture](https://npm.im/acture) registry as [Vercel AI SDK](https://sdk.vercel.ai) tool definitions. Drop directly into `streamText({ tools })` / `generateText({ tools })`.

## Install

```sh
pnpm add acture-ai-vercel ai acture zod
```

## Use

```ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { toAITools } from 'acture-ai-vercel';
import { registry } from './registry';

const result = streamText({
  model: anthropic('claude-sonnet-4-5'),
  tools: toAITools(registry),
  prompt: 'Add three nodes labeled A, B, C and connect them in a triangle.',
  maxSteps: 8,
});

for await (const part of result.fullStream) {
  // ...
}
```

## Tier filter

Default: `{ tiers: ['stable'] }`. Pass `tiers: ['stable', 'experimental']` to expose experimental commands to the model.

## `@deprecated` banners

Description rewrites to `[DEPRECATED] <original>` so the model sees the deprecation before composing tool calls.

## Errors-as-data

Tool `execute` resolves to:

```ts
{ ok: true,  value: ... }        // on success
{ ok: false, error: { code, message, details } }  // on failure
```

The model sees the same shape on every surface (palette, hotkeys, MCP, AI SDK). This is the central guarantee of acture's architecture.

## Why pass Zod through (not JSON Schema)?

The Vercel AI SDK accepts Zod schemas directly. Passing the original schema preserves validators (`z.refine`, `z.transform` constraints on output) that JSON Schema would silently drop. The same registry exposed via `acture-mcp-server` projects through `toJsonSchema` because MCP wants JSON Schema on the wire.

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md)
- [`acture-tier-system`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-tier-system/SKILL.md)
- [`acture-mcp-server`](../mcp) — the MCP server counterpart
