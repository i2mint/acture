---
"acture-ai-vercel": major
---

Require AI SDK v5+ and project tools onto `inputSchema` (was `parameters`).

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
extracted, and again when the model turn is re-serialized. Gemini 3 *requires* that
signature to be echoed back on the first `functionCall` part of each step, and rejects the
request otherwise:

> Function call is missing a thought_signature in functionCall parts.

There is no fix available on v4, and no way to opt out on Gemini 3 — the requirement holds
even at `thinking_level: minimal`. Support first landed in `@ai-sdk/google@2.0.3`
(the v5-era line), which round-trips the signature via `providerOptions.google`.
