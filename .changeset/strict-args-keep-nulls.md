---
"acture": patch
---

`fromStrictArgs(args, params)` keeps a real `null` under a `z.record` (walked with its value schema) and inside a union (the branch whose stripped value parses decides; when none does, nulls are kept), so a selection query `{ owner: null }` no longer turns into "match everything". A `null` is dropped only where an object shape says the key is optional and not nullable. Without `params`, every `null` key is still removed.
