# End-User Keyboard-Shortcut Customization — A Reference Design for acture's User-Keymap Override Layer

**Author:** Thor Whalen
**Date:** July 2026
**Status:** research finding for the brief at `docs/research/acture_research_prompts.md` §10 — drives the design of acture's *end-user* keybinding-customization support (the layer that lets a user, not just the developer, remap shortcuts). Companion to research-1 (command-dispatch patterns) and the shipped `acture-hotkeys` package + skill. This is a **design + evidence base**, not a build order; the package-vs-pattern decision is the user's.

---

## 0. Read this first — the recommendation

acture already ships a single default `keybinding` field per `CommandRecord` (a tinykeys DSL string or array, e.g. `"$mod+K"`, `"g i"`), a `when` availability predicate, and the `acture-hotkeys` adapter that resolves same-key conflicts by **first-registered-wins under matching `when`**, evaluated at *fire* time (`packages/hotkeys/src/bind.ts`). What is missing is the layer that lets an **end user remap** those shortcuts and have the choice persist.

**The design that falls out of the survey — and it requires no change to the closed `CommandRecord`:**

1. **A user keymap is a separate, serializable, sparse override map keyed by command id** — `commandId → { replace | add | remove }`. The record's `keybinding` stays the developer default; the user layer composes over it at bind time. (This is the VS Code / JetBrains / Obsidian shape.)
2. **Resolution is pure composition into the existing descriptor table.** A `resolveKeys(cmd, userKeymap)` function feeds `collectBindings`, placing user-overridden bindings *before* record defaults; acture's existing fire-time "first descriptor whose `when` matches wins" rule then yields VS Code-equivalent *"user override wins, scope still respected"* semantics — with zero change to the dispatch path.
3. **Match mnemonic shortcuts on `event.key` (the tinykeys default acture already uses), positional ones on `event.code`.** Do **not** globally switch to `code`. The hard part is *display*, not matching: label bindings via `navigator.keyboard.getLayoutMap()` with a raw-token fallback.
4. **Conflict detection is the single highest-value UX affordance** and the one most products get wrong. Warn *at assignment time* ("already assigned to X — Reassign / Keep both / Cancel"), and treat two bindings on the same key as a non-conflict when their `when` clauses are mutually exclusive (acture already models this).
5. **Ship WCAG 2.1.4 compliance from day one:** any single-character shortcut (`"d"`, `"g i"`) must be disable-able or focus-scoped — a legal Level-A requirement, not a nicety.

**Positioning.** This is a *composition* layer, not a new primitive — so it honours the closed-surface rule and the dev-tool-first principle: a project can hand-write the `UserKeymap` + `resolveKeys` + a capture component (the reproducible reference lives in `docs/hand-written-keymap-override.md`), or opt into an acture helper. Since **no mainstream JS hotkey library ships this layer** (§6), it is also a genuine differentiator rather than a reinvention.

---

## 1. Headline findings (surprises flagged)

