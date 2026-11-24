---
"acture": patch
---

Schema bridge strict mode (`toJsonSchema(record, { strict: true })`) now walks `anyOf`/`oneOf` branches, makes optional keys nullable (every key required, an optional one as "this or null", as its doc said), and flags an open record (`z.record`) instead of closing it. New `fromStrictArgs(args)` removes the `null`s a strict model sends for keys it leaves out, before `dispatch`. Fixes `acture/selection`'s `selection` parameter under OpenAI-style strict tools.
