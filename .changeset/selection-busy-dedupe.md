---
"acture": patch
---

`acture/selection`: a `transactionUndo` answering `{ ok: false, reason: 'busy' }` is a failed Undo that can be tried again, not a conflict; an item named twice in a selection is acted on once.
