# The hand-written extension host — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise *true in the code* for the extension / plugin host surface: a developer
can load, unload, and react to bundles of command contributions with **zero
`acture-*` dependency** by hand-writing the ~15-line host below, built entirely
from acture core's existing `registerAll` / `register` / `onCommandsChanged`.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. The short
version: the extension *host/loader* is **pattern territory**, not package
territory. A host that trusts its authors needs no new machinery at all — the
`CommandRecord` already *is* the manifest (research-9 §5). The one rung that
genuinely earns a package is *isolation* — and `acture-sandbox` ships that seam
(the `ExtensionRunner` port + an in-process transport); the real isolating
transports remain deferred until an untrusted author appears (see the next
section).

The doc has the same status, structure, and faithfulness commitment as
[`docs/hand-written-registry.md`](hand-written-registry.md),
[`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md),
[`docs/hand-written-telemetry.md`](hand-written-telemetry.md),
[`docs/hand-written-undo.md`](hand-written-undo.md),
[`docs/hand-written-test-property.md`](hand-written-test-property.md), and
[`docs/hand-written-python-client.md`](hand-written-python-client.md).

---

## Why this is a doc, not a package (and what `acture-sandbox` actually is)

An "extension system" is two layers, and conflating them is the most common
design mistake (research-9 §1):

1. **The host / loader layer** — "load a bundle of command contributions under
   an owner; unload them atomically." This is the ~15-line hand-write below,
   built entirely from core's `registerAll` / `register` / `onCommandsChanged`.
   It stays **pattern-first like every other acture surface.** A
   `CommandRecord` already *is* the manifest, so a host that trusts its authors
   needs nothing beyond core. The dev-tool-first promise holds *completely* here.

2. **The isolation layer** — running code you cannot audit *safely* (a
   cross-origin iframe, a Web Worker, QuickJS-in-WASM, Node `isolated-vm`).
   **This is the first thing in acture that is genuinely NOT a small
   hand-write** — a correct membrane is real, error-prone, security-sensitive
   engineering. It is the single concern **`acture-sandbox`** ships: an
   `ExtensionRunner` port plus *one* transport adapter at a time — the
   in-process (no-isolation) transport today, a real isolating transport when
   an untrusted author needs one.

So the promise does not break in general — it *bends at exactly one rung*, and
only **once untrusted authors appear.** `acture-sandbox` ships the isolation
*seam* now — the port and the trusted in-process transport — so the contract is
locked and a later isolating transport is an adapter swap, not a redesign. The
security-isolating transports (iframe / Worker / QuickJS-WASM / `isolated-vm`)
stay deferred until a real untrusted-author user names one. (Research-9 §0's
NO-GO was the honest no-named-user default; the maintainer has since decided to
build the isolation-only seam.) This is the same move as
[`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md):
the common path — the host/loader — is a pattern; only the security-sensitive
piece earns a package.

---

## When to hand-write vs. reach for isolation

The host/loader has **no package** — you always hand-write it. The isolation
*seam* is `acture-sandbox`; the deliberate per-project trade is reaching for an
*isolating transport*, which stays deferred until an untrusted author appears:

| | Hand-write the host (this doc) | `acture-sandbox` (the isolation seam) |
| --- | --- | --- |
| What it gives you | load / unload / observe command contributions | the `ExtensionRunner` port to run extensions behind a transport — in-process today, an isolating membrane when you add one |
| Dependency added | none (`acture` core only) | one (`acture-sandbox`); plus a transport-runtime peer (Worker / iframe / QuickJS / `isolated-vm`) when you adopt an isolating transport |
| Code the team owns | ~15 lines, in their repo | only your `HostBridge` shape (and the isolating transport, if you write one) — the port is the package's |
| Trust model it serves | first-party / trusted authors (in-process) | trusted (in-process) today; **untrusted** once an isolating transport lands |
| Status | available now, core-only | ships now: the port + in-process transport. Isolating transports deferred until a real untrusted-author user (research-9 §0) |
| Maintenance | the team's | acture's |

