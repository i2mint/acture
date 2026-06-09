/**
 * The `ExtensionRunner` isolation port and its data contract.
 *
 * This is the single accelerator `acture-sandbox` exists for (research-9 §1,
 * §6.1): isolating the execution of code you did not author. Everything here
 * is transport-agnostic — `load` / `dispose` are async and return
 * errors-as-data because a cross-boundary transport (Web Worker, cross-origin
 * iframe, QuickJS-in-WASM, Node `isolated-vm`) is asynchronous and cannot
 * transport thrown exceptions. The in-process adapter holds the identical
 * contract, so moving in-process → isolated is an adapter swap, not a redesign
 * (research-9 §3.3, §4.6: "design for the worst runtime; the local case is
 * then trivial").
 *
 * What this file deliberately does NOT define: the manifest schema, the
 * host/loader, the effect channel, capability grants, an entitlement store, a
 * marketplace. Those are a ~15-line core-only pattern (`docs/hand-written-sandbox.md`)
 * and host product architecture (research-9 §6.3, §7) — not package territory
 * (hard-don't #2: no god-package; hard-don't #3: translate, don't decide).
 */

import type { Result } from 'acture';

/**
 * The host capabilities handed to an extension at activation. OPAQUE to the
 * runner by design: the in-process adapter passes it by reference; a future
 * isolating adapter proxies it across the membrane as a capability-gated
 * channel. The runner never inspects it — *what* an extension may touch is
 * host policy (e.g. a facade over `registry.dispatch`), never the runner's call.
 */
export type HostBridge = unknown;

/**
 * What an extension exposes to the runner: an `activate` entrypoint the runner
 * invokes once at load, mirroring VS Code's activate/deactivate lifecycle. Its
 * returned handle (if any) is invoked on dispose.
 */
export interface ExtensionModule {
  activate(
    bridge: HostBridge,
  ): ActivationHandle | void | Promise<ActivationHandle | void>;
}

/** Returned by `activate` to register teardown. Optional — a pure extension
 *  that acquires nothing needs no `deactivate`. */
export interface ActivationHandle {
  deactivate?(): void | Promise<void>;
}

/**
 * How a runner obtains an extension's module. Discriminated and open by
 * design: the in-process adapter accepts a direct `module` reference or an
 * `import` thunk; cross-boundary transports add their own variants (a URL, a
 * source blob, a bundle hash) WITHOUT changing the port.
 */
export type ExtensionSource =
  | { readonly id: string; readonly module: ExtensionModule }
  | {
      readonly id: string;
      readonly import: () => Promise<
        ExtensionModule | { default: ExtensionModule }
      >;
    };

/** A live handle to a loaded extension. */
export interface LoadedExtension {
  readonly id: string;
}

/**
 * The isolation seam — one port, swappable transports.
 *
 * Errors-as-data (`acture`'s `Result`) and async on purpose: the contract is
 * byte-identical whether the extension runs in this realm or behind a
 * membrane. An implementation NEVER throws across `load` / `dispose`.
 */
export interface ExtensionRunner {
  /** Load and activate an extension. Returns the live handle, or an error
   *  datum (`already_loaded`, `load_failed`, `activate_threw`). */
  load(
    source: ExtensionSource,
    bridge?: HostBridge,
  ): Promise<Result<LoadedExtension>>;

  /** Deactivate and unload. Returns an error datum (`not_loaded`,
   *  `deactivate_threw`); the extension is removed from `loaded()` regardless
   *  of whether `deactivate` threw. */
  dispose(id: string): Promise<Result<void>>;

  /** The ids currently loaded, in load order. */
  loaded(): readonly string[];
}
