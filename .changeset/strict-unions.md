---
"acture": patch
---

Schema bridge strict mode (`toJsonSchema(record, { strict: true })`) now walks `anyOf`/`oneOf` branches, makes optional keys nullable (every key required, an optional one as "this or null", as its doc said), and flags an open record (`z.record`) instead of closing it. Fixes `acture/selection`'s `selection` parameter under OpenAI-style strict tools.