In-process with no membrane is **genuinely sufficient as long as authors are
trusted** — it is not merely a default (research-9 §3.5). The moment an
*untrusted* author is about to run code, the membrane choice is forced, and
that is the trigger for an *isolating* `acture-sandbox` transport. Because the
contract is designed for the worst runtime from day one (see "Why each piece"
below), adding a membrane later is an adapter swap, not a rewrite. **The host is
always hand-written; reaching for an isolating transport is a per-project trade,
made deliberately — never a default.**

---

## The minimal extension host

This is a complete, self-contained extension host. Copy it into the target
project (e.g. `src/extension-host.ts`), adapt the names, delete what the project
doesn't need. It has **no dependencies** beyond `acture`'s `Registry` /
`CommandRecord` types (and even those can be locally typed if the project
hand-wrote the registry).

```ts
/* ── The manifest: inert, declarative data ───────────────────────────── */

import type {
  Registry,
  CommandRecord,
  AnyCommandRecord,
  CommandsChangedListener,
} from 'acture';
// or the equivalents you defined in your own hand-written registry.
import { defineCommand } from 'acture';

/** One contributed command's metadata — the `CommandRecord` shape MINUS its
 *  handler. "The CommandRecord IS the manifest" (research-9 §5): an extension
 *  declares command metadata statically and supplies the matching handler at
 *  load time. Do NOT grow this shape to add capability — capability is added
 *  by composition (`undoable(cmd)`…), never by new fields (closed-record rule). */
export type ContributedCommand = Omit<CommandRecord, 'execute'>;

/** Pure declarative data, validated against the host's canonical schemas. It
 *  MUST stay inert: no conditionals, no loops, no computation (hard-don't #1;
 *  VS Code when-clauses are the explicit upper bound). Identity + compatibility
 *  metadata is painful to retrofit — carry it from day one, even first-party. */
export interface ExtensionManifest {
  readonly id: string;          // namespaced, globally unique: "publisher.name"
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;  // host<->extension semver contract (caret, never '*')
  readonly trust: 'first-party' | 'semi-trusted' | 'untrusted';
  readonly contributes: {
    readonly commands?: readonly ContributedCommand[];
  };
}

/** The runtime half: a map from contributed command id to its handler. Kept
 *  separate from the manifest so the manifest's metadata can populate the
 *  palette / AI tool list / MCP `tools/list` WITHOUT executing the extension's
 *  code (dual registration — the safe-by-default posture). */
export type ExtensionModule = Record<string, CommandRecord['execute']>;

/* ── The host: load = registerAll, unload = the returned disposer ─────── */

export interface LoadedExtension {
  readonly id: string;
  /** Unregisters ALL of this extension's contributions atomically.
   *  Enable / disable / uninstall / conflict-resolution all reduce to this. */
  dispose(): void;
}

/**
 * Load an extension: bind each declared command to its handler, then register
 * the whole bundle in one call. `registry.registerAll` returns ONE disposer
 * (`() => void`) that removes the entire batch atomically — that disposer IS
 * the unload primitive. There is no owner bookkeeping to write.
 *
 * Each bound command is run through `defineCommand`, so an extension's
 * contributions get the exact same registration-time validation (id format,
 * JSON-Schema-representable params, …) as first-party commands. A declared
 * command with no matching handler is a manifest/module mismatch — fail loud.
 */
export function loadExtension(
  registry: Registry,
  manifest: ExtensionManifest,
  mod: ExtensionModule,
): LoadedExtension {
  const commands: AnyCommandRecord[] = (manifest.contributes.commands ?? []).map(
    (cmd) => {
      const execute = mod[cmd.id];
      if (!execute) {
        throw new Error(
          `Extension "${manifest.id}" declared command "${cmd.id}" but supplied no handler.`,
        );
      }
      return defineCommand({ ...cmd, execute });
    },
  );
  const dispose = registry.registerAll(commands); // atomic register + unload
  return { id: manifest.id, dispose };
}

/* ── Reacting to change: surfaces refresh, they don't poll ────────────── */

/** Re-expose `registry.onCommandsChanged` so the palette / hotkeys / AI tool
 *  list refresh from `registry.list()` whenever extensions load or unload.
 *  Returns an unsubscribe thunk. React to events — never poll the registry. */
export function onExtensionsChanged(
  registry: Registry,
  listener: CommandsChangedListener,
): () => void {
  return registry.onCommandsChanged(listener);
}
```

