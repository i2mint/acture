---
'acture': minor
---

`params` is now typed structurally: anything with a `safeParse` returning `{ success, data }` or `{ success, error: { issues } }` satisfies `ParamSchema<P>`, so `acture/lite` pages can pass a hand-written guard with no cast and no Zod types. Zod schemas still satisfy it. The schema bridge and the full entry's `defineCommand` checks still need Zod.
