# acture-sandbox

> **acture is a development tool first.** This package is an *optional
> accelerator* — and a deliberately small one. The extension **host/loader** is
> a ~15-line core-only pattern you hand-write (see
> [`docs/hand-written-sandbox.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-sandbox.md)),
> with no `acture-*` dependency. `acture-sandbox` ships only the *one* rung that
> is genuinely hard to hand-write: **isolating code you did not author.** See
> [`docs/positioning.md`](https://github.com/thorwhalen/acture/blob/main/docs/positioning.md).

An extension system is two layers (research-9 §1). The **host/loader** —
load/unload/observe bundles of command contributions — is pattern territory: a
`CommandRecord` already *is* the manifest, so a host that trusts its authors
needs nothing beyond `acture` core. The **isolation layer** — running code you
cannot audit *safely* — is the first acture surface that genuinely earns a
package. `acture-sandbox` is that layer, and nothing else: **one
`ExtensionRunner` port plus an in-process transport.**

The port is async and errors-as-data on purpose. A cross-boundary transport
(Web Worker, cross-origin iframe, QuickJS-in-WASM, Node `isolated-vm`) is
asynchronous and cannot transport thrown exceptions, so the in-process adapter
holds the identical contract. Design for the worst runtime; the local case is
then trivial — and moving in-process → isolated is an adapter swap, not a
rewrite.

> **The in-process transport is not a security boundary.** It is the v1 adapter
> for *trusted* authors. The moment an untrusted author is about to run code,
> swap in a real isolating transport behind the same port. Admitting untrusted
> code through the in-process adapter is the one irreversible mistake.

## Install

```sh
pnpm add acture-sandbox     # `acture` is a peer dependency you already have
```

## Run a trusted extension in-process

```ts
import { createInProcessRunner } from 'acture-sandbox';
import type { Registry } from 'acture';

// The runner treats the bridge as opaque (`HostBridge = unknown`), so the host
// owns its shape and the extension narrows to it. Typically a facade over the
// registry / `dispatch` — what an extension may touch is the host's policy.
interface AppBridge {
  registry: Registry;
}

const csvProfiler = {
  activate(bridge: AppBridge) {
    const unload = bridge.registry.registerAll(/* the extension's commands */);
    return { deactivate: () => unload() };
  },
};

const runner = createInProcessRunner();
const hostBridge: AppBridge = { registry: appRegistry }; // appRegistry = your acture registry

// `bridge` is optional — omit it for a pure extension that acquires nothing,
// and `activate` receives `undefined`.
const loaded = await runner.load({ id: 'acme.csv-profiler', module: csvProfiler }, hostBridge);
if (!loaded.ok) console.error(loaded.error.code, loaded.error.message);

runner.loaded();                              // → ['acme.csv-profiler']
await runner.dispose('acme.csv-profiler');    // runs deactivate(), forgets it
```

Loading is errors-as-data — `load` and `dispose` never throw. Error codes:
`already_loaded`, `load_failed`, `activate_threw` (load) and `not_loaded`,
`deactivate_threw` (dispose). A disposed id can be loaded again.

### Lazy sources

A source can defer its module behind an `import` thunk (unwrapping a `default`
export), so the host can populate the palette / AI tool list from a manifest
*before* the extension's code is fetched:

```ts
await runner.load({
  id: 'acme.lazy',
  import: () => import('./extensions/lazy.js'),
});
```

## What this package is NOT

Isolation only. It deliberately does **not** ship the manifest schema, the
host/loader, an effect channel, capability grants, an entitlement / install
gate, or a marketplace. Those are a core-only pattern
([`docs/hand-written-sandbox.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-sandbox.md))
and host product architecture — documented, never bundled (no god-package; the
package translates, it does not decide). Real isolating transports
(Worker / iframe / QuickJS / `isolated-vm`) arrive one at a time, only when a
real untrusted-author need names them.

## API

| Export | What |
| --- | --- |
| `createInProcessRunner()` | Create an in-process (no-isolation) `ExtensionRunner` for trusted authors. |
| `ExtensionRunner` | The isolation port: `load(source, bridge?)`, `dispose(id)`, `loaded()`. Async, errors-as-data. |
| `ExtensionSource` | `{ id, module }` or `{ id, import }` — how the runner obtains an extension's module (open for future transports). |
| `ExtensionModule` | `{ activate(bridge) }` — the extension's entrypoint, returning an optional `ActivationHandle`. |
| `ActivationHandle` | `{ deactivate?() }` — teardown, invoked on `dispose`. |
| `HostBridge` | The host capabilities handed to `activate`. Opaque to the runner; defined by the host. |
| `LoadedExtension` | `{ id }` — a live handle returned from a successful `load`. |

## See also

- [`docs/hand-written-sandbox.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-sandbox.md) — the ~15-line host/loader you hand-write to drive this runner.
- The `acture-extensions` skill — the agent's guide to adding an extension system to a target project.
- [`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`](https://github.com/thorwhalen/acture/blob/main/docs/research/acture_research_9%20--%20Extensions%20and%20Plugin%20Systems.md) — the design: trust model, isolation table, the effect-as-data seam.
