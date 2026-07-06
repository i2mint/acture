# The hand-written keymap-override layer — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise true for **end-user keybinding customization**: a developer can let users
remap shortcuts — with persistence, resolution, and conflict detection — over the
existing registry, with **zero `acture-*` dependency**, by hand-writing the
~50-line layer below.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. Read
[`docs/hand-written-command-sequence.md`](hand-written-command-sequence.md) too:
this doc is its sibling. Where that one makes the *macro/e2e consumer* reproducible,
this one makes the *user-customization layer* on top of the **hotkeys** surface
reproducible. The evidence base is
[`docs/research/acture_research_10 -- End-User Keyboard-Shortcut Customization.md`](research/acture_research_10%20--%20End-User%20Keyboard-Shortcut%20Customization.md).

---

## Why this is (mostly) a doc, not (all) a package

The load-bearing insight from research-10: the `CommandRecord.keybinding` field is
the **developer default**, and user customization is a **separate override layer
composed over it at bind time** — *not* a new field on the record. The record
surface stays closed (see `acture-command-record-shape`); the customization lives
entirely outside it, as data plus two pure functions.

That core — the `UserKeymap` shape, `resolveKeys`, a keymap-aware `collectBindings`,
and a conflict pass — is small and stable enough to be *this reference*: an agent
adapts it into the target project, which owns every line. What genuinely earns a
package (if anything does) is the **UI-and-browser-bound** piece — the press-to-record
capture component, the `navigator.keyboard.getLayoutMap()` display layer, the preset
loader — the same split as `acture-e2e-playwright` (the runner glue is the package;
the sequence engine is the doc).

| | Hand-write (this doc) | An optional `acture-hotkeys` helper |
| --- | --- | --- |
| `UserKeymap` shape, `resolveKeys`, keymap-aware `collectBindings`, conflict pass | yes — the code below | yes — the same shapes, re-exported |
| Dependency added | none | one (`acture-hotkeys` + `tinykeys` peer) |
| Press-to-record capture, `getLayoutMap()` labels, preset seeding | hand-write the UI you need | tested, for free (if it ships) |
| Persistence backend (localStorage / IndexedDB / server row) | the project's choice — it's a `Map` over storage | not covered — the project owns its store |

Whether that helper ships at all is the user's call (dev-tool-first). This doc
stands on its own regardless.

---

## The minimal keymap-override layer

Complete. Copy into the target project (e.g. `src/keymap.ts`), adapt names, delete
what you don't need. It depends only on the registry/record shape; the ~3-line
`normalizeKeybinding` below is hand-written — the binder's own copy in
`packages/hotkeys/src/bind.ts` is module-private, so re-declare it, don't import it.

