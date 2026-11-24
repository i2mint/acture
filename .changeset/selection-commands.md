---
"acture": minor
---

New subpath `acture/selection`: selection commands (bulk actions). `liftToSelection` turns a per-item action into a selection action with one Undo for the whole operation (idempotent, still offered for the part done when some items fail); `planSelection` resolves a `Selection` (explicit ids, or a query with include/exclude and `expectedCount`), gates it per item with reasons shown before the click, and decides whether to ask first (the default rule: confirm with the count unless one Undo takes it all back in place; always confirm on a query count drift or hidden targets); `createSelectionCommands` projects the actions as commands that run on the current selection or on a `selection` param, returning `needs-confirmation` until `confirmed: true`. Seams: `resolve`, `key`, `shown`, `policy` (undo-toast's `advise`), `offer` (undo-toast's `offerUndo`), `transaction` (acture-undo's `history.transaction`).
