---
"acture": patch
---

`acture/selection`: an undo that resolves `false` is a failed undo (undo-toast's convention, and what store calls answer): it rejects, so an undo toast shows Try again and the next call runs it again. Before, `false` was kept as done.
