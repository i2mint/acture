# Accessibility APIs and Command Dispatch: Alignment, Intersection, and a Universal macOS Command Palette

*Research note, 2026-09-25. Scope: research only. No acture code was changed.*

## TL;DR

- **acture has no dedicated accessibility research before this note.** The only accessibility content is research-10 §3.7 (WCAG 2.1.4 Character Key Shortcuts and reserved keys) [1], one line in `docs/reference_notes.md` listing accessibility among the callers the `CommandRecord` must *not* grow fields for [2], and an `aria-hidden` on the palette's icon span.
- **Accessibility APIs already carry a command model, and it is a subset of acture's.** Across macOS, AT-SPI, Qt, AccessKit, Android and iOS, the shared shape is *id + localized label (+ description) + key binding(s) + enabled + invoke* [15][29][34][36][37][39]. acture's `CommandRecord` has every one of those (`id`, `title`, `description`, `keybinding`, `when`, `execute`). What acture adds (typed parameters, when-DSL, undo, telemetry) has no counterpart in any accessibility API: accessibility actions take no arguments.
- **The menu bar is the operating system's command registry.** On macOS every native menu item exposes title, `AXEnabled`, shortcut character and modifiers, and a checkmark, and can be invoked with `kAXPressAction` [15][16][17]. That is what the tool the user remembers reads.
- **The tool is almost certainly Paletro** ("Command Palette in any applications", ⇧⌘P, "uses the accessibility feature of macOS to retrieve all available commands from main menu") [46]. Raycast has the same feature built in as *Search Menu Items* [48][49], Alfred has an open-source *Menu Bar Search* workflow [50], and Shortcat is the full-AX-tree variant [52].
- **Alignment gaps in acture** (all small, none needing a new core field except possibly one): no checked/toggle state; the palette hides unavailable commands instead of marking them disabled; keybindings are shown visually but not exposed as `aria-keyshortcuts`; dispatch results are not announced (WCAG 4.1.3); no documented projection from the registry to a native application menu.
- **Recommendation on the universal palette:** don't build it first; Raycast's built-in command is free and does the menu-bar version. If you still want your own, prototype in Hammerspoon (hours), then build the native core in Swift *from scratch*, reusing open-source walkers for reference. Reuse acture's `CommandRecord` **shape** as the interchange format (so `acture-mcp` could expose any Mac app's menus to an AI), not acture's palette code. Details in §6.

## 1. Does acture already have accessibility research?

No dedicated document. A repository-wide search (`accessib|a11y|aria-|screen reader|AXUIElement|NSAccessibility`) over docs, skills, packages and examples found:

- `docs/research/acture_research_10 -- End-User Keyboard-Shortcut Customization.md` §3.7 "Accessibility & reserved keys": WCAG 2.1.4, failure F99, GitHub's "disable character keys" setting [1]. This is the only substantive treatment.
- `docs/reference_notes.md`: accessibility named as one of the callers that would tempt the `CommandRecord` into a god-object; the prescription is composition (`palettable(cmd)`, `toolCallable(cmd)`) [2]. That prescription is the right frame for everything recommended below.
- `docs/research/acture_research_2`: cites GitHub's command-palette doc, which happens to live under GitHub's "accessibility" docs section. Not accessibility content.
- `packages/palette-react/src/palette.tsx`: `aria-hidden="true"` on the icon span.
- No acture issue, ADR or skill mentions accessibility.

## 2. The standards that matter

### 2.1 WAI-ARIA: roles, states, and (the lack of) actions

**Roles a command renders as.** `button` (with `aria-pressed` for a toggle), `menuitem` / `menuitemcheckbox` / `menuitemradio` inside `menu` or `menubar` (the last two are checkable, carrying `aria-checked` true/false/mixed), `toolbar`, and for a palette `combobox` controlling a `listbox` of `option`s, optionally inside a `dialog` [3].

**States a command's metadata drives.** The Core Accessibility API Mappings (Core-AAM) specify how each ARIA state reaches each platform [4]:

