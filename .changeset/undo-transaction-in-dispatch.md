---
"acture-undo": patch
---

`history.transaction(fn, { join: true })`, called from inside a dispatch (a command's `execute`, as `acture/selection`'s commands do), joins that dispatch's capture instead of throwing "nested transactions are not supported": the dispatch is one undo entry, and the transaction resolves to it (`isApplied` true and `undoEntry` `busy` until the dispatch closes; `null` if the capture closed before the callback finished). Without `join` it still throws. The README's `acture/selection` wiring passes the seam's `inDispatch` as `join`, and maps `undoEntry`'s `busy` to `false` (a failed Undo, tried again) instead of a permanent conflict.
