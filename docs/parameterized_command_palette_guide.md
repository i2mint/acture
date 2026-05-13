# Parameterized Command Handling in Command Palettes

> **Migrated from wrapex 2026-05-12.** Renamed to acture. This is the *implementation patterns* guide that complements the UX research in [`research/acture_research_2 -- The Qualitative UX of Parameterized Commands in Shipped Command Palettes.md`](research/acture_research_2%20--%20The%20Qualitative%20UX%20of%20Parameterized%20Commands%20in%20Shipped%20Command%20Palettes.md). When the two disagree, prefer research_2's recommendations (e.g. the `kind: "atomic" | "handoff"` field, auto-derived with override).

**A practical guide for developers and AI agents implementing parameter collection in schema-driven command dispatch architectures.**


## 1. The Problem

A command dispatch architecture maps every user-invocable operation to a registered command with an identifier, metadata, and a typed schema. A command palette provides a searchable interface over this registry, letting users discover and execute commands by name. For *parameter-free* commands—`zoomToFit`, `selectAll`, `toggleSidebar`—the palette works trivially: select the command, execute it. No input is needed.

The problem arises with *parameterized* commands—those whose schema declares required arguments: `setZoomLevel({level: number})`, `applyFilter({column, operator, value})`, `setColor({hex: string})`. When a user selects such a command from the palette, the system must collect valid input before it can dispatch. If it does not, the command handler receives `undefined` for required parameters, and validation (e.g., Zod's `parse`) throws an error like:

```
ZodError: [{ "expected": "number", "code": "invalid_type",
             "path": ["level"], "message": "Invalid input: expected number, received undefined" }]
```

This document addresses three questions:

1. **Detection:** How does the palette know a command needs parameters?
2. **Collection:** What UX patterns and tools exist for gathering typed input inline?
3. **Escape hatches:** When should the palette delegate to a richer UI instead?


## 2. Context: Where This Fits in the Architecture

In a command dispatch architecture (see [Whalen 2025] for the full framework), three primitives interlock: a *state model*, a *command registry*, and a *schema bridge*. The command registry maps each command to:

```typescript
{
  id: string;          // e.g. 'app.camera.setZoomLevel'
  label: string;       // e.g. 'Set Zoom Level'
  schema?: ZodObject;  // typed parameter schema (optional — absent for parameter-free commands)
  execute: (params, context) => Promise<Result>;
}
```

The command palette is a *consumer* of the registry. It does not define commands; it reads their metadata and dispatches them. Parameter collection is therefore a consumer-level concern—implemented in the palette, not in the registry or the command definitions themselves. This separation is critical: the same command must be invocable from the palette, from an AI assistant (which generates params programmatically), from a macro player (which replays recorded params), and from tests (which supply params directly). None of these other consumers need a form; only the palette does.


## 3. Detection: Is This Command Parameterized?

The palette must distinguish three cases before dispatching:

| Case | Schema | Action |
|------|--------|--------|
| No schema | `schema` is `undefined` or absent | Execute immediately with `{}` |
| Empty schema | `z.object({})` with no required fields | Execute immediately with `{}` |
| Has required params | `z.object({ level: z.number() })` | Collect input first, then execute |

A utility function encapsulates this:

```typescript
function isParameterFree(schema?: z.ZodTypeAny): boolean {
  if (!schema) return true;
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    return Object.keys(shape).length === 0;
  }
  return false;
}
```

The palette's dispatch logic becomes:

```typescript
async function executeFromPalette(command: CommandDef): Promise<void> {
  if (isParameterFree(command.schema)) {
    await commandRegistry.execute(command.id, {});
    return;
  }
  // Parameter collection required
  const params = await collectParams(command);
  if (params !== null) {
    await commandRegistry.execute(command.id, params);
  }
}
```


## 4. Collection Patterns

Four patterns exist in the wild, each with different tradeoffs. They are not mutually exclusive; a well-designed palette may use several depending on the command's schema shape and an optional `paletteHint` in its metadata.


### 4.1 Pattern A: Inline Single-Field Input (VS Code / Raycast Style)

**When to use:** Commands with exactly one required parameter.

**How it works:** After the user selects the command, the palette replaces its search results with a labeled input field. The user types a value and presses Enter. The palette coerces and validates the input against the schema, then dispatches.

**Precedent:** VS Code's QuickInput API provides `window.showInputBox` and `window.createQuickPick` for exactly this purpose. When a VS Code extension command needs a string or a selection, the palette transitions to an input box or a pick list within the same modal. The VS Code QuickInput sample [1] demonstrates single-step and multi-step input collection. Raycast takes the same approach with typed arguments declared in the extension manifest—up to three arguments rendered as inline fields in the search bar [2].

**UX flow:**

```
Step 1: User searches "Set Zoom Level" → selects it
Step 2: Palette shows: "Zoom level: [____]"  (prompt derived from schema description)
Step 3: User types "1.5" → presses Enter
Step 4: Palette validates → dispatches { level: 1.5 } → closes
```

**Implementation sketch:**

```typescript
async function collectSingleParam(
  fieldName: string,
  fieldSchema: z.ZodTypeAny
): Promise<unknown | null> {
  const raw = await showInlineInput({
    prompt: fieldSchema.description ?? `Enter ${fieldName}`,
    placeholder: inferPlaceholder(fieldSchema),  // e.g. "number" for z.number()
  });
  if (raw === null) return null;  // user cancelled

  const coerced = coerceValue(raw, fieldSchema);  // string → number, etc.
  const result = fieldSchema.safeParse(coerced);
  if (!result.success) {
    showValidationError(result.error);
    return null;
  }
  return result.data;
}
```

The `coerceValue` function handles type conversion from the text input. A minimal implementation:

```typescript
function coerceValue(raw: string, schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodNumber) return Number(raw);
  if (schema instanceof z.ZodBoolean) return raw === 'true';
  return raw;  // strings, enums pass through
}
```

**For enum types,** the palette should render a pick list (dropdown) rather than a free text input. VS Code's `window.showQuickPick` and `cmdk`'s nested pages both support this.


### 4.2 Pattern B: Multi-Step Wizard (VS Code Multi-Step Input)

**When to use:** Commands with 2–4 required parameters that can be collected sequentially.

**How it works:** The palette walks through parameters one at a time, each step showing a single input or pick list. A step indicator (e.g., "Step 2 of 3") provides progress feedback. The user can go back to a previous step. All values are accumulated and dispatched together after the final step.

**Precedent:** VS Code's MultiStepInput sample [3] wraps `createQuickPick` and `createInputBox` in a state machine that manages forward/backward navigation across steps. Each step is an async function that resolves when the user confirms a value.

**UX flow for `applyFilter({column, operator, value})`:**

```
Step 1/3: "Select column" → [dropdown: age, name, score, ...]
Step 2/3: "Select operator" → [dropdown: =, !=, >, <, >=, <=]
Step 3/3: "Enter value" → [text input: ____]
→ dispatches { column: "age", operator: ">", value: 25 }
```

**Design considerations:**

- Step order should go from most constrained to least constrained (enums before free text).
- Later steps can be *contextual*: the available operators may depend on the column type (string columns might not support `>`).
- The wizard should derive step count and types from the schema automatically, not require per-command configuration.


### 4.3 Pattern C: Compact Inline Form (Schema-Driven)

**When to use:** Commands with 2–5 parameters where sequential steps feel unnecessarily slow, or where the user benefits from seeing all fields simultaneously.

**How it works:** The palette renders a small form below the search bar, with one field per schema property. The form's fields are auto-generated from the schema: `z.string()` → text input, `z.number()` → number input, `z.enum([...])` → dropdown, `z.boolean()` → toggle. The user fills in the fields and presses Enter or clicks Submit.

**Schema-to-form tools:**

| Library | Input | Notes |
|---------|-------|-------|
| `@autoform/zod` + `@autoform/react` | Zod schema directly | Modern, UI-library agnostic. Supports MUI, Mantine, shadcn. Best choice for Zod-first stacks. [4] |
| `react-jsonschema-form` (`@rjsf/core`) | JSON Schema | Battle-tested (originally by Mozilla), supports many UI themes. Use with `z.toJSONSchema()`. Larger bundle. [5] |
| `JSONForms` | JSON Schema + UI Schema | Separates data schema from layout schema. More flexible for complex layouts but higher learning curve. [6] |
| `@saas-ui/forms` | Zod or Yup schema | Integrated with Saas UI component library. Good for projects already using Saas UI. [7] |
| Hand-rolled renderer | Zod schema | Iterate `schema.shape`, map types to components. ~50-100 lines for basic coverage. Maximum control, minimum dependencies. |

**When to hand-roll vs. use a library:** For command palette use, the schema shapes are typically simple—a few primitive types, maybe an enum. A hand-rolled renderer covering `string`, `number`, `boolean`, and `enum` is often sufficient and avoids a dependency. Adopt a library when forms become complex (nested objects, arrays, conditional fields) or when you need consistent styling with an existing design system.

**Implementation sketch (hand-rolled):**

```typescript
function SchemaForm({ schema, onSubmit }: {
  schema: z.ZodObject<any>;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const fields = Object.entries(schema.shape);
  const [values, setValues] = useState<Record<string, unknown>>({});

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
      {fields.map(([name, fieldSchema]) => (
        <SchemaField
          key={name}
          name={name}
          schema={fieldSchema}
          value={values[name]}
          onChange={(v) => setValues({ ...values, [name]: v })}
        />
      ))}
      <button type="submit">Execute</button>
    </form>
  );
}

function SchemaField({ name, schema, value, onChange }) {
  const label = schema.description ?? name;

  if (schema instanceof z.ZodEnum) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {schema.options.map((opt) => <option key={opt}>{opt}</option>)}
      </select>
    );
  }
  if (schema instanceof z.ZodNumber) {
    return <input type="number" placeholder={label}
                  onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (schema instanceof z.ZodBoolean) {
    return <label><input type="checkbox" checked={!!value}
                         onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
  }
  // Default: string input
  return <input type="text" placeholder={label}
                onChange={(e) => onChange(e.target.value)} />;
}
```


### 4.4 Pattern D: Delegate to UI Panel (Focus-Based)

**When to use:** Commands where the existing application UI provides a *richer* interaction than any form can—color pickers, graph node selectors, spatial controls, canvas tools.

**How it works:** Instead of collecting parameters itself, the palette navigates the user to the relevant UI panel and focuses the appropriate control. The command is not dispatched from the palette; the user completes the action through the existing UI.

**UX flow:**

```
Step 1: User searches "Set Point Color" → selects it
Step 2: Palette closes, settings panel opens, color picker receives focus
Step 3: User picks a color via the existing UI → handler fires normally
```

**Challenges:**

- **Discovery:** The palette needs a mapping from command ID to UI element. This requires an explicit registry (e.g., `commandId → { panel: 'settings', section: 'appearance', focusRef: colorPickerRef }`) that someone must maintain.
- **Ambiguity:** Multiple UI elements may control the same command (a toolbar button, a panel control, a context menu). The palette must choose one, typically via a priority heuristic (prefer the primary panel location).
- **Not universal:** Not every parameterized command has a corresponding UI element. This pattern is a curated enhancement, not a default.

**Implementation:** Add an optional `paletteHint` to the command metadata:

```typescript
defineCommand({
  id: 'app.appearance.setPointColor',
  label: 'Set Point Color',
  schema: z.object({ color: z.string().describe('Hex color value') }),
  paletteHint: { type: 'focus-panel', panel: 'appearance', section: 'colors' },
  execute: (params) => { /* ... */ },
});
```

The palette checks for `paletteHint` before falling back to schema-driven collection:

```typescript
async function collectParams(command: CommandDef) {
  if (command.paletteHint?.type === 'focus-panel') {
    focusPanel(command.paletteHint.panel, command.paletteHint.section);
    return null;  // palette closes; user completes action in panel
  }
  // Fall back to schema-driven collection (Patterns A/B/C)
  return collectParamsFromSchema(command.schema);
}
```

Solomon [8] discusses this tradeoff: pulling more interaction into the palette increases complexity but preserves keyboard flow, while delegating to a panel provides richer interaction at the cost of breaking the modal context.


## 5. Choosing the Right Pattern

The palette should select a collection pattern automatically based on the schema shape, with per-command overrides available via `paletteHint`:

```
Has paletteHint 'focus-panel'?  →  Pattern D (delegate to panel)
                ↓ no
Single required param?          →  Pattern A (inline input)
                ↓ no
All params are enum/boolean?    →  Pattern B (multi-step picks)
                ↓ no
2-5 params, mixed types?        →  Pattern C (compact form)
                ↓ no
Complex schema (nested, arrays) →  Pattern D (delegate) or refuse with guidance
```

This decision tree can be implemented as a function:

```typescript
function selectCollectionPattern(command: CommandDef): 'inline' | 'wizard' | 'form' | 'delegate' {
  if (command.paletteHint?.type === 'focus-panel') return 'delegate';

  const fields = Object.entries(command.schema.shape);
  if (fields.length === 1) return 'inline';
  if (fields.every(([_, s]) => s instanceof z.ZodEnum || s instanceof z.ZodBoolean)) return 'wizard';
  if (fields.length <= 5) return 'form';
  return 'delegate';
}
```


## 6. Immediate-Effect vs. Deferred Submission

For single-parameter commands with a bounded domain (sliders, enums), there is a UX question: should the command take effect *as the user types* (live preview), or only on explicit submission?

**Immediate effect** provides real-time feedback—the user drags a zoom slider and sees the viewport update. This requires the command handler to be idempotent and the operation to be cheap. It also requires an undo mechanism, since the user may cycle through many values before settling.

**Deferred submission** is simpler: the user enters a value, presses Enter, and the command executes once. This is the safe default and the one most palette implementations use.

The choice can be encoded in the command metadata:

```typescript
defineCommand({
  id: 'app.camera.setZoomLevel',
  schema: z.object({ level: z.number().min(0.1).max(10) }),
  paletteHint: { type: 'inline-input', livePreview: true },
  execute: (params) => { /* ... */ },
});
```

When `livePreview` is true, the palette dispatches the command on every input change (debounced). When false (default), it dispatches only on Enter.


## 7. Error Handling

Parameter collection introduces several failure modes that the palette must handle gracefully:

**Validation failure:** The user enters `"abc"` for a `z.number()` field. The palette should show an inline error message (derived from `ZodError`) and keep the input focused. It should never propagate the validation error to the command handler—validation is the palette's responsibility.

**Cancellation:** The user presses Escape during parameter collection. The palette should return to its search results without dispatching.

**Missing schema:** A parameterized command is registered without a schema (perhaps because schema enrichment is still in progress, per the strangler fig migration strategy). The palette should skip this command in its listings or show it as "not yet available from palette" rather than attempting to execute it and crashing.

**Coercion ambiguity:** The user types `"1.5"` for a field that could be `string` or `number`. The palette should trust the schema: if the schema says `z.number()`, coerce to number. If coercion fails (e.g., `"abc"` → `NaN`), treat it as a validation error.


## 8. Integration with Other Consumer Surfaces

A key benefit of handling parameter collection at the consumer level is that other consumers handle it differently—and correctly for their context:

- **AI assistant:** Generates parameters programmatically from the schema. No form needed.
- **Keyboard shortcut:** For parameterized commands, the shortcut opens the palette pre-filtered to that command, triggering parameter collection. Alternatively, shortcuts can be bound to partially-applied commands with fixed parameters (e.g., `Ctrl+0` → `setZoomLevel({level: 1.0})`).
- **Macro player:** Replays recorded parameters. No collection needed.
- **MCP server:** Parameters are provided by the external agent in the `tools/call` request.
- **Tests:** Parameters are supplied directly in the test code.

The command definition remains agnostic to all of this. The schema is the single source of truth; each consumer interprets it for its context.


## 9. Summary of Recommendations

1. **Detection before dispatch.** The palette must check `isParameterFree(command.schema)` before calling `execute`. Never let a Zod validation error propagate as a user-facing error from the palette.

2. **Schema-driven by default.** Derive all parameter collection UX from the command's schema. No per-command UI code should be necessary for standard parameter types.

3. **Start with Pattern A.** Inline single-field input covers the majority of parameterized commands and is simple to implement. Add Patterns B and C as the command surface grows.

4. **Pattern D is opt-in.** The focus-panel delegation pattern requires explicit configuration (`paletteHint`) and a maintained mapping. Use it only for commands where the existing UI is meaningfully richer than a form.

5. **Consumer-level concern.** Parameter collection logic lives in the palette component, not in the command registry or command definitions. This preserves the clean separation that enables multi-surface dispatch.

6. **Validate at the palette, not the handler.** The palette should validate (and coerce) input before dispatching so that handlers can assume valid input. The handler's validation middleware remains as a safety net, but the palette should never rely on it for UX.


## References

[1] VS Code QuickInput API Sample. https://github.com/microsoft/vscode-extension-samples/tree/main/quickinput-sample

[2] Raycast Extension API: Arguments. https://developers.raycast.com/information/lifecycle/arguments

[3] VS Code Multi-Step Input Sample. https://github.com/microsoft/vscode-extension-samples/blob/main/quickinput-sample/src/multiStepInput.ts

[4] AutoForm: Automatically Render Forms from Schema. https://github.com/vantezzen/autoform

[5] react-jsonschema-form: A React Component for Building Web Forms from JSON Schema. https://github.com/rjsf-team/react-jsonschema-form

[6] JSONForms: More Forms, Less Code. https://jsonforms.io/

[7] Saas UI: AutoForm. https://saas-ui.dev/docs/components/forms/auto-form

[8] S. Solomon, "Designing Command Palettes," solomon.io, 2024. https://solomon.io/designing-command-palettes/

[9] T. Boucher, "How to Build a Remarkable Command Palette," Superhuman Engineering Blog, 2021. https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/

[10] A. Suska, "Command Palette UX Patterns," Medium (Design Bootcamp), 2023. https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1

[11] Destiner, "Designing a Command Palette," destiner.io. https://destiner.io/blog/post/designing-a-command-palette/

[12] Raycast Blog, "Inputs for Script Commands," 2020. https://www.raycast.com/blog/inputs-for-script-commands

[13] VS Code Extension API: Commands. https://code.visualstudio.com/api/extension-guides/command

[14] cmdk: Command Menu for React. https://cmdk.paco.me/

[15] kbar: Command Palette for React. https://kbar.vercel.app/

[16] Zod JSON Schema Generation. https://zod.dev/json-schema
