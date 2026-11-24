---
"acture": patch
---

`acture/selection`: the `transaction` seam receives `{ inDispatch }` (true when a selection command runs inside its own dispatch, so acture-undo can join it); a `transactionUndo` answering `{ ok: false, reason: 'busy' }` is a failed Undo that can be tried again, not a conflict; an item named twice in a selection is acted on once.
