---
name: acture-hotkeys
description: Build a keyboard-shortcut consumer surface in a target project — bind `keybinding` off every CommandRecord and dispatch through the registry on key match, AND (new) let end users remap shortcuts. Covers the tool-library choice (tinykeys / react-hotkeys-hook / custom), the agent-written vs `acture-hotkeys` package paths, first-registered-wins conflict resolution, fire-time when-clause evaluation, the input-aware default, and end-user customization (persisted user keymap over the record default, press-to-record capture, conflict detection, physical-vs-logical keys, WCAG 2.1.4). Use when adding keyboard shortcuts to a command-dispatch app, when adding user-remappable shortcuts, or when working ON the `acture-hotkeys` package. Triggers on "hotkeys", "keyboard shortcuts", "keybindings", "bind keys", "tinykeys", "Ctrl+K shortcut", "shortcut conflict", "modal-scoped shortcuts", "customize keybindings", "remap shortcut", "rebind keys", "user keymap", "keybinding editor", "keymap preset".
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

## End-user customization — letting users remap shortcuts

This is a distinct, *composed* layer on top of the binder above — added when a project wants **users** (not just developers) to rebind shortcuts and have the choice persist. It was deferred until a concrete need surfaced; that need now exists, so the pattern is documented. The full evidence base and design rationale is `docs/research/acture_research_10 -- End-User Keyboard-Shortcut Customization.md`; the reproducible, zero-dependency core is `docs/hand-written-keymap-override.md`. The load-bearing points:

- **The user keymap lives OUTSIDE the closed `CommandRecord`.** The record's `keybinding` stays the *developer default*; the user layer is a separate, sparse, id-keyed override map (`commandId → { replace | add | remove }`) composed over it at bind time. No new record field — pure composition (research-10 §5.1). This keeps the closed-surface principle intact.
- **Resolution is pure pre-processing of the existing binding table.** A `resolveKeys(cmd, keymap)` feeds a keymap-aware `collectBindings`, placing user-overridden bindings *before* record defaults. acture's existing fire-time rule ("first descriptor whose `when` matches wins") is **unchanged** — you get VS Code's "user override wins, scope still respected" semantics for free. `bindHotkeys` grows one optional `keymap` argument; default it to an empty keymap for full backward compatibility.
- **Users override keys, never `when`.** The effective binding inherits the record's availability scope. This is the safe subset and dodges VS Code's empty-`when` shadowing footgun.
- **Match mnemonic shortcuts on `event.key` (the tinykeys/acture default), positional ones on `event.code`.** Do NOT globally switch to `code`. The hard part is *display*: label bindings via `navigator.keyboard.getLayoutMap()` with a raw-token fallback so non-US layouts read correctly (research-10 §3.4).
- **Conflict detection is the highest-value affordance and the one most products get wrong.** Warn *at assignment time* ("Already assigned to X — Reassign / Keep both / Cancel"), and treat two bindings on the same key as a non-conflict when their `when` clauses are mutually exclusive (acture already models this). A standing conflicts list is the JetBrains/Atom-resolver pattern.
- **Press-to-record capture** is the loved UX (Obsidian/JetBrains/games): listen → build the tinykeys token → reject browser/OS-reserved combos (`Cmd+W`, `Ctrl+T`, …) → conflict-check → commit to the keymap store. Persist the `UserKeymap` as JSON (localStorage/IndexedDB/server row); `$mod` keeps tokens portable across a user's machines.
- **WCAG 2.1.4 (Level A) is mandatory once you ship single-key bindings** (`"d"`, `"g i"`): ship a global "disable character-key shortcuts" toggle or default single-key bindings off/focus-scoped. This is a legal requirement, not a nicety (research-10 §3.7).

**Agent-written vs package-reuse** applies here too, decided per-piece — and the package accelerator **now ships**. The `UserKeymap` + `resolveKeys` + keymap-aware `collectBindings` + conflict pass is ~50 hand-writable lines (the reference doc) a project can own outright; OR install `acture-hotkeys`, which now exports the whole layer: `bindHotkeys(registry, { keymap })` (+ React `useHotkeys` re-binds on keymap change), `resolveKeys`, `detectConflicts`, and the capture/display primitives `tokenFromEvent` / `isReservedCombo` / `RESERVED_COMBOS` / `formatKeybinding` / `layoutLabel`. The **full remap-UI React component** stays the app's to build (the primitives cover it). Surface the split; it's the user's call (dev-tool-first). Handle every item on the research-10 §5.4 web-gotcha checklist (IME composition, macOS ⌘ keyup, `keydown` not `keypress`, `preventDefault` discipline).

## When working ON `acture-hotkeys`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- **The plain-DOM `bindHotkeys` is the core; React is a thin optional wrapper.** `useHotkeys` lives in a separate `./react` entry and is the only thing that imports `react` — the main entry has zero React (hard-don't #6). `react` is declared `optional` in `peerDependenciesMeta`.
- `tinykeys` is a peer dependency, framed as the user's tool choice — named, not sold.
- The package **translates** the registry to tinykeys bindings; it holds no business logic and makes no architectural decisions (hard-don't #3). First-registered-wins is a documented registry-order rule, not adapter cleverness.
- `$mod` is preserved through to tinykeys (Meta on macOS, Ctrl elsewhere) — the binder normalizes whitespace, nothing more.

## What NOT to build (wait for a real need)

End-user remapping (persisted user keymap, press-to-record capture, conflict resolver) is **no longer** on this list — a concrete need surfaced, so it is now a documented, composed layer (see "End-user customization" above + `docs/hand-written-keymap-override.md`). What remains deferred:

- **No per-command keybinding-priority field on `CommandRecord`.** The `keybinding` field is closed (see `acture-command-record-shape`); user-touched-wins ordering in the resolved table plus first-registered-wins covers precedence without new record metadata. The customization layer lives *outside* the record precisely so the closed surface stays closed.
- **No preset packs / cloud sync / rich resolver panel until asked.** `basePreset` is a seed field and a preset is just a `UserKeymap` to merge; syncing is a storage concern (`$mod` already makes tokens portable). Ship these when a project actually needs them, not before (research-10 §5 "deliberately omits").

A flat key→command binding with a `when` filter still covers the overwhelming majority of shortcut needs; the customization layer is additive on top. YAGNI applied softly.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-command-record-shape` — the `keybinding` field spec (the *field*; this skill is the *surface*).
- `docs/hand-written-keymap-override.md` — the reproducible, zero-dependency user-customization layer (`UserKeymap`, `resolveKeys`, conflict detection, capture sketch).
- `docs/research/acture_research_10 -- End-User Keyboard-Shortcut Customization.md` — the evidence base for customization (product survey, VS Code resolution semantics, web gotchas, WCAG 2.1.4).
- `packages/hotkeys/src/bind.ts` — the tinykeys binding's source, a worked example to adapt for other key libraries.
- `acture-palette-design` — the sibling input surface; palette and hotkeys both read the same `CommandRecord` set.
- `docs/command_dispatch_journal_article.md` §3.1 — command palette and keyboard shortcuts.
