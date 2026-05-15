---
name: acture-hotkeys
description: Build a keyboard-shortcut consumer surface in a target project — bind `keybinding` off every CommandRecord and dispatch through the registry on key match. Covers the tool-library choice (tinykeys / react-hotkeys-hook / custom), the agent-written vs `acture-hotkeys` package paths, first-registered-wins conflict resolution, fire-time when-clause evaluation, and the input-aware default. Use when adding keyboard shortcuts to a command-dispatch app, or when working ON the `acture-hotkeys` package. Triggers on "hotkeys", "keyboard shortcuts", "keybindings", "bind keys", "tinykeys", "Ctrl+K shortcut", "shortcut conflict", "modal-scoped shortcuts".
---

# acture hotkeys — keyboard shortcuts as a consumer surface

Keyboard shortcuts are a **projection of the registry**: a key sequence maps to a `commandId`, and pressing it calls `registry.dispatch(id)`. The `keybinding` field on `CommandRecord` is the single source — every surface (palette, hotkeys, AI, MCP) reads it; the app never maintains a second binding table by hand (journal article §3.1).

> **Load `acture-consumer-integration` first.** Hotkeys are a consumer — this skill covers hotkey specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the tool-library-is-the-user's-choice rule) lives there. If this is a strangler-fig adoption, also load the `migration-*` skills.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the keybinding library (the tool-library choice — the user's)

Hotkey binding rests on a low-level key-event library. Realistic choices: **tinykeys**, **react-hotkeys-hook**, **mousetrap**, **hotkeys-js**, or a hand-rolled `keydown` listener. **This choice belongs to the project, not to acture.** Name the options; respect the project's pick. acture ships one tested per-tool binding — `acture-hotkeys`, built on tinykeys — for projects that chose tinykeys. It does not imply tinykeys is the only option.

### Decision 2 — agent-written vs package-reuse (decided per the library)

- **Agent-written** — write the binder directly into the project: iterate `registry.list({ tiers })`, read `keybinding` off each record, register a handler with the project's key library that calls `registry.dispatch(id, undefined, ctx)`. ~50 lines, owned, zero acture dependency. This is the **only** path if the library is not tinykeys — adapt the pattern in `packages/hotkeys/src/bind.ts` (a worked example, not an import).
- **Package-reuse — only if the library is tinykeys** — install `acture-hotkeys`. Plain-DOM entry: `bindHotkeys(registry, options) → stop()`. Optional React entry: `useHotkeys(registry, options)` from `acture-hotkeys/react`. Cost: a dependency to track (tinykeys is a peer dep; React is an *optional* peer).

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes (`acture-consumer-integration` §Step 4).

## The build — what every path produces, and what to get right

Whatever library and path, the binder must honour these — they are what makes hotkeys a faithful registry projection, not a parallel system:

- **`keybinding` is read off the record — never a hand-kept table.** The binder iterates the registry. A newly registered command with a `keybinding` becomes reachable with no code change. Re-bind on `registry.onCommandsChanged(...)` so that holds at runtime.
- **Dispatch through `registry.dispatch(id, undefined, ctx)` — never call the handler directly.** A key press is just another trigger; it gets the same middleware and validation as every surface. (Hotkey commands are typically param-free — `kind: "atomic"`, 0 params; a `keybinding` on a param-bearing command should open the palette/form, not fire blind.)
- **Evaluate the `when` clause at FIRE time, against live context** — not at registration time. The context provider is a *closure that returns current context*, not a snapshot, so a `when` clause depending on selection/focus resolves correctly without re-binding on every state change.
- **Conflict resolution: first-registered-wins under matching context.** When two commands share a key sequence, iterate them in registry-insertion order and fire the first whose `when` passes the current context. This matches Obsidian / Raycast / Linear (research-1) and gives authors deterministic muscle-memory. To *override* a base binding, the plugin explicitly `unregister`s the base command first.
- **Input-aware by default.** Skip firing when the event target is an `<input>`, `<textarea>`, `<select>`, or `contentEditable` element — so a user typing `g` in a search box doesn't trigger the `g` command. Make this overridable (`shouldIgnoreEvent`).
- **Scope via the bind target.** Document-wide by default; for a modal, bind to the modal's root element so the bindings auto-scope to its lifetime.

## When working ON `acture-hotkeys`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- **The plain-DOM `bindHotkeys` is the core; React is a thin optional wrapper.** `useHotkeys` lives in a separate `./react` entry and is the only thing that imports `react` — the main entry has zero React (hard-don't #6). `react` is declared `optional` in `peerDependenciesMeta`.
- `tinykeys` is a peer dependency, framed as the user's tool choice — named, not sold.
- The package **translates** the registry to tinykeys bindings; it holds no business logic and makes no architectural decisions (hard-don't #3). First-registered-wins is a documented registry-order rule, not adapter cleverness.
- `$mod` is preserved through to tinykeys (Meta on macOS, Ctrl elsewhere) — the binder normalizes whitespace, nothing more.

## What NOT to build (rule of three)

No chord-recording UI, no user-remapping persistence layer, no visual keybinding-conflict resolver, no per-command keybinding-priority field on `CommandRecord` — wait for a concrete caller. The `keybinding` field is closed (see `acture-command-record-shape`); first-registered-wins covers conflict resolution without new metadata. A flat key→command binding with a `when` filter covers the overwhelming majority of shortcut needs.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-command-record-shape` — the `keybinding` field spec (the *field*; this skill is the *surface*).
- `packages/hotkeys/src/bind.ts` — the tinykeys binding's source, a worked example to adapt for other key libraries.
- `acture-palette-design` — the sibling input surface; palette and hotkeys both read the same `CommandRecord` set.
- `docs/command_dispatch_journal_article.md` §3.1 — command palette and keyboard shortcuts.
