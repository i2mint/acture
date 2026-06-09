/**
 * The in-process (no-isolation) `ExtensionRunner` transport — the v1 adapter
 * for TRUSTED authors (research-9 §3.5).
 *
 * It runs an extension's `activate` in the SAME realm, passing the host bridge
 * by reference. It contains nothing — an extension can do anything its bridge
 * allows. Its job is to establish the async, errors-as-data lifecycle so that a
 * real isolating transport (Web Worker, cross-origin iframe, QuickJS-in-WASM,
 * Node `isolated-vm`) is an adapter swap behind the same port, not a redesign.
 *
 * It is NOT a security boundary. The moment an author is untrusted, swap in an
 * isolating runner — that is the single trigger for the isolation transports
 * (research-9 §0). Admitting untrusted code through this adapter is the one
 * irreversible mistake.
 */

import { ok, err } from 'acture';
import type {
  ActivationHandle,
  ExtensionModule,
  ExtensionRunner,
  ExtensionSource,
  HostBridge,
} from './runner.js';

/** Resolve a source to its module, normalising an `import` thunk's optional
 *  `default` export (ESM dynamic-import shape). */
async function resolveModule(source: ExtensionSource): Promise<ExtensionModule> {
  if ('module' in source) return source.module;
  const imported = await source.import();
  return 'default' in imported ? imported.default : imported;
}

/** Best-effort human message from an unknown thrown value (errors don't
 *  survive a serialization boundary; the in-process adapter keeps the same
 *  errors-as-data discipline a cross-boundary one is forced into). */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Create an in-process extension runner. Each `load` activates an extension in
 * this realm and tracks it by id; `dispose` deactivates and forgets it.
 */
export function createInProcessRunner(): ExtensionRunner {
  const active = new Map<string, ActivationHandle>();

  return {
    async load(source: ExtensionSource, bridge?: HostBridge) {
      if (active.has(source.id)) {
        return err(
          'already_loaded',
          `Extension "${source.id}" is already loaded.`,
        );
      }

      let module: ExtensionModule;
      try {
        module = await resolveModule(source);
      } catch (error) {
        return err('load_failed', describe(error), error);
      }

      let handle: ActivationHandle | void;
      try {
        handle = await module.activate(bridge);
      } catch (error) {
        return err('activate_threw', describe(error), error);
      }

      active.set(source.id, handle ?? {});
      return ok({ id: source.id });
    },

    async dispose(id: string) {
      const handle = active.get(id);
      if (!handle) {
        return err('not_loaded', `Extension "${id}" is not loaded.`);
      }

      // Forget it first, so a throwing `deactivate` cannot leave a
      // half-disposed entry that can never be loaded or disposed again.
      active.delete(id);
      try {
        await handle.deactivate?.();
      } catch (error) {
        return err('deactivate_threw', describe(error), error);
      }
      return ok(undefined as void);
    },

    loaded() {
      return [...active.keys()];
    },
  };
}