```ts
/* ── The override shape ─────────────────────────────────────────────── */

/** One user override for a single command. `when` is deliberately NOT
 *  overridable: users change keys, not availability scope — this dodges
 *  VS Code's "empty-when shadows a scoped default" footgun (research-10 §3.2). */
export type KeybindingOverride =
  | { kind: 'replace'; keys: string[] } // replace the record default entirely
  | { kind: 'add'; keys: string[] }     // keep default AND add these
  | { kind: 'remove' };                 // unbind (VS Code's -command / Zed null)

/** The persisted user keymap: SPARSE — only changed commands appear.
 *  A command absent from `overrides` uses its record default. Survives
 *  registry churn: a removed command just leaves a dead entry. */
export interface UserKeymap {
  readonly version: 1;              // schema version, for future migration
  readonly basePreset?: string;     // e.g. 'vscode' | 'vim' — for portability
  readonly overrides: Readonly<Record<string, KeybindingOverride>>;
}

export const EMPTY_KEYMAP: UserKeymap = { version: 1, overrides: {} };

/* ── Resolution: compose record default + user override ─────────────── */

/** Minimal record shape this layer needs. `acture`'s CommandRecord and a
 *  hand-written registry both satisfy it. */
interface KeybindableRecord {
  readonly id: string;
  readonly keybinding?: string | readonly string[];
}

/** tinykeys tokens are strings; a record may carry one or several. */
function normalizeKeybinding(kb: KeybindableRecord['keybinding']): string[] {
  if (kb === undefined) return [];
  return typeof kb === 'string' ? [kb] : [...kb];
}

/** Effective key sequences for one command, given the user layer.
 *  Returns the tinykeys tokens that should now trigger this command. */
export function resolveKeys(cmd: KeybindableRecord, km: UserKeymap): string[] {
  const o = km.overrides[cmd.id];
  const base = normalizeKeybinding(cmd.keybinding);
  if (!o) return base;
  switch (o.kind) {
    case 'remove':
      return [];
    case 'replace':
      return [...o.keys];
    case 'add':
      return [...base, ...o.keys];
  }
}

/* ── Binding table: the same shape the fire-logic already consumes ──── */

export interface BindingDescriptor {
  readonly keySequence: string;
  readonly commandId: string;
  readonly when?: unknown; // the record's WhenClause — inherited, never overridden
  /** True when this command carries a user override. User-touched
   *  descriptors sort BEFORE untouched defaults on the same key, so a
   *  user rebinding wins the key (research-10 §5.2). */
  readonly userTouched: boolean;
}

interface ListingRegistry {
  list(opts?: { tiers?: readonly string[] | 'all' }): readonly (KeybindableRecord & {
    when?: unknown;
  })[];
}

/**
 * Build the key-sequence → ordered-descriptors table, honouring the user
 * keymap. Identical output shape to the default-only `collectBindings`
 * (packages/hotkeys/src/bind.ts) — so the existing fire logic ("first
 * descriptor whose `when` matches the live context wins") is UNCHANGED.
 * User-touched descriptors are ordered first within each key bucket.
 */
export function collectBindings(
  registry: ListingRegistry,
  tiers?: readonly string[] | 'all',
  km: UserKeymap = EMPTY_KEYMAP,
): Map<string, BindingDescriptor[]> {
  const table = new Map<string, BindingDescriptor[]>();
  const list = registry.list(tiers !== undefined ? { tiers } : undefined);
  for (const cmd of list) {
    const userTouched = km.overrides[cmd.id] !== undefined;
    for (const raw of resolveKeys(cmd, km)) {
      const key = raw.trim(); // preserve `$mod`; normalize whitespace only
      const arr = table.get(key) ?? [];
      arr.push({ keySequence: key, commandId: cmd.id, when: cmd.when, userTouched });
      table.set(key, arr);
    }
  }
  // Stable partition: user-touched first, registration order preserved within.
  for (const arr of table.values()) {
    arr.sort((a, b) => Number(b.userTouched) - Number(a.userTouched));
  }
  return table;
}

/* ── Conflict detection: a pure pass over the resolved table ────────── */

export interface KeymapConflict {
  readonly keySequence: string;
  readonly commandIds: string[];
  /** 'definite' when neither command has a `when` (they always co-fire);
   *  'possible' when at least one has a `when` (may be mutually exclusive). */
  readonly severity: 'definite' | 'possible';
}

/** Report keys bound by ≥2 commands. Same-key bindings whose `when`
 *  clauses are mutually exclusive are NOT a true conflict — acture can
 *  only prove that when neither has a `when`, so anything with a `when`
 *  is reported as 'possible', not 'definite'. */
export function detectConflicts(
  table: Map<string, BindingDescriptor[]>,
): KeymapConflict[] {
  const conflicts: KeymapConflict[] = [];
  for (const [keySequence, descriptors] of table) {
    if (descriptors.length < 2) continue;
    const anyScoped = descriptors.some((d) => d.when !== undefined);
    conflicts.push({
      keySequence,
      commandIds: descriptors.map((d) => d.commandId),
      severity: anyScoped ? 'possible' : 'definite',
    });
  }
  return conflicts;
}

/* ── Persistence: it's already JSON ─────────────────────────────────── */

/** A `UserKeymap` is plain data — `JSON.stringify` to save, `JSON.parse`
 *  to load, into localStorage / IndexedDB / a per-user server row. The
 *  `version` field lets you migrate later. Import/export is that same
 *  string. No serializer to write. */
```

That's the whole layer. ~50 lines, zero dependencies, owned by the project. Wire it
into the binder by passing the keymap to `collectBindings` and re-running on any
keymap change (the same recompute the binder already does on `commandsChanged`).

---

## The capture step — press-to-record (sketch)

This is the UI-bound piece — where a package, if one ships, earns its keep. The
model every praised product uses (Obsidian / JetBrains / games, research-10 §5.3):

```ts
/** Build a tinykeys token from a keydown. Ignores lone modifier presses;
 *  emits `$mod`/`Shift`/`Alt` + the mnemonic key. Default matches on
 *  `event.key` (tinykeys' default); a positional mode would use `event.code`. */
export function tokenFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === 'Control' || k === 'Meta' || k === 'Shift' || k === 'Alt') return null;
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push('$mod'); // portable primary modifier
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  return [...mods, k.length === 1 ? k.toLowerCase() : k].join('+');
}
```