| ARIA | macOS AX API | Windows UIA | Linux ATK/AT-SPI |
|---|---|---|---|
| `aria-disabled=true` | `AXEnabled: false` | `IsEnabled: false` | `STATE_DISABLED` |
| `aria-pressed` / `aria-checked` | `AXValue` 0/1/2 | Toggle pattern Off/On/Indeterminate | `STATE_PRESSED` / `STATE_CHECKED` |
| `aria-expanded` | `AXExpanded` | ExpandCollapse pattern | `STATE_EXPANDED` |
| `aria-keyshortcuts` | `AXKeyShortcutsValue` (WebKit) [6]; Core-AAM says "not directly mapped" | `AriaProperties` | object attribute |

**`aria-keyshortcuts`** only *advertises* a shortcut; the page still implements it. Values are `+`-joined UI Events `key` names (`Control+Shift+P`, `Meta+K`), space-separated for alternatives [5]. It is the natural projection of acture's `keybinding` (tinykeys `$mod` must be resolved to `Control` or `Meta` per platform). The spec table and WebKit disagree on the macOS mapping; test in each browser before relying on it.

**Names.** The accessible-name algorithm (accname 1.2) resolves `aria-labelledby` → `aria-label` → host-language label → content → `title`; descriptions come from `aria-describedby`/`aria-description` [7]. So `CommandRecord.title` is the accessible name and `description` the accessible description.

