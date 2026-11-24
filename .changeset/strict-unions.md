---
"acture": patch
---

Schema bridge strict mode (`toJsonSchema(record, { strict: true })`) now walks `anyOf`/`oneOf` branches, makes optional keys nullable (every key required, an optional one as "this or null", as its doc said), and flags an open record (`z.record`) instead of closing it. Discriminated unions (`oneOf`) become `anyOf`, `$defs` are walked, optional enums and consts allow null, a root union and a dropped catchall are flagged. New `fromStrictArgs(args, params?)` removes the `null`s a strict model sends for keys it leaves out (guided by the Zod params: a real `.nullable()` null is kept), before `dispatch`. Fixes `acture/selection`'s `selection` parameter under OpenAI-style strict tools.