That's the whole host. ~15 lines of logic, zero dependencies beyond `acture`
core, owned by the project.

The manifest is **pure declarative data** — here is the inert shape an
extension ships (a trimmed `extension.json`); no conditionals, no loops, no
code (hard-don't #1):

```jsonc
{
  "id": "publisher.csv-profiler",     // namespaced identity (globally unique)
  "name": "CSV Profiler",
  "version": "1.2.3",
  "apiVersion": "^1.0.0",             // host<->extension compatibility contract
  "trust": "first-party",             // first-party | semi-trusted | untrusted
  "contributes": {
    "commands": [
      {
        "id": "publisher.csv-profiler.run",
        "title": "Profile CSV",       // CommandRecord uses `title` (not `label`)
        "category": "Data",
        "when": "app.datasetLoaded",  // the DSL upper bound — still inert data
        "keybinding": "$mod+p"        // tinykeys DSL string, per CommandRecord
      }
    ]
  }
}
```

---

## Why each piece is shaped this way

These are not stylistic choices — each one defends against a documented failure
mode. Keep them when you adapt the code.

- **`registerAll` *is* the owner-scoped unload primitive.** An extension's
  contributions register as one batch; the single disposer it returns
  unregisters them all atomically (core emits one `disposeAll` change event).
  Enable / disable / uninstall / conflict-resolution all reduce to calling that
  disposer. You do not write owner bookkeeping — core already groups the batch.
  (Need per-command disposal? `register` returns one `() => void` per command;
  collect them in an array and call each — `disposers.forEach((d) => d())`.)

- **The `CommandRecord` IS the manifest — do NOT add fields to `CommandRecord`
  to support extensions.** Capability is added by composition (`undoable(cmd)`,
  `palettable(cmd)`), never by growing the record. This is the
  closed-metadata-surface principle (`acture-command-record-shape`): the
  contribution unit is a command, and a command's shape is fixed.

- **The manifest stays inert — declarative data, never code.** No conditionals,
  no loops, no inheritance (hard-don't #1, "no conditional logic in command
  metadata"). The `when` DSL is the upper bound of acceptable complexity. A
  manifest you can read without running is a manifest you can show in the
  palette / AI tool list *before* you trust its code.

- **Metadata loads eagerly; handlers load lazily (dual registration).** The
  manifest is data — parse it, validate it, and surface a plugin's commands
  *without executing the plugin*. Bind the handler only when the command is
  about to run (activation). This is the safe-by-default posture and the
  foundation the later isolation layer builds on.

- **Invocation routes through `registry.dispatch` by id — never `eval`, never
  reflective invocation.** A contributed command is a registered command like
  any other: `dispatch` does its normal `Map.get(id)` + schema-validate. An
  unknown id returns `{ ok: false }` and nothing runs. Do not call a handler
  from an attacker-supplied string (hard-don't #5). The registry is the
  security boundary that every acture surface shares.

- **Surfaces consume `onCommandsChanged` and refresh — they never poll.** The
  registry emits `{ reason, added?, removed? }` on every load/unload; the
  palette, hotkeys, and AI tool list re-read `registry.list()` in response.

- **In-process, no membrane, for v1.** This is sufficient *exactly* as long as
  authors are trusted (research-9 §3.5). Because the host already validates the
  manifest as data and dispatches by id, swapping in an isolation transport
  later (when an untrusted author appears) is an adapter change, not a redesign.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears in your project,
not for a hypothetical:

- **The isolation membrane** (cross-origin iframe / Web Worker / QuickJS-WASM /
  `isolated-vm`). This is the part of `acture-sandbox` still deferred — a real
  isolating *transport* behind its `ExtensionRunner` port. Add it only when a
  real **untrusted-author** user surfaces — that is the single trigger
  (research-9 §0). Admitting untrusted code *without* a sandbox is the one
  irreversible mistake; reach for isolation before the first stranger's code runs.

- **The cross-boundary effect channel.** The design exists (research-9 §4) —
  effects-as-data returned across an async, structured-clone-safe seam — but
  in-process direct dispatch is the only adapter you need until a membrane is
  real. (The `ExtensionRunner` port itself ships in `acture-sandbox`; this
  hand-written host doesn't need it while authors are trusted.)

- **Capability / permission enforcement and signed provenance.** `permissions`
  and `signature` are reserved *manifest* hooks, unenforced in v1. A membrane
  contains code; it does not stop exfiltration — pair it with capability gating
  and a provenance posture (signed bundles, pinned versions) when you ship one
  (research-9 §3.2, §3.5).

- **Activation events / true lazy handler loading.** The minimal host loads the
  module eagerly. Defer handler execution behind an `onCommand:` activation
  event when extensions get large enough that eager loading costs you.

- **A marketplace / discovery UI, install gate, or entitlement store.** These
  are **host product architecture**, not host/loader code — documented as a
  *pattern* (the entitlement / 403-vs-409 install gate; research-9 §7), never
  shipped in `acture-sandbox`. Translate, don't decide (hard-don't #3).

When the first untrusted-author user surfaces, that is the trigger for the
`acture-sandbox` isolation package (see
[`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`](research/acture_research_9%20--%20Extensions%20and%20Plugin%20Systems.md));
follow the `acture-consumer-integration` skill for the per-consumer
hand-write-vs-install logic — here it is *hand-write-the-host-always,
install-isolation-only-when-forced*.

---

## Faithfulness note

The shapes here mirror what `acture` core actually exports — `registerAll(cmds)`
and `register(cmd)` each return a bare `() => void` disposer (NOT a
`{ dispose() }` object), `onCommandsChanged(listener)` returns an unsubscribe
thunk, `defineCommand` validates + freezes, and `CommandRecord` is the closed
contribution unit (it uses `title`, and `keybinding: string | readonly
string[]`). That is intentional: an agent that hand-writes from this doc builds
against the real core, not an idealized interface.

The `ExtensionManifest` / `LoadedExtension` types above are the host's own.
Note that `acture-sandbox` exports a **different** `LoadedExtension` (`{ id }`)
for its `ExtensionRunner` port, where disposal goes through `runner.dispose(id)`
— the host pattern here and the isolation port are distinct layers, so don't
expect `runner.load()` to return something with a `.dispose()`. The richer
`ExtensionHost` / `EffectChannel` interfaces in research-9 §6.2 remain
**design, not shipped code**; `acture-sandbox` ships only the `ExtensionRunner`
port + the in-process transport today.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- `packages/core/src/registry.ts` — the real `registerAll` / `register` /
  `onCommandsChanged` this host is built on.
- `packages/sandbox/` (`acture-sandbox`) — the isolation seam: the
  `ExtensionRunner` port + the in-process transport, and nothing else. The
  host/loader stays this hand-written pattern; the package is only the
  isolation rung (real isolating transports remain deferred — research-9 §0).
- [`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`](research/acture_research_9%20--%20Extensions%20and%20Plugin%20Systems.md)
  — the design: §1 the two layers, §5 the host + inert manifest, §6 the
  interfaces and the naming decision, §7 the host-policy patterns kept out.
- The sibling references:
  [`hand-written-registry.md`](hand-written-registry.md),
  [`hand-written-command-sequence.md`](hand-written-command-sequence.md),
  [`hand-written-telemetry.md`](hand-written-telemetry.md),
  [`hand-written-undo.md`](hand-written-undo.md),
  [`hand-written-test-property.md`](hand-written-test-property.md),
  [`hand-written-python-client.md`](hand-written-python-client.md).
- `acture-extensions` skill — the agent's guide to *adding* an extension system
  to a target project (the trust-tier fork, the guardrails).
- `acture-command-record-shape` — the closed-record rule (capability by
  composition, not new fields).
- `acture-hard-donts` — #1 (inert metadata), #2 (no god-package), #3 (translate,
  don't decide), #5 (never `eval` author-supplied strings).
- `docs/command_dispatch_journal_article.md` §5 — "the command registry IS the
  extension point; an extension is a bundle of contributions."
