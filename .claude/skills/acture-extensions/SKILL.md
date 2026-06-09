---
name: acture-extensions
description: Build an extension / plugin consumer surface in a target project — let code you did not author contribute new commands to the registry via a typed, inert manifest, invoked through `dispatch`. Covers the trust-tier fork (trusted in-process host/loader vs untrusted-author isolation), the contribution-manifest shape, the ~15-line hand-written host (there is NO package for the trusted path — it ships as a pattern), the deferred isolation-only `acture-sandbox` package and the single trigger that unlocks it, and the prompt-injection / supply-chain guardrails. Use when a host needs to load command-contributing code from a partner, customer plugin, or Labs bundle, or when working ON the deferred `acture-sandbox` package. Triggers on "extension", "plugin", "plugin system", "contribution points", "third-party commands", "extension API", "sandbox", "isolate untrusted code", "iframe sandbox", "QuickJS", "load external commands".
---

# acture extensions — third-party commands as a registry projection

An **extension system** is the machinery by which code you did not write when
you shipped your app contributes behaviour at runtime. In a command-dispatch
app this is almost free: **the command registry IS the extension point, and an
extension is a bundle of contributions** (journal article §5; the VS Code
contribution-point model). The registry is open-closed — core defines the
extension point, extensions add commands without modifying core. Some
extensions are just curated macro bundles (`acture-macros`).

