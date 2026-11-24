---
"acture-undo": minor
---

`transaction(fn)` resolves to the entry it pushed (`null` when it captured nothing), and `undoEntry(entry)` undoes exactly that entry, only while it is the last one applied (`{ ok: false, reason: 'not-on-top' | 'already-undone' | 'unknown' }` otherwise); `isApplied(entry)` says whether it is. An undo toast bound to its own action no longer undoes a later edit. This is what `acture/selection`'s `transactionUndo(entry)` seam needs.