The capture flow around it: enter a *listening* state → build the token(s) (join
chords with a space within ~1 s) → **reject browser/OS-reserved combos** (`Cmd+W`,
`Ctrl+T`, `Ctrl+R`, …) → run `detectConflicts` on the prospective table and, on a
hit, show **"Already assigned to *X* — [Reassign] [Keep both] [Cancel]"** → commit
by writing the override to the `UserKeymap` store. Label existing bindings via
`navigator.keyboard.getLayoutMap()` when available, falling back to the raw token.

See research-10 §5.4 for the full web-gotcha checklist (IME composition, macOS ⌘
keyup, `keydown` vs `keypress`, `preventDefault` discipline). Handle every item.

---

## Why each piece is shaped this way

- **The override lives outside `CommandRecord`.** The record's `keybinding` is the
  developer default; the user layer is separate, sparse, id-keyed data. No new
  field, no schema change — the closed-surface principle holds (research-10 §5.1).

- **`resolveKeys` composes; `collectBindings` still emits the same table.** The
  fire logic in `bind.ts` ("first descriptor whose `when` matches wins", evaluated
  at *fire* time so dynamic `when` works) is untouched. Customization is a
  *pre-processing* of the binding table, not a change to dispatch.

- **User-touched descriptors sort first.** This yields VS Code's "user override
  wins, scope still respected" semantics (research-10 §3.2) using acture's existing
  first-match scan. A finer-grained per-key source tag is an available refinement;
  command-level `userTouched` covers the real cases.

- **Users override keys, never `when`.** The effective binding inherits the
  record's `when`. This is the safe subset — it avoids the empty-`when` footgun and
  keeps availability a developer concern.

- **Conflict severity is honest about `when`.** acture proves a definite conflict
  only when neither command is scoped; anything scoped is 'possible'. Don't claim
  certainty the `when` DSL can't give — surface both, let the user decide.

- **Persistence is JSON over a `Map`-like store.** A `UserKeymap` is data. The
  project picks the backend (localStorage, IndexedDB, a server row) — a
  `MutableMapping<commandId, KeybindingOverride>` facade is all it is.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears:

- **Per-key source tagging.** `userTouched` is command-level. Track which specific
  key came from an override only if a project mixes `add` overrides with default
  collisions in a way that command-level ordering gets wrong.
- **Preset packs (Vim / VS Code keymaps).** `basePreset` is a seed field; a preset
  is just a `UserKeymap` you merge in. Ship named presets when a user asks.
- **Cloud sync.** Syncing the `UserKeymap` JSON across a user's machines is a
  storage concern, not a keymap concern — `$mod` already makes tokens portable.
- **Rich conflict UI / a resolver panel.** `detectConflicts` returns data; render
  it when the project has a settings surface that needs it.
- **WCAG "disable character-key shortcuts" toggle.** Required once you ship
  single-key bindings (research-10 §3.7) — a global flag that filters single-key
  tokens out of `collectBindings`. Add it with the customization UI, not before.

---

## Faithfulness note

The shapes here — `UserKeymap`, `KeybindingOverride`, `resolveKeys`,
`collectBindings`, `detectConflicts` — are deliberately the shapes
**`acture-hotkeys` now exports** (`bindHotkeys({ keymap })`, `resolveKeys`,
`detectConflicts`, plus the capture/display primitives `tokenFromEvent` /
`isReservedCombo` / `formatKeybinding` / `layoutLabel`), and its `collectBindings`
is a superset of this one (`collectBindings(registry, tiers?, keymap?)`; the
`keymap` argument defaults to `EMPTY_KEYMAP` so existing
`collectBindings(registry, tiers)` calls are unaffected). Hand-write from this
doc, or install the package — the per-consumer choice (dev-tool-first). An agent
that hand-writes and later installs finds the migration mechanical. If the
package contract changes, this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- [`docs/research/acture_research_10 -- End-User Keyboard-Shortcut Customization.md`](research/acture_research_10%20--%20End-User%20Keyboard-Shortcut%20Customization.md) — the evidence base (product survey, resolution semantics, web gotchas).
- `acture-hotkeys` skill — the hotkeys surface this layer sits on; covers the customization section.
- `acture-command-record-shape` — why `keybinding` stays a closed field and customization lives outside it.
- `packages/hotkeys/src/bind.ts` — the default-only binder this composes over.
- `docs/command_dispatch_journal_article.md` §3.1 — command palette and keyboard shortcuts.
