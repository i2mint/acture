---
'acture-ai-vercel': patch
---

`toAITools` now converts each command's Zod `params` to a JSON Schema with Zod 4's native `z.toJSONSchema()` before handing it to the AI SDK's `tool()`, instead of passing the Zod schema through.

The Vercel AI SDK (`ai` v4) converts a passed-through Zod schema internally with `zod-to-json-schema`, which understands only Zod **v3**'s internals. Given a Zod **v4** schema it silently emitted an empty `{}` — so every projected tool reached the model with no parameters and the model could not supply arguments. Runtime validation is unchanged: `registry.dispatch` still validates against the original Zod schema, so refinements a JSON Schema cannot express are still enforced.
