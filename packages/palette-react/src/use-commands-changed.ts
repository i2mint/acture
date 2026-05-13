/**
 * Subscribe to a registry's `commandsChanged` event from inside React.
 *
 * Returns a monotonically-incrementing `revision` integer that changes
 * whenever a command is added or removed. Useful as a key for
 * `useMemo` over the command list.
 */

import { useEffect, useState } from 'react';
import type { Registry } from 'acture';

export function useCommandsChanged(registry: Registry): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    return registry.onCommandsChanged(() => setRevision((n) => n + 1));
  }, [registry]);
  return revision;
}
