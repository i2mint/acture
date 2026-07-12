# acture-ai-vercel

## 2.0.0

### Major Changes

- 157948f: Require AI SDK v5+ and project tools onto `inputSchema` (was `parameters`).

  **Breaking:** the `ai` peer range moves from `^4.0.0` to `^5.0.0 || ^6.0.0 || ^7.0.0`.
  Tools are now built with `tool({ inputSchema })`, the field the AI SDK has used since
  v5. Nothing else in the public API changes — `toAITools` and `toToolNameMap` keep their
  signatures, tier filtering, `[DEPRECATED]` banners, wire-safe tool names, and the
  errors-as-data `execute` contract.

  To upgrade, move your app to `ai@^5` (or later) and bump this package. If you must stay
  on `ai@^4`, pin `acture-ai-vercel@1`.

  **Why this is worth the major.** The v4 line is a dead end for Google. Its final
  `@ai-sdk/google` (1.2.22, published months before Gemini 3 shipped) has no representation
  for `thoughtSignature` — it is stripped in the response schema, again when tool calls are
  extracted, and again when the model turn is re-serialized. Gemini 3 _requires_ that
  signature to be echoed back on the first `functionCall` part of each step, and rejects the
  request otherwise:

  > Function call is missing a thought_signature in functionCall parts.

  There is no fix available on v4, and no way to opt out on Gemini 3 — the requirement holds
  even at `thinking_level: minimal`. Support first landed in `@ai-sdk/google@2.0.3`
  (the v5-era line), which round-trips the signature via `providerOptions.google`.

## 1.1.0

### Minor Changes

- 8343c90: Sanitize command ids to wire-safe tool names for LLM tool-calling adapters (refs #24).

  OpenAI, Anthropic, and MCP all constrain tool / function names to `^[a-zA-Z0-9_-]{1,64}$`. The dotted command ids that acture encourages (`app.search.run`, `app.corpus.create`) were emitted verbatim as the tool name, which made every projected tool rejected at request-validation time with e.g.:

  > Invalid `tools[0].function.name`: `app.search.run`. Expected a string that matches the pattern `^[a-zA-Z0-9_-]+$`.

  **`acture` (core)**

  - Added `commandIdToToolName(id)` — pure, idempotent projection that replaces forbidden chars with `_` and truncates with a stable hash suffix past 64 chars.
  - Added `buildToolNameToIdMap(ids)` — inverse map for translating tool-call events back to canonical `cmd.id`.
  - Exported `TOOL_NAME_PATTERN` / `TOOL_NAME_MAX_LENGTH` constants.

  **`acture-ai-vercel`**

  - `toAITools(registry)` now keys its output by the sanitized wire name. Dispatch still uses the canonical `cmd.id` (closed over per tool), so `onDispatched` and the registry's command lookup are unchanged.
  - Added `toToolNameMap(registry, opts)` — `{ toolName: cmd.id }` for the same filter `toAITools` would apply, so consumers can recover the original id from `tool-call` events.

  **`acture-mcp-server`**

  - `buildToolsList(...)` names are sanitized the same way.
  - `callTool(registry, name, ...)` now accepts **either** form: the canonical `cmd.id` or the sanitized wire name an MCP client would echo back on `tools/call`.

## 1.0.1

### Patch Changes

- a2245a5: `toAITools` now converts each command's Zod `params` to a JSON Schema with Zod 4's native `z.toJSONSchema()` before handing it to the AI SDK's `tool()`, instead of passing the Zod schema through.

  The Vercel AI SDK (`ai` v4) converts a passed-through Zod schema internally with `zod-to-json-schema`, which understands only Zod **v3**'s internals. Given a Zod **v4** schema it silently emitted an empty `{}` — so every projected tool reached the model with no parameters and the model could not supply arguments. Runtime validation is unchanged: `registry.dispatch` still validates against the original Zod schema, so refinements a JSON Schema cannot express are still enforced.
