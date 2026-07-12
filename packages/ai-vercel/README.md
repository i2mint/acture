# acture-ai-vercel

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

Project an [acture](https://npm.im/acture) registry as [Vercel AI SDK](https://sdk.vercel.ai) tool definitions. Drop directly into `streamText({ tools })` / `generateText({ tools })`.

## Install

```sh
pnpm add acture-ai-vercel ai acture zod
```

Requires **AI SDK v5 or later** (`ai@^5 || ^6 || ^7`), where a tool's schema field is
`inputSchema`. For `ai@^4` — which called it `parameters` — use `acture-ai-vercel@1`.
Staying on v4 is not recommended: its final `@ai-sdk/google` predates Gemini 3 and
drops the `thoughtSignature` Gemini 3 requires you to echo back, so multi-step tool
calling fails outright.

## Use

```ts
import { streamText, isStepCount } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { toAITools } from 'acture-ai-vercel';
import { registry } from './registry';

const result = streamText({
  model: anthropic('claude-sonnet-5'),
  tools: toAITools(registry),
  prompt: 'Add three nodes labeled A, B, C and connect them in a triangle.',
  stopWhen: isStepCount(8),
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

## Why convert to JSON Schema (not pass Zod through)?

The AI SDK accepts a Zod schema on `inputSchema` directly, but we convert each
command's `params` up front with Zod 4's native `z.toJSONSchema()` and hand the SDK a
ready schema via `jsonSchema()`.

This keeps the wire schema *ours*: what the model sees is decided here, not by whichever
Zod-to-JSON-Schema converter the SDK happens to bundle. That coupling has already bitten
us once — `ai` v4 shipped a Zod-**v3**-only converter that, given a Zod **v4** schema,
silently emitted `{}`. The model then saw a tool with no parameters and could not call it,
with no error anywhere.

Runtime validation is unaffected. `registry.dispatch` still validates against the original
Zod schema, so refinements JSON Schema cannot express (`z.refine` predicates and friends)
are still enforced on every dispatch — the JSON Schema is only what the model is *shown*.

## See also

- [`acture-schema-bridge`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-schema-bridge/SKILL.md)
- [`acture-tier-system`](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-tier-system/SKILL.md)
- [`acture-mcp-server`](../mcp) — the MCP server counterpart
