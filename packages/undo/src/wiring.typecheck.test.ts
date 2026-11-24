/** The README's acture/selection wiring, compiled by `tsc` (it is a test file, so it is type-checked with the package) and used by `selection.integration.test.ts`. */
import { describe, expect, it } from 'vitest';
import type { SelectionSeams } from 'acture/selection';
import type { UndoHistory } from './undo.js';

type Item = { id: string };

export const undoSeamsFor = (history: UndoHistory): Pick<SelectionSeams<Item>, 'transaction' | 'transactionUndo'> => ({
  // Resolves to the entry, or null (nothing to undo). A selection command runs inside its own
  // dispatch: join that dispatch's capture rather than throw "nested transactions".
  transaction: (fn, { inDispatch }) => history.transaction(fn, { join: inDispatch }),
  transactionUndo: (entry) => {
    const r = history.undoEntry(entry);
    if (r.ok || r.reason === 'already-undone') return undefined; // Cmd/Ctrl+Z already took it: restored
    if (r.reason === 'busy') return false; // another change is still in flight: a failure, tried again
    return 'conflict'; // a later edit is on top, or the entry is gone: left as it is
  },
});

describe('the README wiring', () => {
  it('type-checks against SelectionSeams', () => expect(typeof undoSeamsFor).toBe('function'));
});