1. **Remapping is an IDE / pro-tool / game affordance, not a SaaS norm.** The heavyweight customizers are code editors (VS Code, JetBrains, Sublime, Zed, Atom, Emacs, Vim), creative pro tools (Blender, DAWs), and games (Unity's rebind sample). The polished *web* SaaS apps acture most resembles — **Figma, Linear, Slack, Notion** — largely **do not let users remap shortcuts at all** [27][28]. Figma's "customizable shortcuts" is a years-old open feature request [27]; Slack says only "we may add this in the future" [28]. **Implication:** acture shipping real remapping is *differentiating*, but there is almost no SaaS precedent to copy — the patterns worth copying come from IDEs and games.

2. **"Physical vs logical key" has no single right answer, and the naïve advice ("always use `event.code`") is wrong for mnemonic shortcuts.** `code` is layout-independent but *unreadable* on non-US layouts (the QWERTY-Q position is always `KeyQ` but prints "a" on AZERTY, "'" on Dvorak) [5][3]. `key` follows the character the user sees but shifts position across layouts and is modifier/locale-dependent [6]. VS Code itself splits the decision **by platform** (`keyCode` on Windows, `code`/scan-codes on macOS + Linux) [3][4]. `navigator.keyboard.getLayoutMap()` exists *specifically* because `code`-based labels are illegible to non-US users [8][9]. This is the single most load-bearing web decision in the space.

3. **VS Code's resolver is "last-defined-wins," implemented as "evaluate bottom-to-top, first full match wins."** User rules are appended below the defaults, so they are *seen first* and shadow defaults [1]. Removal uses a `-command` rule [1]. **Surprising gotcha:** a user binding **without** a `when` clause silently shadows a default that *had* a `when`, because the first key+when match wins and an empty `when` always matches.

4. **The feature users hate most is a *missing* conflict warning.** Obsidian happily lets you bind ⌘P to several commands with **no warning** — the top complaint [20][21]; Blender has no built-in conflict detection either [34][35]. JetBrains, which *does* warn at assignment time, is repeatedly cited as the good example [15].

5. **No mainstream JS hotkey library ships a user-rebindable, persisted keymap with conflict detection.** tinykeys, mousetrap, hotkeys-js, react-hotkeys-hook, keymaster, @github/hotkey are all `bind(key, fn)` primitives; persistence, remap UI, and conflict UX are left to the app [11]. This is precisely the gap acture's layer fills.

---

## 2. Product × dimension comparison

| Product | Storage / data model | Resolution & layering | Conflict UX | Chord/sequence | Physical vs logical | Presets / portability |
|---|---|---|---|---|---|---|
| **VS Code** [1][3][4] | `keybindings.json` array; `{key, command, when, args}`; `-command` removal | Defaults + user rules appended below; **evaluated bottom→top, first key+when match wins** | GUI editor; right-click "Show Same Keybindings"; **no hard block** | Space-separated chords `ctrl+k ctrl+c` | **keyCode on Win, code on mac/Linux**; labels in system layout | Keymap extensions (Vim/Sublime/IntelliJ/Emacs); Settings Sync |
| **JetBrains** [15][16] | Keymap scheme (XML); action-id ↔ shortcut | Scheme-based; predefined schemes read-only → **edit forks a copy** | **Warns at assignment** ("already assigned to X"); reassign/keep/remove | Multi-stroke "second stroke" | Virtual-key based, per-OS | Export/import scheme; ships Emacs/VSCode/etc. schemes |
| **Sublime Text** [17] | `.sublime-keymap` JSON array; `{keys, command, args, context}` | `Packages/User` overrides `Default` (later file wins); context array | None built-in | Array of keys = sequence | `keys` are logical char names | Copy Default → User |
| **Zed** [18][19] | `keymap.json` array of `{context, bindings}` | **context specificity > source (user>base>platform) > definition order** | None built-in; disable via `null` action | Prefix binding waits ~1 s | Logical | Base-keymap presets (JetBrains/Sublime/Atom/VSCode) |
| **Obsidian** [20][21] | Internal JSON command-id ↔ combos | Default vs custom; multiple bindings/command | **No warning — top complaint**; community plugins add it | Single combo (no OS chords) | Logical | Community plugins only |
| **Atom** (historical) [22][23] | `keymap.cson`; **CSS-selector-scoped** | **CSS specificity + load order**, user last; walks DOM up | `keybinding-resolver` panel shows what fired & what was shadowed | Space-separated | `keystroke` patterns | Community keymaps |
| **Emacs** [25] | Elisp keymaps | **minor-mode > local(major) > global** shadowing; prefix keys = nested keymaps | None (evaluate + describe-key) | Prefix keys (C-x C-s) | Terminal/GUI key events | `.emacs` packs |
| **Vim** [26] | `map`/`noremap`; `<Leader>` | Buffer-local shadows global; `noremap` vs recursive | `:map` lists; no proactive warn | Multi-key + leader | Char-based | Distributions |
| **Figma** [27] | — | — | — | — | Layout picker for label display only | **Not customizable (open request)** |
| **Slack** [28] | — | — | — | — | Keyboard-layout preference | **Not customizable**; a11y toggles only |
| **Chrome/Firefox ext.** [29] | `chrome://extensions/shortcuts` UI; manifest `commands` | User remaps in browser UI; **max 4 suggested**; global limited to `Ctrl+Shift+0-9` | Browser blocks OS/browser-reserved combos | No sequences | Browser-managed | Per-extension |
| **Blender** [34][35] | Keymap prefs; export to `.py` | Editor-scoped keymaps; add-don't-edit | **No built-in conflict detection** (community tools) | Modal + double-key | Physical (scancode-ish) | Import/export presets |
| **Unity / games** [36] | Input action asset / save file | Rebind overrides on action | **replace / swap / allow-duplicate** policies; "already assigned" flash | Press-to-listen | Physical (scancode) for WASD | Control presets |

---

## 3. Dimension deep-dives

### 3.1 Data model & storage format

Two shapes dominate:

- **Flat command-id ↔ binding** (VS Code, JetBrains, Obsidian, Chrome). The user file is a *sparse override map*: only changed commands appear; everything else falls through to defaults. VS Code stores an *array of rules* (`{key, command, when}`) rather than a `command→key` object, which lets one command have several bindings and lets a rule *remove* a default (`-command`) [1].
- **Scope/selector-keyed groups** (Zed `context`, Sublime `context`, Atom CSS selectors). Bindings are grouped under a scope that both filters activation and drives specificity [18][17][22].

**Override semantics.** Universally the user layer is *additive and last*: defaults load first, user file loads last, and later/lower entries win [1][17][22][18]. Only VS Code and Zed provide first-class *removal* (`-command` / `null` action) so a user can *delete* a default without replacing it [1][18]. **Persistence** is JSON on disk for local apps and `localStorage`/IndexedDB/DB for web; VS Code and JetBrains add cloud **Settings Sync**.

**Takeaway for acture:** a sparse `commandId → override` map (not a full keymap dump) is the correct shape — it survives command-registry changes gracefully and keeps the file small. Support three override kinds: *replace*, *add-additional*, and *remove/disable*.

### 3.2 Resolution & layering — the load-bearing VS Code semantics (adversarially verified)

VS Code, verbatim from the official docs [1]:

> "The additional `keybindings.json` rules are appended at runtime to the bottom of the default rules, thus allowing them to overwrite the default rules."
> "Rules are evaluated from **bottom** to **top**. The first rule that matches both the `key` and `when` clause is accepted. If a rule is found, no more rules are processed."

Cross-checked against the `microsoft/vscode-docs` source (`keybindings.md`), which agrees [1]. So the effective rule is **last-defined-wins**, realized as *first match encountered while scanning upward*. Consequences:

- A user rule with the **same key and same/looser `when`** shadows the default. An **empty `when` always matches**, so a user rebinding of a key that a default had scoped (say to `editorTextFocus`) will now fire everywhere — a classic footgun. **acture sidesteps this by not letting users override `when`** (§5.1).
- **Removal** (`{"key":"x","command":"-someCmd"}`) injects a negative rule that cancels the matching positive one [1].
- **Chords**: the first chord keystroke enters a "pending" state; if the second doesn't complete a known chord, nothing fires.

Other philosophies: **Zed** ranks by **context specificity first**, then source (user > base > platform), then definition order [18][19] — closer to CSS. **Atom** was pure **CSS specificity + load order**, walking up the DOM from the focused element; confusing enough that Atom shipped a dedicated `keybinding-resolver` panel to explain *why* a key did what it did [22][23]. **Emacs** uses **shadowing by scope tier**: minor-mode maps shadow the major-mode (local) map, which shadows global [25].

**acture's current model** is *first-registered-wins under matching `when`*, evaluated at *fire* time so dynamic `when` (selection/focus) works (`bind.ts`). This is closest to VS Code's "first match wins," except acture orders by **registration order** rather than file position, and does **not** yet honour a *user* override layer. The recommended layer (§5) slots the user override *before* the record default in that same first-match scan — so the existing fire logic is unchanged.

### 3.3 Chord / sequence support & platform normalization

Every serious editor supports multi-key sequences: VS Code `ctrl+k ctrl+c` [1], Emacs prefix keys `C-x C-s` [25], Vim/Zed prefix bindings, tinykeys `"g i"` and `"$mod+K $mod+1"` [12]. The universal mechanism is a **pending-state timeout**: tinykeys and Zed both use a **~1000 ms** window during which a partial sequence waits for continuation, then resets [12][18]. **Prefix ambiguity** (`ctrl-w` vs `ctrl-w left`) is resolved by waiting to see whether the continuation arrives [18].

**Platform normalization** converges on an abstract "primary modifier": tinykeys `$mod` = **Meta (⌘) on Apple, Control elsewhere**, decided by platform [12][13]; VS Code renders `Cmd` vs `Ctrl` per OS. acture already inherits `$mod` from tinykeys — keep it as the canonical token in the user keymap so a synced keymap is portable across a user's Mac and Windows machines.

### 3.4 Physical vs logical keys — the web's central pitfall (double-checked)

This is where a web library most easily ships something broken. Verified across MDN, Chrome-for-Developers, VS Code's wiki, and two independent critiques [5][6][7][3][10][11]:

- **`KeyboardEvent.code`** = the *physical key position*, layout-independent. The QWERTY-Q key is **always** `"KeyQ"` — even on AZERTY (prints "a") or Dvorak (prints "'") [5][3]. Good for *positional* bindings (WASD, "the key left of 1"); **terrible for labels** — you cannot tell a French user their shortcut is "A" if all you have is `KeyQ` [5].
- **`KeyboardEvent.key`** = the *character produced*, honouring layout, locale, and modifiers [6]. Good for *mnemonic* bindings ("**B**old = ⌘B") and labels; but the *same physical key* yields different `key` on different layouts, and Shift/AltGr/⌥ change it [11].
- **Deprecated `keyCode`/`which`/`charCode`** are unreliable across layouts; MDN explicitly warns against `keyCode` for printable characters [6][3]. mousetrap uses `which`, hotkeys-js/keymaster use `keyCode` — all "basically `code` but more deprecated" [11].

**How the pros split it:** VS Code dispatches on `e.keyCode` on Windows but on `e.code` (scan codes) on macOS and Linux, because those OSes lack an OS-level virtual-key concept; the `keyboard.dispatch: "keyCode"` setting exists to fix remote-desktop/virtualization and exotic layouts [3][4]. To *display* a physical-key binding legibly you must translate `code → character` in the user's layout via **`navigator.keyboard.getLayoutMap()`** (e.g. `map.get("KeyW")`) and relabel on the `layoutchange` event [8][9]. This API is Chromium-only and unavailable in cross-origin iframes [8].

**tinykeys' actual behaviour (from source [13]):** a token matches if `event.key` (case-insensitive) equals it **OR** `event.code` equals it. So `"d"` matches `event.key`, while `"KeyD"` matches `event.code`. tinykeys **defaults to matching `key`** for ordinary tokens [11][13]. **This is exactly acture's situation:** bindings like `"$mod+K"` match logical `key`, which is the *right* default for mnemonic command shortcuts.

**Counterintuitive conclusion:** do **not** globally "fix" this by switching to `code`. Mnemonic command shortcuts (the ~95% case) should match on `key`; only offer `code`-based capture as an opt-in "physical position" mode. The genuinely hard part is **display**: use `getLayoutMap()` to label bindings, with a graceful fallback to the raw token.

### 3.5 Conflict detection & resolution UX

Three tiers exist in the wild:

1. **Warn at assignment (best).** JetBrains shows the pressed combo *and a warning if it conflicts*, letting you reassign or keep [15]. Games do the same with a **flash + callback**, offering **replace / swap / allow-duplicate** and right-click-to-unbind [36].
2. **Explain after the fact.** Atom's `keybinding-resolver` (Ctrl+.) shows which command a key resolved to and which bindings were shadowed [23]; VS Code's editor has "Show Same Keybindings."
3. **Nothing (worst).** Obsidian gives *no* warning when you bind ⌘P twice — the single most-cited grievance, worked around only by community plugins [20][21]. Blender likewise has "no trivial" conflict detection [34][35].

The pattern users reward is the **"already assigned to X — reassign?"** interstitial with three explicit choices (reassign / keep both / cancel), plus **scope-awareness** — two bindings on the same key are *not* a conflict if their `when` are mutually exclusive (acture already models this).

### 3.6 Presets / schemes & portability

The strongest portability story is **keymap packs**: VS Code ships Vim, Sublime, Atom, IntelliJ, Eclipse, Emacs, Visual Studio keymap *extensions* [40]; JetBrains ships schemes with export/import [15]; Zed offers `base_keymap` presets [18]. Common affordances: **reset-to-default** (per-binding and global), **import/export** (JSON/scheme file), and **cloud sync**. JetBrains' **copy-on-edit** (editing a predefined scheme forks a personal copy) is quietly excellent — it guarantees a clean "revert to stock" always exists [15].

### 3.7 Accessibility & reserved keys

- **WCAG 2.1.4 Character Key Shortcuts (Level A)** requires that any single-character (no-modifier) shortcut can be **turned off**, **remapped to include a modifier**, or be **active only on focus** [30]. Failing this is formal failure **F99** [31]. Rationale: speech-input users saying "a" trigger a global "archive"; motor-impaired users mis-fire [30].
- **GitHub's cautionary tale:** its single-letter shortcuts (`s`, `g c`, `.`) collided with Grammarly, Vimium, and voice input; after complaints GitHub added an accessibility setting to **disable Character keys** while keeping modifier shortcuts [32][33]. This is the reference implementation of WCAG 2.1.4's "turn off."
- **`accesskey`** is *not* covered by 2.1.4 (it always includes a modifier) [30] but is notoriously unreliable and not a substitute for a real keymap.
- **Reserved keys you cannot capture** (§3.8) must be excluded from the *bindable* set, or the user assigns a shortcut that never fires.

### 3.8 Web-specific constraints (the implementer's minefield)

- **Browser-reserved combos cannot be overridden.** `Ctrl+T`, `Ctrl+W`/`Cmd+W`, `Ctrl+N`, `Ctrl+R`, `Cmd+Q` etc. are handled *above* the JS event layer; `preventDefault()` does nothing, by deliberate browser design (data-loss/phishing protection) [37]. A rebind UI must **reject or warn** on these.
- **`keydown` vs `keypress`.** `keypress` is deprecated; use `keydown` for shortcuts.
- **IME / composition.** During CJK/IME composition, keydowns carry `keyCode === 229` and `event.isComposing === true`. Guard with `if (event.isComposing || event.keyCode === 229) return;` — check **both**, because Safari/edge cases don't always set `isComposing` [39].
- **macOS Meta keyup bug.** While ⌘ is held, macOS does **not** deliver `keyup` for the other key [37]. Any hold/sequence logic keyed on `keyup` breaks under ⌘; rely on `keydown`-driven matching (as tinykeys does).
- **Input-field focus.** Don't fire shortcuts while typing in `input/textarea/select/contenteditable` — `acture-hotkeys` already defaults to this via `DEFAULT_IGNORE` (`bind.ts`).
- **`getLayoutMap()` limits.** Chromium-only, unavailable in cross-origin iframes [8] — needs a fallback path.
- **`preventDefault` discipline.** Only call it when a binding *actually fires*, else you steal keys from the page/browser.

---

## 4. UX patterns users love vs. hate (cited)

**Loved**
1. **Press-to-record capture** (Obsidian [20], JetBrains dialog [15], Blender "click then press" [34], Unity rebind listen [36]). Direct manipulation beats hand-editing JSON.
2. **Warn-at-assignment conflict flow** ("already assigned to X — reassign?") — JetBrains is the repeatedly-praised gold standard [15]; games' flash-and-choose [36].
3. **Searchable shortcuts editor with reverse lookup** — VS Code's editor with "Record Keys" + "Show Same Keybindings," Atom's resolver panel that *explains* what fired [1][23].
4. **Copy-on-edit / non-destructive schemes** with guaranteed reset-to-default [15].
5. **Keymap presets/packs** for muscle-memory portability [40][18].

**Hated**
1. **Silent shadowing — no conflict warning** (Obsidian [20][21]; Blender [34][35]).
2. **Cannot customize at all** (Figma [27]; Slack [28]).
3. **Single-key shortcuts that mis-fire with no off-switch** — GitHub episode and WCAG F99 [32][33][31].
4. **Shortcuts that silently fail on non-US layouts** [10][11].
5. **JSON/CSON-only editing requiring command-ID or cryptic context knowledge** (Atom CSS selectors, Sublime `operator`/`operand`) [22][17].
6. **Customizations clobbered on update** — Zed users report bindings overridden "every release" [18].

---

## 5. Recommendations for acture

### 5.1 Data model — an override layer *outside* the closed `CommandRecord`

The `CommandRecord` stays untouched: its `keybinding` remains the **developer default**. The user layer is a **separate, serializable object keyed by command id**, resolved at bind time. No new record field; pure composition.

```ts
/** One user override for a single command. */
type KeybindingOverride =
  | { kind: 'replace'; keys: string[] }   // replace the record default entirely
  | { kind: 'add';     keys: string[] }   // keep default AND add these
  | { kind: 'remove' };                   // unbind (VS Code's -command / Zed null)

/** The persisted user keymap: sparse, only changed commands appear. */
interface UserKeymap {
  version: 1;                             // schema version for migration
  basePreset?: string;                    // seeded-from preset, for portability
  overrides: Record<string, KeybindingOverride>;  // absent id ⇒ record default
}
```

Design notes:
- **Sparse, id-keyed** (VS Code / JetBrains / Obsidian shape [1][15]) — survives registry churn; a removed command just leaves a dead entry that resolves to nothing.
- **Three override kinds** cover replace / add-additional / remove — mirroring VS Code's `-command` and Zed's `null` [1][18].
- **Tokens are tinykeys DSL strings** (`"$mod+K"`, `"g i"`), keeping `$mod` portable across OSes [12] and reusing acture's existing `parseKeybinding`.
- **`when` is *not* user-overridable.** Users change *keys*, not *scope*; the effective binding inherits the record's `when`. This is the safe subset (it dodges VS Code's empty-`when` footgun) and keeps acture's fire-time `when` evaluation intact.
- **Serialization**: JSON to `localStorage`/IndexedDB (web) or a per-user backend row; the `version` field enables migration. This is a `dol`-style `MutableMapping<commandId, KeybindingOverride>` facade over storage.