**Actions.** ARIA has no concept of a per-element list of actions beyond the default activation. The **`aria-actions`** proposal adds one: a property referencing other interactive elements that act as secondary actions (a tab's close button, Reply/Delete on a message) [8]. As of mid-2026 the PR is still open, gated on two browser implementations; WebKit and Firefox have implementations (Safari behind a flag), Chromium has an intent to prototype [8][9][10]. The APG ships it only as an *experimental* example [11]. It references DOM elements, not command ids, so a registry would still render real buttons for it to point at.

**The palette pattern.** The APG combobox pattern is the recipe: an input with `role=combobox`, `aria-expanded`, `aria-controls` → `listbox`; DOM focus stays in the input while `aria-activedescendant` tracks the highlighted `option` (`aria-selected=true`); `aria-autocomplete=list`; Down/Up/Enter/Escape/Alt+Down [12].

### 2.2 The accessibility tree

Browsers build an accessibility tree from DOM + ARIA and publish it through the platform API; Core-AAM defines the mapping [4]. The page cannot read its own computed tree except through WebDriver (`computedrole`, `computedlabel`) [13]. The Accessibility Object Model effort delivered ARIA reflection and `ElementInternals` default semantics (Baseline since 2023) [13][14], but abandoned both virtual accessibility nodes (privacy) and dedicated AT action events (assistive technology now sends synthesized click/focus/key events) [13]. **Consequence: a web page cannot today declare named custom actions to assistive technology.** Whatever acture emits on the web must be real DOM with ARIA on it.

### 2.3 macOS: NSAccessibility (server side) and AXUIElement (client side)

- **Actions** (`AXActionConstants.h`): `kAXPressAction`, `kAXShowMenuAction`, `kAXConfirmAction`, `kAXCancelAction`, `kAXIncrementAction`, `kAXDecrementAction`, `kAXRaiseAction`, `kAXPickAction` [15].
- **Client calls:** `AXUIElementCreateApplication(pid)`, `AXUIElementCopyAttributeValue`, `AXUIElementCopyMultipleAttributeValues`, `AXUIElementCopyActionNames`, `AXUIElementPerformAction` [15][60].
- **Menu bar:** `kAXMenuBarAttribute` on the application element; menu items expose `kAXTitleAttribute`, `kAXEnabledAttribute`, `kAXMenuItemCmdCharAttribute`, `kAXMenuItemCmdVirtualKeyAttribute`, `kAXMenuItemCmdGlyphAttribute`, `kAXMenuItemCmdModifiersAttribute` (bitmask; ⌘ is implied unless `kAXMenuItemModifierNoCommand` is set) and `kAXMenuItemMarkCharAttribute` (the checkmark) [16][17][60].
- **Custom actions:** apps can add named actions with `NSAccessibilityCustomAction(name:handler:)` via `accessibilityCustomActions` (macOS 10.13+) [18].
- **Permission:** a client needs the *Accessibility* grant (System Settings → Privacy & Security → Accessibility); check/prompt with `AXIsProcessTrustedWithOptions` [19]. Apple DTS: "We do not support the Accessibility APIs in sandboxed apps"; the sandbox-friendly alternative (Input Monitoring + `CGEventTap`) covers event taps only [20][21][62]. In practice: notarized direct distribution, not the Mac App Store.
- **Web content in Chromium/Electron** is only exposed once AT is detected; clients set `AXManualAccessibility` on the app element (Electron), with `AXEnhancedUserInterface` reserved for VoiceOver and linked to bugs [22][23]. The *native menu bar* of Electron apps is exposed regardless.
- **Timeouts:** each AX call is a cross-process round trip with a default ~6 s timeout; `AXUIElementSetMessagingTimeout` bounds it, and a naive walk of a hung app stalls [24].

### 2.4 Windows: UI Automation

UIA expresses behaviour as **control patterns**, not an action list: `Invoke` (buttons, menu items), `Toggle` (checkable items), `ExpandCollapse` (menus), `SelectionItem` (list items), `LegacyIAccessible` (MSAA bridge) [25]. Shortcuts are the `AcceleratorKey` (e.g. "Ctrl+O") and `AccessKey` (Alt mnemonic) properties [26]. Custom behaviour needs a process-wide custom pattern registered by GUID [27]. MSAA has a single default action. PowerToys Command Palette is Microsoft's OS-level palette, extended by plug-ins rather than by reading other apps' menus [28].

### 2.5 Linux: AT-SPI2 and exported menus

AT-SPI2's `Action` interface is the closest match to a command list: `get_n_actions`, `get_localized_name(i)`, `get_action_description(i)`, `get_key_binding(i)`, `do_action(i)` [29]. Separately, `com.canonical.dbusmenu` and GTK `GMenuModel` export whole application menus over D-Bus; Unity's HUD was a fuzzy palette over that export [30][31]. Plotinus (a GTK module, abandoned c. 2017) and KDE's KCommandBar (built into KXMLGui) gave palettes over toolkit menu models with no per-app work [32][33].

### 2.6 Cross-platform action models

| API | Action record | Enablement | Key binding | Arguments |
|---|---|---|---|---|
| AccessKit (Rust) | `Action` enum + `CustomAction { id: i32, description }` [34][35] | node state | node property | none (except `SetValue` etc.) |
| Android | `AccessibilityAction(id, label)` [36] | action presence | — | bundle, rarely used |
| iOS | `UIAccessibilityCustomAction(name, handler)` [37] | presence | — | none |
| Flutter | `CustomSemanticsAction(label)` [38] | presence | — | none |
| Qt | `QAccessibleActionInterface`: `actionNames`, `doAction`, `keyBindingsForAction` [39] | — | per action | none |
| AT-SPI2 | `Action` interface [29] | `STATE_SENSITIVE` | per action | none |
| **acture** | `CommandRecord { id, title, description, keybinding, when, params, execute }` | `when` | `keybinding` | **Zod/JSON Schema** |

The pattern is unanimous: **accessibility actions are zero-argument, labelled, optionally key-bound, and enablement is expressed by state or by presence.** acture's `params` go beyond every accessibility API; its nearest relatives there are MCP and AI tool schemas, which acture already targets.

### 2.7 WCAG success criteria a command system touches

- **2.1.1 Keyboard (A)**: all functionality operable from a keyboard [40]. A palette that reaches every command is a strong, cheap way to satisfy this for pointer-only UI.
- **2.1.4 Character Key Shortcuts (A)**: single-character shortcuts must be switchable off, remappable to include a modifier, or active only on focus [41]; already covered in research-10 [1].
- **2.5.3 Label in Name (A)**: the accessible name contains the visible label, because speech-input users say what they see [42]. Deriving button, menu and palette labels from the same `title` gets this for free.
- **4.1.2 Name, Role, Value (A)**: name, role, and states (including disabled and checked) are programmatically determinable and changes are notified [43].
- **4.1.3 Status Messages (AA)**: status messages are announced without moving focus [44]. A dispatch that succeeds or fails silently after the palette closes is the typical miss.

VS Code is the clearest working example of "the command registry is the accessibility surface": palette with shortcut hints, Keyboard Shortcuts editor, Accessibility Help (Alt+F1), Accessible View, and commands for audio cues and announcements [45]. No formal publication framing command registries as an accessibility asset was found.

## 3. How acture's command model aligns with these standards

**What maps cleanly** (every item is a *projection* of existing fields, so the closed `CommandRecord` needs no change):

| acture | Web / ARIA | macOS AX | Windows UIA | AT-SPI2 |
|---|---|---|---|---|
| `title` | accessible name | `AXTitle` | `Name` | `get_localized_name` |
| `description` | `aria-description` | `AXHelp` | `HelpText` | `get_action_description` |
| `category` | `group` / submenu | parent `AXMenu` | parent menu | parent menu |
| `keybinding` | `aria-keyshortcuts` | `AXMenuItemCmdChar` + `Modifiers` | `AcceleratorKey` | `get_key_binding` |
| `when` (evaluated) | `aria-disabled` | `AXEnabled` | `IsEnabled` | `STATE_SENSITIVE` |
| `execute` via `dispatch(id)` | click / Enter | `kAXPressAction` | `Invoke` | `do_action` |
| `kind: "handoff"` | item opens a `dialog` | menu title ending in "…" | — | — |
| `registry.onCommandsChanged` | re-render | tree-changed notification | structure-changed event | children-changed |

The `kind: "handoff"` row deserves a note: the Mac and Windows convention of ending a menu title with an ellipsis when the command needs more input before acting [69] is exactly acture's atomic/handoff split, and `acture-palette-react` already renders a `…` badge for handoff commands. The two traditions arrived at the same distinction independently.

**Where acture falls short today:**

1. **No checked/toggle state.** Commands like "Toggle sidebar" or "Word wrap" are checkable items on every platform (`menuitemcheckbox`/`aria-checked`, `AXMenuItemMarkChar`, UIA Toggle, `STATE_CHECKED`) [3][16][25]. acture's record has no way to say "this command is currently on", so a palette or menu built from it cannot show or announce the state (WCAG 4.1.2 [43]). This is the one gap that may justify new data. Per the closed-record rule and `reference_notes` [2], the first move is composition: a separate `(ctx) => boolean | "mixed"` state projection keyed by command id (the view registry from `acture-ai-assistant` is a precedent), not a field on the record. Needs a named consumer before anything lands.
2. **Unavailable commands are hidden, not disabled.** `CommandPalette` lists `registry.list({ ctx })`, which filters out commands whose `when` is false. cmdk already supports `aria-disabled` on options. Hiding is a legitimate palette choice (VS Code hides too), but menus conventionally show disabled items, and a menu projection should use `when` for `aria-disabled`/`AXEnabled`, not for filtering. Worth an explicit decision in the palette-design skill.
3. **Shortcuts are shown but not exposed.** `DefaultItem` renders the formatted keybinding in a `<kbd>`, so a screen reader reads it as text inside the option's name, and no `aria-keyshortcuts` is emitted [5]. Emitting it on menu/button projections (where the shortcut is live) is cheap; on palette options it is debatable, since the option itself isn't activated by that shortcut.
4. **Dispatch results are not announced.** `Result` has `ok`/`error.message`, but nothing routes it to an `aria-live` region after the palette closes (WCAG 4.1.3 [44]). A tiny announcer consumer (dispatch middleware → polite live region) would cover every surface at once.
5. **The palette's own ARIA is inherited, and untested.** `acture-palette-react` builds on cmdk 1.1, which emits `role=combobox` with `aria-autocomplete=list`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and `listbox`/`option`/`aria-selected`/`aria-disabled` [68]: the APG combobox pattern [12]. acture adds `label="Command palette"`. No acture test asserts any of this, and the picker-chain and form-handoff views (focus movement when the view switches) have not been audited.
6. **WCAG 2.1.4 is satisfiable but not packaged.** `acture-hotkeys` supports user keymaps with a `remove` (unbind) entry, which meets "turn off/remap" per binding. There is no one-switch "disable character-key shortcuts" option in the GitHub style that research-10 recommended [1].

## 4. Intersection: can acture emit or consume accessibility metadata?

### 4.1 Emit

- **Web (ARIA):** a pure projection `toAriaProps(record, ctx) → { 'aria-label', 'aria-description', 'aria-disabled', 'aria-keyshortcuts' }` plus role chosen by the rendering surface (button, menuitem, option). No `CommandRecord` change. This is the "agent-written" path the positioning doc favours [2]: ~30 lines a project can own. Later, if `aria-actions` ships, a component could render a command group's secondary actions as real buttons and point at them [8][11].
- **Native application menu (the high-value one):** when an acture app runs in Electron or Tauri, projecting the registry into the native menu (Electron `MenuItem { label, accelerator, enabled, checked, type: 'checkbox', click: () => dispatch(id) }`) [70], or Tauri's equivalent menu API [71], makes the OS accessibility tree carry acture's commands *for free*: VoiceOver, macOS Help-menu search [61], Paletro [46], Raycast [49] and every AX client can then read and invoke them. It is also the only way a web-tech app's commands become visible to OS-level palettes. Candidate for a hand-written reference doc (`docs/hand-written-native-menu.md`), mirroring the existing `hand-written-*` pattern.
- **Native AX custom actions:** only relevant to native (Swift/AppKit) hosts; `NSAccessibilityCustomAction`/Android/iOS custom actions each take `{label, handler}`, which is `{title, () => dispatch(id)}` [18][36][37]. Parameterized commands would be exposed only if atomic with defaults, or as a handoff that opens a form.

### 4.2 Consume

The same table read in the other direction turns any accessibility source into `CommandRecord`s: `id` from the menu path (`app.<bundle>.file.saveAs`), `title` from `AXTitle`, `keybinding` from `AXMenuItemCmdChar` + `Modifiers`, `when` from `AXEnabled` (evaluated at list time), `execute` = re-resolve path → `kAXPressAction`, no `params`. Two uses follow:

- **A universal palette** (§5–6): the consumer adapter *is* the tool.
- **An AI surface for any Mac app:** feed those records to `acture-mcp` and an agent can operate any app's menu commands by id, with discovery and enablement, rather than by screen coordinates. Peekaboo already exposes menu listing/clicking to agents this way [67]; acture's contribution would be the uniform schema and the MCP projection, not the AX work.

**Mismatch to respect.** An AX-derived record is a *snapshot of another process's state*: titles change ("Undo Typing" → "Undo Paste"), items appear lazily, enablement changes with selection [50][63]. acture's registry assumes the host owns the state and the handlers. A consuming adapter must therefore re-read on open (or on `AXObserver` notifications) and tolerate `execute` failing because the item has gone.

## 5. The universal command palette for macOS

### 5.1 What the user remembers

The description matches **Paletro**: "Command Palette in any applications", invoked with ⇧⌘P, which "uses the accessibility feature of macOS to retrieve all available commands from main menu of current running app"; fuzzy search, shows each item's shortcut, per-app exclusions; $6.99 direct or on Setapp [46][47]. The "accessibility specification" the user recalls is the application's **accessibility tree**, specifically its menu bar (`AXMenuBar`) as exposed through the AX API, which the tool may read only after the user grants it the Accessibility permission.

Other tools of the same kind:

| Tool | Reads | Notes |
|---|---|---|
| Raycast *Search Menu Items* | frontmost app's menu bar | built in since v1.20, free, needs Accessibility access [48][49] |
| Alfred *Menu Bar Search* | menu bar | open-source Swift, caching, per-app settings [50]; port of ctwise's `menudump` [51] |
| CmdKeys | menu bar | ⇧⌘K, $6 [54] |
| Shortcat | **whole AX tree** (window elements, menus, windows) | "Universal command palette for your Mac"; works in browsers and Electron [52][53] |
| Homerow (ex-Vimac) | whole AX tree | keyboard hints + search; Vimac is open source [55][56] |
| Menuwhere, KeyCue | menu bar | menus at the pointer / shortcut cheat sheet, not palettes [57][58] |
| macOS Help menu (⇧⌘/) | menu bar | built in; type to find menu items [61] |
| Hammerspoon | menu bar or any AX element | `hs.application:getMenuItems`, `selectMenuItem` [59] |

### 5.2 How they work

From the open-source implementations [50][60]:

1. Global hotkey. Before showing any UI, capture the target: `NSWorkspace.shared.frontmostApplication` (or `menuBarOwningApplication`).
2. `AXUIElementCreateApplication(pid)` → `kAXMenuBarAttribute` → recurse `kAXChildrenAttribute`, reading title, enabled, cmd char/modifiers/virtual key, mark char per item. Hammerspoon reads them in **one** `AXUIElementCopyMultipleAttributeValues` call per item to cut round trips and skips the Apple menu [60]; Menu-Bar-Search walks top-level menus in parallel and caches per bundle id, clearing the cache after an action because state changes [50].
3. Fuzzy-rank `{path, title, enabled, shortcut}` in a non-activating panel.
4. On select: hide the panel, reactivate the target, re-resolve the path, `AXUIElementPerformAction(item, kAXPressAction)`.
5. (Shortcat tier) Walk `kAXFocusedWindowAttribute` for buttons, checkboxes, toolbar items; set `AXManualAccessibility` on Electron apps to reveal web content [22][56].

**Known hard parts:** hung apps stall calls without a messaging timeout [24]; lazily built submenus [63]; non-standard menus in some apps; Electron/Chrome web content hidden until forced on [22][23]; Mac App Store is effectively closed to this [20][21].

### 5.3 How hard is it to build

| Scope | Stack | Size / effort |
|---|---|---|
| Prototype, menu bar only | Hammerspoon: `getMenuItems` + `hs.chooser` [59] | tens of lines of Lua; hours |
| Menu-bar palette, shippable | Swift/AppKit | Menu-Bar-Search's `AX.swift` is 518 lines, ~1.2–1.5k lines of hand-written Swift total [50]; a comparable MVP is days |
| Full-tree (Shortcat/Homerow class) | Swift/AppKit | substantially more (element filtering, hinting, Electron handling, performance); weeks |

Stack alternatives: Tauri (Rust AX crates such as `accessibility` / `objc2-application-services`, React UI) [72]; Electron (no maintained npm AXUIElement binding; `node-mac-permissions` only handles permission [66]; you'd ship a native addon or Swift helper); Python via `pyax` or pyobjc `ApplicationServices` (fine for experiments; the permission then attaches to the interpreter) [65]; a Raycast extension (TypeScript + Swift tools [64]), pointless since Raycast already ships the command.

## 6. Recommendation: reuse acture or build from scratch?

**Split the tool into its three parts and decide per part.**

| Part | Share of the work | acture's contribution |
|---|---|---|
| Native core: permission, frontmost-app capture, AX walk, timeouts, caching, re-resolve + press, notarization | most of it, and all the risk | **none.** acture has no native code and its handlers, params, undo, when-DSL and telemetry have nothing to attach to (AX actions are zero-arg and the state lives in another process) |
| Registry of what's invocable | small | the **`CommandRecord` shape** as the record format (§4.2 mapping); the registry code itself is ~80 lines (see [`docs/hand-written-registry.md`](../hand-written-registry.md)) |
| Palette UI + fuzzy search | small | `acture-palette-react` (cmdk) only if the UI is a webview (Tauri/Electron); a native `NSPanel` gets nothing from it |

**Recommendation:**

1. **Don't build yet.** Use Raycast's built-in *Search Menu Items* (free) or Paletro for a week [46][49]. If what you miss is web-app content (Gmail, Notion inside Chrome), that's Shortcat's full-tree tier [52], a much bigger build.
2. **If building, prototype in Hammerspoon first** (hours), to find out whether menu-bar-only is enough for your apps [59].
3. **Build the native core from scratch in Swift**, reading Menu-Bar-Search and Hammerspoon's `libapplication.m` as references (check Menu-Bar-Search's license before copying; Hammerspoon is MIT) [50][60]. Don't try to make it an acture package: it would violate acture's dev-tool-first positioning and the no-god-package rule by pulling native, platform-specific code into a TypeScript library.
4. **Reuse acture where it adds something the market tools lack: interchange and AI.** Have the Swift core emit menu items as `CommandRecord`-shaped JSON (id from path, title, keybinding, enabled). Then (a) an `acture-mcp` server can expose "every menu command of the frontmost app" to an agent, and (b) the same palette can merge your own apps' acture registries with OS menus. That is the one capability the existing tools don't offer, and it's where acture's schema bridge earns its keep.
5. **For acture itself, the valuable direction is emitting, not consuming**: the native-menu projection (§4.1) makes every acture app visible to Paletro, Raycast, VoiceOver and the Help menu with no new core field.

## 7. Follow-up

Filed as one acture issue: close the accessibility gaps listed in §3 (palette ARIA/focus test, disabled-vs-hidden decision, dispatch-result announcer, toggle-state projection design, `aria-keyshortcuts` in projections) and write a `hand-written-native-menu.md` reference for §4.1. The universal palette itself is not an acture task and has no issue; it's the user's call whether to start it as a new project.

## REFERENCES

[1] acture research-10 — [End-User Keyboard-Shortcut Customization, §3.7](./acture_research_10%20--%20End-User%20Keyboard-Shortcut%20Customization.md)
[2] acture — [docs/reference_notes.md](../reference_notes.md) (composition over record fields)
[3] W3C — [WAI-ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/)
[4] W3C — [Core Accessibility API Mappings 1.2](https://w3c.github.io/core-aam/)
[5] MDN — [aria-keyshortcuts](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts)
[6] WebKit — [commit adding AXKeyShortcutsValue](https://github.com/WebKit/WebKit/commit/f7a887f4c25742af054956aec6cf2ef5c2512e14)
[7] W3C — [Accessible Name and Description Computation 1.2](https://w3c.github.io/accname/)
[8] w3c/aria — [PR #1805: aria-actions](https://github.com/w3c/aria/pull/1805)
[9] W3C ARIA WG — [minutes, 28 May 2026](https://www.w3.org/2026/05/28-aria-minutes.html)
[10] blink-dev — [Intent to Prototype: aria-actions](http://www.mail-archive.com/blink-dev@chromium.org/msg16670.html)
[11] W3C APG — [Tabs with Action Buttons (experimental)](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-actions/)
[12] W3C APG — [Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
[13] WICG — [Accessibility Object Model explainer](https://wicg.github.io/aom/explainer.html)
[14] MDN — [ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)
[15] Apple — [AXActionConstants.h](https://developer.apple.com/documentation/applicationservices/axactionconstants_h)
[16] Apple (archived) — [AXAttributeConstants.h](https://leopard-adc.pepas.com/documentation/Accessibility/Reference/AccessibilityLowlevel/AXAttributeConstants_h/CompositePage.html)
[17] Apple — [AXMenuItemModifiers](https://developer.apple.com/documentation/applicationservices/axmenuitemmodifiers)
[18] Apple — [NSAccessibilityCustomAction](https://developer.apple.com/documentation/appkit/nsaccessibilitycustomaction)
[19] Apple — [AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
[20] Apple Developer Forums — [Accessibility permission in sandboxed app (707680)](https://developer.apple.com/forums/thread/707680)
[21] Apple Developer Forums — [AX permission for sandboxed menu-bar app (810677)](https://developer.apple.com/forums/thread/810677)
[22] Electron — [Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility)
[23] electron/electron — [issue #37465](https://github.com/electron/electron/issues/37465)
[24] Apple — [AXUIElementSetMessagingTimeout](https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout)
[25] Microsoft — [UI Automation Control Patterns Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview)
[26] Microsoft — [Automation Element Property Identifiers](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-automation-element-propids)
[27] Microsoft — [Register custom properties, events, and control patterns](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-regcustompropseventpatterns)
[28] Microsoft — [PowerToys Command Palette overview](https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview)
[29] GNOME — [AT-SPI2 Action interface](https://docs.gtk.org/atspi2/iface.Action.html)
[30] dbusmenu — [com.canonical.dbusmenu.xml](https://github.com/gnustep/libs-dbuskit/blob/master/Bundles/DBusMenu/com.canonical.dbusmenu.xml)
[31] Ubuntu Wiki — [Unity/HUD](https://wiki.ubuntu.com/Unity/HUD)
[32] p-e-w — [Plotinus](https://github.com/p-e-w/plotinus)
[33] KDE Discuss — [Find menu items in KDE apps with KCommandBar](https://discuss.kde.org/t/find-menu-items-in-kde-apps-easily-with-kcommandbar/773)
[34] docs.rs — [accesskit::Action](https://docs.rs/accesskit/latest/accesskit/enum.Action.html)
[35] docs.rs — [accesskit::CustomAction](https://docs.rs/accesskit/latest/accesskit/struct.CustomAction.html)
[36] Android — [AccessibilityNodeInfo.AccessibilityAction](https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo.AccessibilityAction)
[37] Apple — [UIAccessibilityCustomAction](https://developer.apple.com/documentation/uikit/uiaccessibilitycustomaction)
[38] Flutter — [CustomSemanticsAction](https://api.flutter.dev/flutter/semantics/CustomSemanticsAction-class.html)
[39] Qt — [QAccessibleActionInterface](https://doc.qt.io/qt-6/qaccessibleactioninterface.html)
[40] W3C — [Understanding SC 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
[41] W3C — [Understanding SC 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)
[42] W3C — [Understanding SC 2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)
[43] W3C — [Understanding SC 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
[44] W3C — [Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
[45] VS Code — [Accessibility](https://code.visualstudio.com/docs/configure/accessibility/accessibility)
[46] appmakes — [Paletro](https://appmakes.io/paletro)
[47] Setapp — [Paletro](https://setapp.com/apps/paletro)
[48] Raycast — [v1.20.0 changelog](https://www.raycast.com/changelog/1-20-0)
[49] Raycast Manual — [Navigation](https://manual.raycast.com/navigation)
[50] BenziAhamed — [Menu-Bar-Search](https://github.com/BenziAhamed/Menu-Bar-Search)
[51] ctwise — [alfred-workflows/menu-bar-search](https://github.com/ctwise/alfred-workflows/tree/master/menu-bar-search)
[52] Shortcat — [shortcat.app](https://shortcat.app/)
[53] Shortcat — [docs](https://shortcat.app/docs)
[54] CmdKeys — [cmdkeys.com](https://cmdkeys.com/)
[55] Homerow — [homerow.app](https://www.homerow.app/)
[56] Vimac — [repository](https://github.com/nchudleigh/vimac)
[57] Many Tricks — [Menuwhere](https://manytricks.com/menuwhere/)
[58] Ergonis — [KeyCue](https://ergonis.com/en/keycue/)
[59] Hammerspoon — [hs.application](https://www.hammerspoon.org/docs/hs.application.html)
[60] Hammerspoon — [libapplication.m](https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/application/libapplication.m)
[61] MacMost — [The super-powerful Mac keyboard shortcut most people don't use](https://macmost.com/the-super-powerful-mac-keyboard-shortcut-that-most-people-dont-use.html)
[62] jano.dev — [Accessibility Permission in macOS](https://jano.dev/apple/macos/swift/2025/01/08/Accessibility-Permission.html)
[63] trycua/cua — [PR #3945 (lazy submenus)](https://github.com/trycua/cua/pull/3945)
[64] Raycast — [extensions-swift-tools](https://github.com/raycast/extensions-swift-tools)
[65] eeejay — [pyax](https://github.com/eeejay/pyax)
[66] codebytere — [node-mac-permissions](https://github.com/codebytere/node-mac-permissions)
[67] openclaw — [Peekaboo](https://github.com/openclaw/Peekaboo)
[68] pacocoursey — [cmdk](https://github.com/pacocoursey/cmdk) (ARIA attributes verified in the installed 1.1.1 build)
[69] Apple — [Human Interface Guidelines: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
[70] Electron — [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item)
[71] Tauri — [Window Menu](https://v2.tauri.app/learn/window-menu/)
[72] t8r.tech — [AXUIElement in Rust](https://t8r.tech/t/docs-rs-accessibility-crate-axuielement-rust-macos)
