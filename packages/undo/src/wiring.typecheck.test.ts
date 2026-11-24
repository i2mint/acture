/** The README's acture/selection wiring, compiled by `tsc` (it is a test file, so it is type-checked with the package). */
import { describe, expect, it } from 'vitest';
import type { SelectionSeams } from 'acture/selection';
import type { UndoHistory } from './undo.js';

declare const history: UndoHistory;
type Item = { id: string };

export const undoSeams: Pick<SelectionSeams<Item>, 'transaction' | 'transactionUndo'> = {
  transaction: (fn) => history.transaction(fn),
  transactionUndo: (entry) => {
    const r = history.undoEntry(entry);
    return r.ok || r.reason === 'already-undone' ? undefined : 'conflict';
  },
};

describe('the README wiring', () => {
  it('type-checks against SelectionSeams', () => expect(true).toBe(true));
});