### 5.2 Resolution algorithm

Introduce a pure function that composes record defaults with the user keymap into the **same descriptor list** `collectBindings` already builds — so the existing first-match-under-`when` fire logic is untouched:

```ts
/** Effective keybindings for one command, given the user layer. */
function resolveKeys(cmd: CommandRecord, km: UserKeymap): string[] {
  const o = km.overrides[cmd.id];
  const base = normalizeKeybinding(cmd.keybinding); // existing helper
  if (!o) return [...base];
  switch (o.kind) {
    case 'remove':  return [];
    case 'replace': return [...o.keys];
    case 'add':     return [...base, ...o.keys];
  }
}
```

Then `collectBindings(registry, tiers, userKeymap?)` emits, per effective key sequence, an **ordered descriptor list** with **user-overridden bindings placed before record defaults**. At fire time acture keeps its rule: *first descriptor whose `when` matches the live context wins* (`bind.ts`). This yields VS Code-equivalent **"user override wins, scope still respected"** semantics [1] while preserving acture's dynamic-`when` behaviour. `remove` simply omits the key. The whole thing is a pure recomputation — it re-runs on the existing `commandsChanged` event and on any user-keymap change.

**Conflict detection** is a separate pure pass over the resolved table: for each key sequence bound by ≥2 commands, report a conflict **unless** their `when` clauses are statically mutually exclusive. acture can guarantee "no `when` on either ⇒ definite conflict"; a function-`when` ⇒ *possible* conflict ("may conflict"). Surface this both at **assignment time** (§5.3) and as a **standing "conflicts" list** (JetBrains/Atom-resolver style [15][23]).