> **Load `acture-consumer-integration` first.** Extensions are a consumer — this
> skill covers extension specifics; the foundational pattern (the dev-tool-first
> rule, the per-consumer hand-write-vs-install choice, the
> tool-library-is-the-user's-choice rule) lives there. Also read
> [`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`](../../docs/research/acture_research_9%20--%20Extensions%20and%20Plugin%20Systems.md)
> — the GO/NO-GO and the trust-tier model this skill encodes.

## The one thing to know first: there is (almost) no package

An "extension system" is **two layers**, and conflating them is the classic
mistake (research-9 §1):

- **The host / loader** — load/unload/observe bundles of command contributions.
  A **~15-line hand-write** over core's `registerAll` / `register` /
  `onCommandsChanged` ([`docs/hand-written-sandbox.md`](../../docs/hand-written-sandbox.md)).
  The `CommandRecord` already *is* the manifest, so a host that trusts its
  authors needs no new machinery. This **ships as a pattern + this skill**, like
  `acture-macros` — there is **no package** for it.
- **The isolation layer** — running code you cannot audit *safely* (iframe /
  Worker / QuickJS-WASM / `isolated-vm`). The first acture surface that is
  genuinely package territory. This — and only this — is the isolation-only
  **`acture-sandbox`** package. It ships the `ExtensionRunner` port + an
  in-process transport now; the real *isolating* transports stay deferred until
  a real untrusted-author user exists. (Research-9 §0's NO-GO was the honest
  no-named-user default; the maintainer has since decided to build the
  isolation-only seam.)

So the **agent-written path is the path** for the host/loader. Hand-write it
from the reference doc.

## Two decisions to surface (per `acture-consumer-integration`)

The core-vs-strangler-fig dimension is upstream — handled by
`acture-consumer-integration` and the host's existing registry. An extension
host attaches to the *same* registry whether acture was designed in greenfield
or strangled into an existing app, so the two decisions below are what's
specific to this surface.

### Decision 1 — the trust tier (the user's threat model picks this)

Trust is the master axis — it constrains everything downstream (research-9
Axis A). Pick the strongest isolation that still lets extensions do their job:

| Tier | Who | Isolation | Mechanism |
| --- | --- | --- | --- |
| **Trusted** (default v1) | you, your team, vetted partners | none | in-process — the hand-written host |
| Semi-trusted | known authors, bugs happen | fault isolation (not security) | Web Worker + kill switch |
| **Untrusted** | anonymous / adversarial | **security** isolation | sandboxed iframe / QuickJS / `isolated-vm` → **`acture-sandbox`** |

In-process is *genuinely sufficient* while authors are trusted — not just a
default (research-9 §3.5). The moment an untrusted author is about to run code,
the membrane is forced.

### Decision 2 — hand-written host (always) vs the `acture-sandbox` port

- **Agent-written host** — write the ~15-line loader from
  [`docs/hand-written-sandbox.md`](../../docs/hand-written-sandbox.md). This is
  the path for every trusted-author host. Zero acture dependency beyond core.
- **`acture-sandbox`** — the isolation seam (the `ExtensionRunner` port + an
  in-process transport). It is isolation-only and does not replace the host —
  it sits behind it. Install it for the tested port; reach for an *isolating*
  transport (Worker / iframe / QuickJS / `isolated-vm`) only when an untrusted
  author appears (those transports are still deferred).

Surface both; follow a stated preference; otherwise ask. Record the choice
(`acture-consumer-integration` §Step 4).

## The build — what every path produces, and what to get right

Whatever the trust tier, these keep an extension system a faithful registry
projection rather than a parallel framework:

- **Extensions contribute via a typed, INERT manifest** — declarative
  contribution points (data), with handlers supplied separately at load time.
  The manifest carries no conditionals or loops (hard-don't #1). The host
  validates it against canonical schemas, binds handlers, and `registerAll`s the
  bundle; the returned `() => void` disposer is the atomic unload.
- **The `CommandRecord` IS the contribution unit — never grow it for
  extensions.** Capability is composition (`undoable(cmd)`…), not new fields
  (`acture-command-record-shape`). The registry stays flat — no recursive
  "extension command" type.
- **Dual registration: metadata eager, handler lazy.** Surface a plugin's
  commands in the palette / AI tool list / MCP `tools/list` *without executing
  its code*. The safe-by-default posture and the foundation for isolation.
- **The contract shape is the one irreversible decision — lock it now.** Make
  the author-facing contract async, structured-clone-serializable, and
  capability-as-data *even in-process* (research-9 §3.3). Then in-process,
  Worker, iframe, and `isolated-vm` are all adapters behind one port — designing
  for the worst runtime makes the local case trivial.
- **Breaking changes are detectable.** Pin `apiVersion`/`engines` per extension
  (caret, never `*`); add a new schema `version` literal for breaking changes;
  copy VS Code's proposed→stable graduation (`acture-tier-system`).

## The security guardrails — extensions may be untrusted

Mirrors the `acture-mcp` surface (both expose the registry to callers you don't
fully trust):

- **Never `eval` / `new Function` an extension-supplied string, never
  reflectively invoke a handler from a provided name** (hard-don't #5).
  Everything routes through `registry.dispatch(id, args)` → `Map.get` +
  schema-validate. The proposer proposes; the registry validates and decides.
- **Schema validation happens at the dispatcher regardless of contributor.** An
  extension's command is validated exactly like a first-party one. Authorization
  is a `when`-clause / capability check, never the contributor's identity
  (hard-don't #10).
- **Isolation is necessary but NOT sufficient.** A membrane contains code; it
  does not stop exfiltration of capabilities you hand across it. Pair runtime
  isolation with capability gating (POLA) **and** a provenance posture (signed
  bundles, pinned versions) — two of the four documented incident classes were
  supply-chain, where a sandbox is irrelevant (research-9 §3.2).

## When working ON `acture-sandbox`

The same positioning applies inward (per `acture-consumer-integration` §"When
you are working ON a consumer-specific package"):

- It is **isolation-only.** One `ExtensionRunner` port; transports (in-process /
  Worker / iframe / QuickJS / `isolated-vm`) are adapters behind it — the
  in-process transport ships now, isolating transports are added one at a time
  when a real need names them, never bundled (hard-don't #2, no god-package of
  transports).
- It **translates, it does not decide** (hard-don't #3). The manifest schema,
  the host/loader, the effect-channel, the entitlement store, and any
  marketplace are NOT in the package — the host owns those (research-9 §6.3, §7;
  the entitlement / 403-vs-409 install gate is a documented *pattern*, not
  package code).
- `acture` is a peer dependency; each transport's runtime (e.g. `isolated-vm`,
  `quickjs-emscripten`) is an optional peer.

## What NOT to build (wait for a real need)

No *isolating* transports until the untrusted-author trigger fires (the
in-process transport is the trusted-author v1). No marketplace, discovery UI, or
capability-broker. No entitlement store in the package (host policy). No
event-subscription bus beyond what the registry's `onCommandsChanged` gives you.
No fields added to `CommandRecord`. YAGNI applied softly.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- [`docs/hand-written-sandbox.md`](../../docs/hand-written-sandbox.md) — the ~15-line agent-written host/loader; the path for trusted authors.
- [`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`](../../docs/research/acture_research_9%20--%20Extensions%20and%20Plugin%20Systems.md) — the design: trust model, isolation table, effect-as-data seam, GO/NO-GO.
- `acture-macros` — curated-macro-bundle extensions; the same no-package, ship-as-pattern model.
- `acture-mcp` — the sibling untrusted-caller surface; shared `dispatch`-only / no-`eval` guardrails.
- `acture-tier-system` — the proposed→stable lifecycle for a host↔extension API.
- `acture-command-record-shape` — the closed-record rule (capability by composition).
- `acture-hard-donts` — #1 (inert metadata), #2 (no god-package), #3 (translate, don't decide), #5 / #10 (never trust author/LLM strings).
- `docs/command_dispatch_journal_article.md` §5 — the registry-is-the-extension-point thesis.
