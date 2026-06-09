/**
 * `acture-sandbox` — the isolation seam for an extension system: ONE
 * `ExtensionRunner` port plus an in-process (no-isolation) transport.
 *
 *     import { createInProcessRunner } from 'acture-sandbox';
 *
 *     const runner = createInProcessRunner();
 *     const r = await runner.load(
 *       { id: 'acme.csv', module: csvExtension },
 *       hostBridge,                          // host-defined capabilities
 *     );
 *     if (r.ok) {
 *       // csvExtension.activate(hostBridge) has run; r.value.id === 'acme.csv'
 *     }
 *     await runner.dispose('acme.csv');       // runs deactivate(), forgets it
 *
 * This package is ISOLATION ONLY. It deliberately does NOT ship the manifest
 * schema, the host/loader, the effect channel, capability grants, or an
 * entitlement store — those are a ~15-line core-only pattern documented in
 * `docs/hand-written-sandbox.md`, and host product architecture
 * (research-9 §6.3, §7). Bundling them would be the god-package hard-don't #2.
 *
 * The in-process transport is NOT a security boundary — it is the v1 adapter
 * for TRUSTED authors. When an untrusted author appears, add a real isolating
 * transport behind the same `ExtensionRunner` port (Web Worker / cross-origin
 * iframe / QuickJS-in-WASM / `isolated-vm`); the host code does not change.
 *
 * The hand-written equivalent of the host/loader that drives this runner —
 * what an agent would write into the target project — is
 * `docs/hand-written-sandbox.md`. Design source:
 * `docs/research/acture_research_9 -- Extensions and Plugin Systems.md`.
 */

export { createInProcessRunner } from './in-process-runner.js';
export type {
  ActivationHandle,
  ExtensionModule,
  ExtensionRunner,
  ExtensionSource,
  HostBridge,
  LoadedExtension,
} from './runner.js';
