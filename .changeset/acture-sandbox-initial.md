---
"acture-sandbox": minor
---

Initial release of `acture-sandbox` — the isolation seam for an extension system: one `ExtensionRunner` port plus an in-process (no-isolation) transport, with errors-as-data, async lifecycle, and an open `ExtensionSource` so cross-boundary transports (Web Worker / iframe / QuickJS / `isolated-vm`) drop in behind the same port. Isolation-only by design: the host/loader and manifest stay a core-only pattern (see `docs/hand-written-sandbox.md`), never bundled. Per the design in research-9.
