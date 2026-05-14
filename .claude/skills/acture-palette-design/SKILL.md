---
name: acture-palette-design
description: Load context on acture's command palette design, including the parameterized-command UX (atomic vs. handoff), the auto-derived `kind` heuristic, the per-parameter-count defaults, and the don't-do list. Use when building or modifying `acture-palette-react`, when implementing parameter collection, when reviewing palette UX choices, or when working on form adapters (`acture-forms-autoform`, `acture-forms-rjsf`). Triggers on "command palette", "parameter collection", "atomic vs handoff", "param collector", "cmdk", "kbar", "form adapter", "picker chain", "Ctrl+K". Do NOT use for keybinding-only work (focus on `acture-command-record-shape` for the `keybinding` field).
---

# acture palette design

Loads research-2's findings on parameterized command palettes and acture's resulting `kind: "atomic" | "handoff"` design.

> **Load `acture-consumer-integration` first.** The command palette is a *consumer* — this skill covers palette-specific UX, but the foundational pattern (agent-written vs `acture-palette-react`, the cmdk/kbar/custom tool choice belongs to the user, the dev-tool-first rule) lives there.

## The empirical cliff (research-2 §7)

Across 18 shipped products, parameterized command palettes have a sharp UX cliff:

- **Atomic** (palette collects in-place): 0–2 params, all picker-typed; or 3 params if all are picker-typed AND have defaults.
- **Handoff** (palette closes, dedicated form opens): everything else.

The cliff has two thresholds:
1. At ~2 params with one free-text field, the palette starts feeling like a form ("why isn't this a dialog?").
2. At ~3+ params even all-picker, the palette starts feeling like a wizard.

Raycast caps inline args at 3 and routes the rest to a `Form` view. VS Code's own guidance warns against multi-step quick picks as wizards. Linear keeps each palette interaction effectively 1-param and chains them. **All four data points converge.**

## The `kind` field

`CommandRecord.kind: "atomic" | "handoff"` carries the dispatch hint for the palette (and other surfaces). Per research-2 §9.2:

- **Auto-derived** from schema heuristic (research-2 §9.3).
- **Author-overridable** when needed.

```ts
function deriveKind(record: CommandRecord): "atomic" | "handoff" {
  if (record.kind) return record.kind;
  const params = Object.values(record.params?.shape ?? {});
  if (params.length === 0) return "atomic";
  if (params.length <= 2 && params.every(isPickerTyped)) return "atomic";
  if (params.length === 3 && params.every(p => isPickerTyped(p) && hasDefault(p))) return "atomic";
  return "handoff";
}
```

`isPickerTyped` returns true for `z.enum`, `z.boolean`, `z.string` with a known scopeable hint (`tag`, `user`, `channel` — extension point), but NOT for unconstrained `z.string` or `z.number`.

## Per-parameter-count defaults (research-2 §9.1)

| Param count | Default UX | Rationale |
| --- | --- | --- |
| **0 params** | Atomic palette command, Enter executes. | Universal pattern. |
| **1 param** | One picker step *within the palette*, rendered as a continuation of the same surface (Linear/Discord chip style). | Loved pattern; never open a separate window for 1 param. |
| **2 params** | Two chained picker steps inside the palette, with `1/2` indicator if both required. If one optional with default, expose as dismissable chip the user can Tab into. | Mirrors Discord typed-chip flow. Stays inside palette. |
| **3 params** | **Prefer hand-off** by default, unless all picker-typed with defaults. | The Raycast cliff. 3+ free-text in palette is empirically worse than a small form. |
| **4+ params** | **Hand-off, always.** Dedicated form view from same schema. | No exceptions for v1. |

## Default UI behavior

**For `kind: "atomic"`:**
- Render each param as discrete picker step inside palette.
- Back affordance: Esc or Shift+Tab.
- Step counter `n/N` only when N ≥ 2.
- Tab advances; Enter executes when all required bound.
- Optional params render as dismissable chips with default value visible.
- Per-step validation, inline, before advancing (VS Code's `validateInput` pattern). Never punt to submit-time.

**For `kind: "handoff"`:**
- Palette closes; opens a form view derived from same schema.
- Form supports keyboard-only completion: `Cmd+Enter` to submit, `Esc` to cancel.
- Auto-focus first required field.

**Context prefill (Things-style):**
- First-class hook: `record.params.<field>.defaultFrom = (ctx) => ctx.selection?.assignee`.
- Per research-2 L2, this is the single highest-leverage UX improvement.

## Form adapters

`acture-forms-autoform` and `acture-forms-rjsf` shipped as separate packages in Phase 2. Both implement the same `PaletteFormAdapterProps` interface (`{ command, defaults?, onSubmit, onCancel }`) consumed by `<CommandPalette formAdapter={...} />`. The palette switches to the supplied form for `kind: 'handoff'` commands.

- **autoform** — Zod-native; lighter; fits the recommended Zod-first authoring path.
- **rjsf** — JSON-Schema-native; battle-tested; larger bundle but more themes.

Acture's core does not bundle a form library. Per redesign-takeaways §2.3.

## The don't-do list (research-2 §9.5)

1. **Do not parse a single text blob into multiple parameters.** Slack's pattern. H2 hate; industry is migrating away.
2. **Do not render a 4-param wizard inside the palette**, even with a step counter. Hand off.
3. **Do not adaptively reorder commands** in a way that breaks deterministic muscle-memory keystrokes. Recency is fine; Tab-to-disambiguate must be predictable.
4. **Do not require authors to manually set `kind`.** Auto-derive; override is an option, not the default authoring path.

## The two-population insight (research-2 §5a)

Power users and casual users want *opposite things* from the parameter collector:
- **Power users:** terse, deterministic, predictable (muscle memory works).
- **Casual users:** scaffolded, validated, picker-driven (don't have to know schema).

The right design lets the *same schema* render both: terse one-line autocomplete for power users, full chip-by-chip pickers for novices. Discord and Linear achieve this. Raycast bifurcates with `Arguments` vs. `Form`. Acture mirrors with `kind`-based routing.

## Per-command paletteHint (still deferred post-Phase 2)

The original wrapex `paletteHint` for delegating to a UI panel (Pattern D in `parameterized_command_palette_guide.md`) is *deferred* unless three real callers ask. Phase 2 shipped without it; auto-derived `kind` covered every case in both worked examples (override rate 0%). Reconsider for Phase 4 if usage data warrants.

## See also

- `docs/research/acture_research_2 -- The Qualitative UX of Parameterized Commands ...md` — the source
- `docs/parameterized_command_palette_guide.md` — implementation patterns (defer to research-2 on UX conflicts)
- `acture-command-record-shape` — the `kind` field spec
- `acture-schema-bridge` — how `params` projects to forms
