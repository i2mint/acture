---
"acture-undo": patch
---

A `history.transaction` opened inside a dispatch (a command's `execute` calling it, as `acture/selection`'s commands do) joins that dispatch's capture instead of throwing "nested transactions are not supported": the dispatch is one undo entry, and the transaction resolves to it. The README's `acture/selection` wiring maps `undoEntry`'s `busy` to `false` (a failed Undo, tried again) instead of a permanent conflict.