### 5.3 Capture UX

Adopt the Obsidian/JetBrains/game press-to-record model [20][15][36]:

1. Click a command's binding cell → **listening** state ("Press keys…").
2. On `keydown`, **ignore lone modifier keydowns**; accumulate modifiers + the terminating key into a tinykeys token (`$mod`/`Shift`/`Alt` + `event.key`). For **chords**, keep listening after the first complete combo within the ~1 s window and join with a space [12].
3. Build the token from **`event.key`** by default (matches tinykeys/acture); normalize letter case. Offer an opt-in **"physical position"** toggle emitting `event.code` tokens (`KeyW`) for game/WASD-style bindings [11][5].
4. **Before committing**, run conflict detection; if already bound, show **"Already assigned to *Command X* — [Reassign] [Keep both] [Cancel]"** [15][36].
5. **Reject browser/OS-reserved combos** (`Cmd+W`, `Ctrl+T`, `Ctrl+R`, …) with an inline explanation [37].
6. **Display** every binding via `getLayoutMap()` when available (correct labels on AZERTY/Dvorak), falling back to the raw token; relabel on `layoutchange` [8][10].
7. Provide **reset-to-default** per binding (delete the override) and **global reset** (clear `overrides`), plus **import/export** of the `UserKeymap` JSON and optional **preset seeding** (`basePreset`) [15][40].
8. For **WCAG 2.1.4**: because acture supports single-key bindings (`"g i"`, `"d"`), ship a global **"disable character-key shortcuts"** toggle (GitHub's pattern [32]) and/or default single-key bindings to off or focus-scoped [30][31].

### 5.4 Web-gotcha checklist (implementer must handle)

- [ ] Ignore shortcuts during **IME composition**: `event.isComposing || event.keyCode === 229` (check both) [39].
- [ ] Don't fire in input/textarea/select/contenteditable (acture default already) (`bind.ts`).
- [ ] **Reject reserved combos** (Ctrl+T/W/N/R, Cmd+W/Q, …) in capture — `preventDefault` can't reclaim them [37].
- [ ] Match mnemonic shortcuts on **`event.key`**, positional ones on **`event.code`** — never assume one for all [11][5][6].
- [ ] Label bindings with **`getLayoutMap()`**; fall back gracefully (Chromium-only, no cross-origin iframe) [8].
- [ ] Use **`keydown`**, not deprecated `keypress` [39].
- [ ] Don't rely on **`keyup`** under macOS ⌘ (not delivered) [37].
- [ ] Only `preventDefault()` when a binding **actually fires**.
- [ ] Normalize `$mod`/case; persist portable tokens so a synced keymap works on both Mac and Windows [12].
- [ ] Treat same-key bindings with mutually-exclusive `when` as **non-conflicts** [15].

---

## 6. Library-capability comparison (the rebindable-keymap layer specifically)

| Library | Key match | Sequences | Scopes/`when` | Conflict handling | **User remap** | **Persistence** | **Conflict/remap UI** |
|---|---|---|---|---|---|---|---|
| **tinykeys** [12][13] | `key` **or** `code` (defaults to `key`) | ✅ (~1 s timeout) | ❌ (app supplies) | Console warning; first-registered wins | ❌ | ❌ | ❌ |
| **mousetrap** [11] | `which` (≈`code`, deprecated) | ✅ | Partial | last-wins | ❌ | ❌ | ❌ |
| **hotkeys-js** [11] | `keyCode` (deprecated) | Limited | ✅ scopes | manual | ❌ | ❌ | ❌ |
| **react-hotkeys-hook** [11] | `key` **and** `code` (over-fires) | ✅ | Component scope | manual | ❌ | ❌ | ❌ |
| **keymaster/combokeys** [11] | `keyCode` (deprecated, abandoned) | Limited | filter | ❌ | ❌ | ❌ | ❌ |
| **@github/hotkey** | declarative `data-hotkey` | ✅ | DOM-scoped | duplicate-tolerant | Partial | ❌ | ❌ |
| **HTML `accesskey`** [30] | browser + modifier | ❌ | element focus | browser | ❌ | ❌ | ❌ |

**Conclusion:** *no* mainstream library ships the "user-rebindable, persisted keymap with conflict detection" layer — they are all `bind(key, fn)` engines. acture's opportunity is to be the **override/resolution/conflict layer on top**: tinykeys stays the low-level engine, and acture supplies the `UserKeymap` model, `resolveKeys` resolution, capture UX, conflict detection, presets, and persistence that none of them provide. Because acture already reads one `keybinding` per record through a single adapter, this is a *composition* change, not a record-schema change — fully consistent with the closed-surface principle.

---

## 7. Decision this unblocks

- **Whether acture ships a keymap-customization helper (package) or only a pattern (`docs/hand-written-keymap-override.md` + skill).** The hand-writable core — `UserKeymap` type + `resolveKeys` + a `collectBindings` that accepts it — is ~40 lines and belongs in the reference doc regardless. The *capture component*, *conflict detector*, *preset loader*, and *`getLayoutMap()` display* are where a package earns its keep. Given a named consumer (`reelee-web`) this is a real, not speculative, need — but the package/pattern split is the user's call per the dev-tool-first principle.
- **The `acture-hotkeys` extension point:** `bindHotkeys(registry, { keymap?, ... })` and `collectBindings(registry, tiers, keymap?)` — additive, backward-compatible.
- **Scope of the `acture-hotkeys` skill update:** add the customization section (data model, resolution, capture UX, web-gotcha checklist, WCAG 2.1.4) and remove customization from its "What NOT to build" deferral list now that a concrete need exists.

---

## REFERENCES

[1] [Keyboard shortcuts for Visual Studio Code — Official Docs](https://code.visualstudio.com/docs/configure/keybindings) (keybindings.json, bottom-to-top resolution, `-command` removal, chords, editor).
[2] [when clause contexts — VS Code Extension API](https://code.visualstudio.com/api/references/when-clause-contexts).
[3] [Keybinding Issues — microsoft/vscode Wiki](https://github.com/microsoft/vscode/wiki/Keybinding-Issues) (keyCode on Windows, code/scan-codes on macOS+Linux, `keyboard.dispatch`).
[4] [Move keybinding dispatching off e.keyCode — vscode issue #17521](https://github.com/microsoft/vscode/issues/17521).
[5] [KeyboardEvent.code — MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) (physical/layout-independent; AZERTY/Dvorak examples).
[6] [KeyboardEvent.key — MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
[7] [What's new with KeyboardEvents? Keys and codes — Chrome for Developers](https://developer.chrome.com/blog/keyboardevent-keys-codes).
[8] [Keyboard.getLayoutMap() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap) (layoutchange event, iframe privacy limit).
[9] [Keyboard Map — WICG explainer](https://github.com/WICG/keyboard-map/blob/main/explainer.md).
[10] [Why Keyboard Shortcuts don't work on non-US Layouts — tkainrad](https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/).
[11] [All JavaScript Keyboard Shortcut Libraries Are Broken — Hazel Duvall](https://www.hazelduvall.dev/blog/posts/2025-01-10-all-javascript-keyboard-shortcut-libraries-are-broken.html) (tinykeys defaults to `key`; mousetrap/hotkeys-js/react-hotkeys-hook behaviour; German Shift+2 example).
[12] [tinykeys README — jamiebuilds/tinykeys](https://github.com/jamiebuilds/tinykeys/blob/main/README.md) ($mod, sequences, timeout, conflict warning).
[13] [tinykeys source (tinykeys.ts)](https://github.com/jamiebuilds/tinykeys/blob/main/src/tinykeys.ts) (key OR code matching; pending-sequence timeout).
[14] [Shortcut conflicts — tinykeys issue #37](https://github.com/jamiebuilds/tinykeys/issues/37).
[15] [Configure keyboard shortcuts — IntelliJ IDEA Docs](https://www.jetbrains.com/help/idea/configuring-keyboard-and-mouse-shortcuts.html) (conflict warning; copy-on-edit scheme); [Keymap settings](https://www.jetbrains.com/help/idea/settings-keymap.html).
[16] [Keymap troubleshooting — IntelliJ IDEA Docs](https://www.jetbrains.com/help/idea/keyboard-shortcuts-troubleshooting.html).
[17] [Key Bindings — Sublime Text Docs](https://www.sublimetext.com/docs/key_bindings.html) (JSON array, context operators, User overrides Default).
[18] [Key bindings — Zed Docs](https://zed.dev/docs/key-bindings) (context tree, specificity > source > order, prefix wait).
[19] [Keymap System — Zed DeepWiki](https://deepwiki.com/zed-industries/zed/7.4-keymap-system).
[20] [Hotkeys — Obsidian Help](https://help.obsidian.md/hotkeys) (record UX, multiple bindings).
[21] [Notification for hotkey conflict — Obsidian Forum](https://forum.obsidian.md/t/notification-for-hotkey-conflict/2472) (no-conflict-warning grievance).
[22] [Keymaps In-Depth — Atom Flight Manual](https://flight-manual.atom-editor.cc/behind-atom/sections/keymaps-in-depth/) (CSS-selector specificity + load order).
[23] [atom/keybinding-resolver](https://github.com/atom/keybinding-resolver) (resolver panel).
[24] [atom/atom-keymap — selector-based keymap system](https://github.com/atom/atom-keymap).
[25] [Keymaps — GNU Emacs Manual](https://www.gnu.org/software/emacs/manual/html_node/emacs/Keymaps.html); [Local Keymaps](https://www.gnu.org/software/emacs/manual/html_node/emacs/Local-Keymaps.html); [Prefix Keymaps](https://www.gnu.org/software/emacs/manual/html_node/emacs/Prefix-Keymaps.html).
[26] [Leaders — Learn Vimscript the Hard Way](https://learnvimscriptthehardway.stevelosh.com/chapters/06.html); [Neovim map docs](https://neovim.io/doc/user/map.html).
[27] [Customizable shortcuts — Figma Forum feature request](https://forum.figma.com/suggest-a-feature-11/customizable-shortcuts-35580).
[28] [Slack keyboard shortcuts — Slack Help](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts) ("not currently possible… may add in the future").
[29] [chrome.commands API — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/commands) (chrome://extensions/shortcuts, 4-suggestion limit, Ctrl+Shift+0-9, reserved).
[30] [Understanding SC 2.1.4 Character Key Shortcuts — W3C WAI](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts).
[31] [F99: Failure of SC 2.1.4 — W3C WAI](https://www.w3.org/WAI/WCAG21/Techniques/failures/F99).
[32] [Managing keyboard shortcuts using accessibility settings — GitHub Changelog](https://github.blog/changelog/2021-11-15-managing-keyboard-shortcuts-using-accessibility-settings/) (disable Character keys).
[33] [Ability to disable keyboard shortcuts — GitHub Community Discussion #5760](https://github.com/orgs/community/discussions/5760).
[34] [Keymap — Blender Manual](https://docs.blender.org/manual/en/latest/editors/preferences/keymap.html).
[35] [How to check Keymap conflicts? — Blender Artists](https://blenderartists.org/t/how-to-check-keymap-conflicts/1482066) (no built-in conflict detection).
[36] [RebindActionUI — Unity Input System Docs](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.0/api/UnityEngine.InputSystem.Samples.RebindUI.RebindActionUI.html); [Rebind UI advice — Unity Discussions](https://discussions.unity.com/t/input-systems-rebind-ui-sample-and-advice/853345) (replace/swap/duplicate).
[37] [Keyup events not fired if cmd/meta key is pressed — Mozilla Bug 1299553](https://bugzilla.mozilla.org/show_bug.cgi?id=1299553); [Electron #5188](https://github.com/electron/electron/issues/5188); [Should web pages override browser shortcuts — Firefox Bug 380637](https://bugzilla.mozilla.org/show_bug.cgi?id=380637).
[38] [KeyboardEvent.metaKey — MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey).
[39] [Element: keydown event (IME isComposing / keyCode 229) — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event).
[40] [VS Code Tips and Tricks — Keymap extensions](https://code.visualstudio.com/docs/getstarted/tips-and-tricks); [Sublime Text Keymap importer — VS Marketplace](https://marketplace.visualstudio.com/items?itemName=ms-vscode.sublime-keybindings).
[41] [npm trends: hotkey libraries comparison](https://npmtrends.com/@github/hotkey-vs-hotkeys-js-vs-keymaster-vs-mousetrap-vs-react-hotkeys-vs-tinykeys).
