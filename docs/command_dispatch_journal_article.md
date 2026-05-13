# The Command Dispatch Architecture: A Unifying Primitive for Multi-Surface Frontend Applications

**Thor Whalen**


## Abstract

*Modern frontend applications face a structural problem: the same user intent—zoom to fit, apply a filter, export data—must be invocable from a button click, a keyboard shortcut, a command palette, an AI assistant, an automated test, and an external tool protocol. Each new invocation surface multiplies the integration effort unless the application converges on a shared primitive. This paper identifies a *command dispatch architecture*—built around a named, typed, schema-defined operation as its central primitive—drawing on convergent evidence from VS Code, Figma, Linear, and Obsidian, all of which independently adopted this architecture to solve the same multi-surface dispatch problem. We present a conceptual framework of three interlocking primitives (state model, command registry, schema bridge) that together enable a single operation definition to serve command palettes, keyboard shortcuts, AI tool calling via LLM function invocation, the Model Context Protocol (MCP), end-to-end testing, telemetry, undo/redo, macro composition, and extension APIs. We further propose a migration strategy based on the strangler fig pattern that allows existing codebases to adopt the command dispatch architecture incrementally, with each phase delivering user-facing value. The paper examines risks—including the inner platform effect, premature generalization, and performance overhead—and offers concrete mitigation heuristics, among which is a "rule of three": an operation should only be formalized as a command when it is triggered from three or more surfaces.*

**Keywords:** command dispatch architecture, frontend architecture, command palette, LLM tool use, Model Context Protocol, schema-driven development, strangler fig migration, software design patterns


## 1. Introduction

A recurring challenge in the evolution of interactive frontend applications is that user-facing operations grow far beyond their original invocation context. Consider a single operation—say, "apply a filter to the dataset." That same operation may need to be triggered from a toolbar button, a keyboard shortcut, a searchable command palette, an AI assistant composing a multi-step workflow, an MCP server exposing the application to third-party agents, an automated test validating a user story, a user-recorded macro replaying a saved sequence, and an extension contributed by a third-party developer. These are not steps in a chain—they are independent *surfaces* radiating from the same underlying functionality, each demanding slightly different metadata: a human-readable label, a machine-readable parameter schema, a precondition for availability, a description suitable for language model reasoning.

Without a shared abstraction, teams duplicate this metadata across surfaces, and the duplicates inevitably diverge. Worse, the absence of an architecture that handles multiple surfaces cleanly often leads teams to forgo implementing features altogether. A command palette is deferred because the existing codebase has no registry to iterate. AI integration stalls because operations lack typed schemas. Macro recording is never built because actions are not represented as composable data. Each forgone feature is individually defensible—the wise developer will point out that it might not be used or provide little gain (YAGNI [27]), or will increase the costs, via time to develop or the added complexity it will require. But this line of argument, however valid in isolation, can be myopic. A less myopic strategy would consider the return on investment more globally: if the architecture enables multiple surfaces without letting complexity grow out of hand, the development and maintenance costs are amortized across all those surfaces, and the benefits are inflated by the multi-surface capabilities unlocked. The question is not whether any single surface justifies the investment, but whether the aggregate does.

This is not a hypothetical concern. VS Code's command system [1][2], Figma's plugin architecture [3], Linear's command palette, and Obsidian's plugin API all independently converged on the same structural solution: a *command registry* that maps a string identifier to a handler, a metadata record, and a typed parameter schema. The convergence is striking because these products span different domains (code editors, design tools, project management, knowledge management) yet face the same underlying problem.

The emergence of large language models (LLMs) with function-calling capabilities [4] and the Model Context Protocol (MCP) [5] have intensified this convergence. LLM tool use requires exactly the metadata that a command dispatch architecture provides: a name, a description, and a JSON Schema for the input parameters [6]. MCP formalizes this further by defining tools as `{name, description, inputSchema}`, making the protocol literally a serialization of the command pattern.

This paper makes three contributions. First, we identify three interlocking primitives—state model, command registry, and schema bridge—that form the minimal conceptual framework for multi-surface frontend architecture (Section 2). Second, we show how this framework maps to eight concrete consumer surfaces, each of which represents a distinct capability that modern frontend applications increasingly require (Section 3). Third, we propose a migration strategy based on the strangler fig pattern [7] that allows existing codebases to adopt the command dispatch architecture incrementally, and we articulate risk heuristics—including the "rule of three"—that prevent premature generalization (Sections 4–5).

An important caveat: this paper proposes a conceptual framework and migration strategy, not a monolithic abstraction layer. We call out tradeoffs, cons, and alternatives alongside each recommendation. The goal is a pragmatic architecture that earns its complexity through concrete use.


## 2. Three Primitives, Not One

The command dispatch architecture requires more than a command registry alone. Three interlocking primitives form the minimal framework.

### 2.1 State Model

A formally defined schema over the application's state that describes what is readable and what is writable. This schema serves as the *single source of truth* (SSOT) from which static types, JSON Schema for external protocols, runtime validators, and AI tool parameter descriptions are all derived.

The pattern is well established in modern frontend state management. Libraries such as Zustand, Redux Toolkit, and MobX encourage composable state slices, and schema validation libraries such as Zod [8] and io-ts can wrap these slices with typed interfaces and validation middleware. The key insight is that the state model does not require rewriting existing stores—it wraps them with typed interfaces and adds validation at slice boundaries incrementally.

A formalized state model is a prerequisite for nearly everything that follows:

- *Testing* can assert on typed state snapshots rather than brittle DOM inspection.
- *AI tools and MCP servers* can describe available state for the LLM to reason about.
- *Extensions* can subscribe to typed state changes without coupling to internal store structure.
- *Macros* can capture and replay state-changing operations against a well-defined model.
- *Documentation* can be generated from schema descriptions.
- *Cross-language bindings* (e.g., Python wrappers for a TypeScript application) can validate against the same schema, catching drift automatically in continuous integration.
- *Telemetry and feature flags* can reference typed state slices to gate or observe behavior.

A versioned, canonical schema also enables automatic detection of breaking changes. A CI job can diff the schema against the previous release and flag incompatibilities—critical for extension API stability and MCP tool reliability.

**Risks.** Schema maintenance grows with coverage. Every schema change ripples to JSON Schema, AI tool definitions, MCP tools, test fixtures, and documentation. The mitigation is automation: the schema *is* the source of truth, and all downstream artifacts are generated, not hand-written. But someone must own the schemas, review changes, and ensure backward compatibility. (We address the practical strategies for this automation in Section 5.)

**Alternative.** Rather than wrapping existing state management with schemas, one could adopt a full event-sourcing approach [9] where actions are the primitive and state is derived. This provides excellent auditability and time-travel debugging but requires a fundamentally different architecture. The migration cost is prohibitive for most existing codebases.

### 2.2 Command Registry

A centralized map from a command identifier to a handler, metadata, and parameter schema. VS Code's implementation is the gold standard [1][2]: commands carry a string ID (`editor.action.formatDocument`), a human-readable label, an optional category, keybinding information, a precondition for availability (the "when-clause" [10]), and a typed `execute` function.

The key architectural insight from VS Code is its *dual registration model*—declarative metadata (loaded eagerly for palette population and discoverability) is separated from imperative handlers (loaded lazily on first invocation) [11][12]. This means the command palette can display commands from modules that have not yet been initialized, enabling both startup performance and feature discoverability.

**Pros.** Decouples intent from execution. Enables cross-cutting concerns (logging, undo, validation) as middleware. Makes all operations discoverable. Provides a stable API surface for extensions and AI.

**Cons.** Adds indirection that complicates debugging (stack traces pass through registry dispatch). Requires discipline to prevent the registry from becoming a god object. Can lead to the inner platform effect [13] if command metadata becomes too expressive (conditionals, inheritance, dynamic composition). The guardrail: command metadata should be *data, not code*. Labels, descriptions, schemas, keybindings—yes. Conditional execution logic, command inheritance—no.

**Alternative.** Direct API exposure—exporting typed functions without a command registry—maximizes simplicity: zero indirection, full type safety, IDE go-to-definition works perfectly. This is the right choice for internal code with a single consumer. It fails when the same operation needs metadata for multiple surfaces and cross-cutting middleware. The command registry adds exactly the metadata and middleware layer that direct exports lack.

### 2.3 Schema Bridge

A mechanism that connects application-level type definitions to the interchange formats required by external consumers. In the TypeScript ecosystem, Zod v4's native `z.toJSONSchema()` function [8]—combined with the fact that the MCP TypeScript SDK [14], Vercel AI SDK [15][16], and LangChain all accept Zod schemas directly—means a single schema definition simultaneously serves as:

- The command palette's parameter form
- The AI tool's `inputSchema` for LLM function calling
- The MCP tool's `inputSchema`
- The test action's fixture type
- The extension API method's typed signature

JSON Schema is the universal interchange format; the developer-facing schema library is the authoring layer. Every major AI tool framework has independently arrived at this architecture. The MCP protocol defines tools as `{name, description, inputSchema}` where `inputSchema` is JSON Schema [5]. OpenAI's function calling, Anthropic's tool use, and Google's function declarations all use JSON Schema as the parameter contract [4].

**Risks.** Not all schema library features map cleanly to JSON Schema (transforms, refinements, effects). Complex validation logic that uses language-specific features exists in the application layer only and does not propagate to AI tool descriptions or MCP schemas. The mitigation: keep command parameter schemas simple and declarative. Complex validation belongs in the command handler, not the schema.

### 2.4 How the Three Primitives Relate

The relationship is straightforward. The state model defines *what exists*. Commands define *what can be done*. Schemas define *the shape of both*, enabling automatic bridging to every consumer.

```
┌─────────────────────────────────────────────────────────────┐
│                      Schema Bridge                           │
│         Schema → Static types                                │
│         Schema → JSON Schema → MCP tools, AI tools           │
│         Schema → Runtime validation → Command params, State  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐        ┌───────────────────────────┐  │
│  │   State Model    │◄──────►│    Command Registry       │  │
│  │   (typed schemas │ reads/ │    (id, label, schema,    │  │
│  │    over stores)  │ writes │     execute, when-clause) │  │
│  └──────────────────┘        └───────────────────────────┘  │
│           ▲                            ▲                     │
│           │                            │                     │
│    ┌──────┴──────┐      ┌──────────────┴──────────────┐     │
│    │ Consumers:  │      │ Consumers:                  │     │
│    │ • AI read   │      │ • Command Palette           │     │
│    │ • Tests     │      │ • Keyboard Shortcuts        │     │
│    │   assert    │      │ • AI Assistant / MCP tools  │     │
│    │ • Extension │      │ • Test actions              │     │
│    │   subscribe │      │ • Extension API             │     │
│    │ • Docs gen  │      │ • Macro composition         │     │
│    │ • Telemetry │      │ • Telemetry / Observability │     │
│    │   observe   │      │ • Feature Flags / Access    │     │
│    └─────────────┘      │ • Undo / Redo               │     │
│                         └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```


## 3. Consumer Surfaces: How the Command Dispatch Architecture Maps to Capabilities

The consumer surfaces below are not separate workstreams that happen to share vocabulary. They are different projections of the same underlying structure, and command dispatch is the projection axis.

### 3.1 Command Palette and Keyboard Shortcuts

The command palette—a searchable, keyboard-driven interface for discovering and executing operations—has become a de facto standard in professional software. VS Code popularized Ctrl+Shift+P / Cmd+Shift+P; Figma, Linear, Notion, Slack, GitHub, Raycast, and dozens of other tools followed. UX research on command palette patterns [17] confirms their value for products with large feature surfaces.

A command registry makes the palette trivial to implement: iterate registered commands, render labels, filter by search query, execute on selection. Libraries such as `cmdk` [18] and `kbar` [19] provide production-ready React components. The command palette should be the *first consumer* built when adopting a command dispatch architecture—it provides immediate visible user value that justifies the investment.

Keyboard shortcuts map keybindings to command IDs via a declarative binding table. Libraries such as `tinykeys` [20] handle the low-level keyboard event translation. Because shortcuts are just another trigger for the same command handler, adding or remapping shortcuts requires no code changes to the operation itself.

**Handling parameterized commands.** A subtlety arises when the command palette invokes a *parameterized* command—one whose schema declares required arguments (Section 4.1). Parameter-free commands like `zoomToFit` execute immediately on selection; parameterized commands like `setZoomLevel({level})` or `applyFilter({column, operator, value})` must first collect valid input from the user. This is a consumer-level concern: the palette inspects the command's schema and decides how to gather arguments before dispatching.

The dominant pattern, established by VS Code's QuickInput API [46] and adopted by Raycast's typed arguments [47], is *inline parameter collection*: the palette transitions into an input step within the same modal rather than opening a separate form. For single-parameter commands, this is a labeled text field; for multi-parameter commands, a stepped wizard or compact form. The schema drives the UX: `z.number()` renders a numeric input, `z.enum([...])` renders a dropdown, `z.boolean()` renders a toggle. Schema-driven form generation libraries—including `@autoform/zod` [48] for Zod-native rendering and `react-jsonschema-form` [49] for JSON Schema—can automate this mapping, though a minimal hand-rolled renderer covering four or five Zod types often suffices for command palette use. Solomon [50] and Boucher [51] discuss the design tradeoffs of pulling parameter collection into the palette versus delegating to a dedicated UI panel; the former preserves keyboard-driven flow while the latter supports richer interactions (color pickers, graph selectors). A practical architecture supports both via an optional `paletteHint` on the command metadata, defaulting to schema-driven inline input and allowing specific commands to override with a panel-focus directive.

### 3.2 AI Assistance via LLM Tool Use

Expanding an AI assistant from narrow tool support (e.g., a single SQL query tool) to full application control becomes a *registration* problem rather than an integration problem when commands carry typed schemas. Each command's schema is automatically converted to JSON Schema for the LLM's function-calling interface. The AI assistant discovers available commands via the registry, generates typed arguments that are validated at runtime by the same schema, and the command handler executes the operation.

This is exactly how the Vercel AI SDK defines tools: `tool({ description, parameters: z.object({...}), execute })` accepts a schema library object, converts it to JSON Schema for the LLM, and validates on invocation [15][16]. The MCP TypeScript SDK and Anthropic's tool use API follow the same pattern. Martin Fowler's recent analysis of function calling in LLMs [4] confirms the architectural centrality of JSON Schema as the contract between the language model and the application.

A natural progression emerges:

1. **Phase 1:** A single narrow AI tool (e.g., `runQuery(sql)`)
2. **Phase 2:** Existing commands registered as AI tools—`zoomToFit`, `applyFilter`, `selectItems`, `setColor`
3. **Phase 3:** AI composes command sequences—"Highlight all nodes with degree > 10 and zoom to fit"
4. **Phase 4:** AI reads the state model to understand the current application context before suggesting operations

Note that Phase 3—AI composing command sequences—is structurally identical to macro composition (Section 3.7). The AI is essentially writing a macro on the user's behalf.

**Risk.** Giving the AI full command access means it can make mistakes that affect the user's work. Mitigation: commands can be tagged as `requiresConfirmation: true`, prompting the user before execution. Destructive operations should always require confirmation regardless of invocation source.

### 3.3 MCP Server Integration

MCP tools are commands with JSON Schema parameters—this is literally the protocol definition [5]. The `tools/list` endpoint returns `{name, description, inputSchema}` and `tools/call` invokes them. Since MCP SDKs already accept schema library objects as peer dependencies, exposing registered commands as MCP tools requires only a thin adapter that iterates the registry and registers each command as an MCP tool.

The alternative—hand-writing MCP tool definitions separately from internal commands—creates schema drift and doubles the maintenance surface. When two representations of the same concept are maintained independently, they inevitably diverge.

### 3.4 Robust UI Testing via Intent Abstraction

If all user actions are commands, a test becomes a sequence of command dispatches plus state assertions. An intent abstraction layer compiles each intent to the appropriate executor at different levels of the standard test pyramid:

- **Unit / API level:** `commandRegistry.execute('app.data.applyFilter', {column: 'age', op: '>', value: 25})` — tests the command handler directly with mocked or real state, bypassing the UI entirely.
- **Component level:** `userEvent.click(filterButton)` — an adapter maps UI interactions to the same command within a rendered component, without the full application environment.
- **E2E level:** `page.click('[data-command="app.data.applyFilter"]')` — data attributes link UI elements to command IDs in a fully deployed application.

This is not a replacement for the traditional test pyramid (unit → integration → E2E) [39]; rather, it is a *compilation strategy* for test intents. A single test definition—"apply this filter, assert this state"—can be compiled to any pyramid level via an adapter. The intent and assertions are shared; only the adapter per level changes. This dramatically reduces the cost of maintaining tests across levels, because the *what* (intent) is defined once, and the *how* (execution mechanism) varies by adapter.

Existing frameworks validate this compilation pattern: Gauge's "Concepts" compose steps into hierarchical abstractions, XState's `@xstate/test` generates test paths from state machines [21], and Cucumber's step definitions [22] serve as adapter layers between intent and execution.

The testing pyramid becomes command-centric: unit tests validate individual command handlers with mocked state, integration tests validate command sequences against real stores, E2E tests dispatch commands via the UI, and property-based tests (e.g., fast-check [23]) generate random command sequences to test state invariants.

### 3.5 Extension and Plugin Systems

Extensions register new commands via the registry API. VS Code's contribution point model [12] proves this works at scale: extensions declare commands in a manifest (metadata), register handlers at runtime (implementation), and the host integrates them into menus, palettes, and keybindings without core modification.

The open-closed principle is satisfied because the core defines extension points (command registry, view registry, provider registry) and extensions contribute to them. A command facade decouples internal state management from external consumers, preventing the "unstable API surface that breaks on every internal refactor" problem that arises when raw state access is exposed to extensions.

Figma's plugin architecture [3] demonstrates a more cautious approach: plugins run in a sandboxed environment (using a QuickJS WASM runtime) and communicate with the main thread via message passing. This is heavier to implement but provides strong isolation. We recommend starting with a VS Code-style "trusted extension" model (direct registry access) and adding sandboxing only when opening the extension API to untrusted third parties.

Some extensions are themselves just curated collections of macros (Section 3.7)—a bundled set of command sequences that a third-party developer distributes as a package.

### 3.6 Telemetry, Undo/Redo, and Feature Flags

Because all user-initiated operations flow through the command registry, cross-cutting concerns become middleware:

- **Telemetry:** Log every command dispatch with its parameters, execution time, and outcome. Prioritize QA effort on the most-executed commands. Feed Sentry breadcrumbs with structured command context.
- **Undo/redo:** Capture state patches (e.g., via Immer) during command execution. The command handler returns both the result and a reverse patch. The undo stack is a sequence of command invocations with their reverse patches [24].
- **Feature flags:** A middleware checks whether the command's feature flag is enabled before execution. The command palette hides flagged commands. This enables trunk-based development [25] where feature flags gate which commands are registered, not which code paths execute.

### 3.7 Macro Composition

A *macro* (also called a workflow or pipeline) is a persisted sequence of commands that a user or system can compose and replay as a single unit. The concept is as old as computing itself—from Lisp macros to VBA macros to Photoshop Actions—and it maps directly onto the command dispatch architecture: if every operation is a named command with typed parameters, then a macro is simply a serializable list of `{commandId, params}` pairs.

Macro composition is a consumer surface in its own right, but its real power lies in how much structural overlap it shares with other surfaces:

- **AI assistance** (Section 3.2): When an AI assistant composes a multi-step response—"select nodes with degree > 10, set their color to red, then zoom to fit"—it is writing a macro. The AI's output is a command sequence, identical in structure to a user-recorded macro.
- **Testing** (Section 3.4): An end-to-end test is a macro with assertions. The test replays a command sequence and checks state at defined points. Shared infrastructure between macro execution and test execution is a natural consequence.
- **Extensions** (Section 3.5): Some extensions are simply curated macro bundles—a domain expert's workflow packaged for distribution.

Beyond these structural overlaps, macro composition provides a valuable *signal*: observing which macros users create reveals the usage patterns they consider important. These patterns can inform test prioritization (test what users actually automate), feature development (productize the most common macros), and AI training (teach the assistant the workflows that real users compose). This feedback loop is a direct benefit of having operations represented as composable, inspectable data.

The implementation is lightweight. A macro recorder listens to command dispatches, records the sequence, and persists it (e.g., as JSON). A macro player iterates the sequence and dispatches each command. The registry already provides everything needed—the macro layer is a thin consumer, not a new primitive.


## 4. What the Command Object Looks Like in Practice

A concrete command definition bridges all consumer surfaces through a single interface:

```typescript
import { z } from 'zod';
import { defineCommand } from './command-registry';

export const applyFilterCommand = defineCommand({
  // Identity & metadata (eagerly loaded for palette, AI, MCP)
  id: 'app.data.applyFilter',
  label: 'Apply Filter',
  category: 'Data',
  description: 'Filter the active dataset by a column condition',

  // Schema: single source for types, JSON Schema, AI params, MCP params
  schema: z.object({
    column: z.string().describe('Column name to filter on'),
    operator: z.enum(['=', '!=', '>', '<', '>=', '<=']).describe('Comparison operator'),
    value: z.union([z.string(), z.number()]).describe('Value to compare against'),
  }),

  // Keybinding (optional, user-customizable)
  keybinding: { key: 'f', ctrl: true, shift: true },

  // Precondition: when is this command available?
  when: 'app.datasetLoaded',

  // Handler
  execute: async (params, context) => {
    const validated = applyFilterCommand.schema.parse(params);
    context.store.getState().applyFilter(validated);
    return { success: true, message: `Filtered on ${validated.column}` };
  },
});
```

This single definition simultaneously serves as a command palette entry (label + description + parameter form generated from schema), a keyboard shortcut target, an AI tool (schema → JSON Schema for LLM function calling), an MCP tool (same JSON Schema via `z.toJSONSchema()`), a test action (dispatch with typed parameters, assert state), a macro step (recorded and replayed by ID and params), and an extension API method (registered in registry, callable by extensions).

### 4.1 Command Taxonomy

Not everything called a "command" serves the same purpose. Two orthogonal axes provide a useful classification.

**Axis 1: Mutations vs. Queries.** The primary distinction follows the well-established Command-Query Separation (CQS) principle introduced by Bertrand Meyer [40]: operations either change application state or read it, but ideally not both.

*Mutations* are operations that modify state: `applyFilter`, `setPointColor`, `deleteSelection`, `zoomToFit`. These are what undo/redo, telemetry, and event emission care about. They are the operations that must be sequenced carefully and whose effects need to be tracked. The broader architectural pattern of Command Query Responsibility Segregation (CQRS) [41] builds on this same insight at the system level—separating write models from read models—and the distinction is equally valuable at the command registry level.

*Queries* are operations that read state and compute a result without side effects: `getSelectedNodes`, `exportDataAsCSV`, `computeGraphStatistics`. AI assistants heavily use queries to understand the current application context before composing mutations. Queries do not participate in undo/redo (there is nothing to reverse) and are typically safe to execute without confirmation.

In practice, some operations blur the line—an `exportData` command might be a pure query (computing a CSV string) or a mutation (writing to the filesystem and updating an "export history" record). The taxonomy guides the default: prefer pure queries where possible, and tag mutations explicitly so that middleware (undo, telemetry, confirmation prompts) can treat them appropriately.

**Axis 2: Parameterized vs. Parameter-Free.** Orthogonally, commands differ in whether they require caller-supplied input.

*Parameter-free* commands need no arguments: `zoomToFit`, `selectAll`, `undo`, `toggleSidebar`. These are trivially invocable from any surface—a button click, a keyboard shortcut, a palette selection, or a macro step—because no input needs to be gathered.

*Parameterized* commands require typed arguments: `setPointColor({color})`, `applyFilter({column, operator, value})`, `navigateToNode({nodeId})`. These demand more from each consumer surface: the command palette may need to render a parameter form, the AI assistant must generate valid arguments, and a macro recorder must capture the arguments alongside the command ID. The schema bridge (Section 2.3) exists precisely to serve these parameterized commands across surfaces.

This two-axis taxonomy keeps the registry flat while providing the classification that consumers need. Middleware can inspect whether a command is a mutation or a query to decide whether to log it, add it to the undo stack, or require confirmation. Consumers can inspect whether a command is parameterized to decide whether to prompt for input.

**Macros as composition, not a third granularity.** Command sequences—macros, workflows, pipelines—are *compositions* of registry commands, not a separate registry entry type. A macro is a list of `{commandId, params}` pairs, composed by orchestrators: macro recorders, AI assistants, test runners, or human authors. Keeping composition at the consumer level avoids the complexity of recursive command definitions in the registry. The registry stays flat; composition happens above it.


## 5. The SSOT Imperative

A healthy single source of truth (SSOT)—and a versioning system around it—is not a nice-to-have. It is a prerequisite for building robust tests, stable extensions, reliable AI tools, and consistent documentation.

**Tests align with code.** When the source of truth for "what parameters does `applyFilter` accept?" is a schema, the test fixture is generated from that schema. If the schema changes, the test fixture changes. If someone adds a required parameter, tests that omit it fail at compile time, not at runtime in production.

**Documentation stays current.** When parameter descriptions live in `.describe()` calls on schema fields, documentation tools can extract them automatically. Cross-language bindings can validate their parameter lists against the same schema. Schema drift becomes a CI failure rather than a user-reported bug.

**Extensions do not break silently.** When the extension API surface is defined by the command registry's schemas, breaking changes are detectable by diffing schema versions. A `proposed` → `stable` lifecycle (as VS Code uses [26]) lets new commands start as proposed and get promoted to stable after validation.

**AI tools stay accurate.** When the AI assistant's tool definitions are generated from command schemas, there is no drift between what the AI thinks it can do and what the application actually supports. This eliminates an entire class of AI hallucination bugs related to stale tool definitions.

**Macros remain valid.** When a macro records `{commandId, params}` pairs against typed schemas, schema versioning can detect whether a saved macro is still compatible with the current application version—and provide migration guidance when it is not.

### 5.1 Costs of SSOT Investment and Practical Strategies

SSOT introduces coupling—changing the schema changes everything downstream. This is intentional, but it means schema changes require more deliberation. There is also a risk of premature SSOT—investing heavily in formalizing schemas for parts of the codebase that are still in flux. The mitigation: start SSOT coverage with the most stable, highest-traffic interfaces and expand incrementally. YAGNI [27] applies to schemas too—but as we argue throughout this paper, the threshold at which schema investment pays for itself is lower than it first appears, because each schema simultaneously serves multiple consumer surfaces.

A common concern is the practical mechanics of SSOT: if the application's behavior is ultimately defined by TypeScript files (store definitions, action handlers, type interfaces), must those TypeScript files be *generated from* JSON Schema declarations to achieve SSOT? Not necessarily. The objective of SSOT is not that one particular file format is the "master"—it is that a single authoritative definition exists and all downstream representations are provably consistent with it. Several strategies achieve this:

**Strategy 1: Schema-first.** JSON Schema (or a schema library like Zod) is the authoritative source. TypeScript types, AI tool definitions, MCP schemas, and documentation are all generated from it. This is the purest SSOT—one file changes, everything follows. Libraries such as Zod with `z.toJSONSchema()` [8] and `json-schema-to-ts` [42] support this direction. The Vercel AI SDK, MCP TypeScript SDK, and LangChain all accept Zod schemas as peer dependencies, making this the path of least resistance in the TypeScript ecosystem.

**Strategy 2: Code-first with extraction.** The TypeScript definitions remain authoritative. JSON Schema is *derived* from TypeScript at build time using tools such as `ts-json-schema-generator` [43] or `typescript-json-schema` [44], which parse the TypeScript AST and emit corresponding JSON Schema. The derived schemas are cached and versioned. This approach preserves developers' existing workflow—they write TypeScript as usual—while producing the JSON Schema that external consumers require. The schema-first ideology of "one definition, all derived" [45] is realized, just with TypeScript as the "one definition" rather than JSON.

**Strategy 3: Dual definitions with CI validation.** Both TypeScript definitions and JSON Schema declarations exist, maintained by a mix of manual authoring and automated extraction. A CI validation step asserts alignment between the two: it parses the TypeScript definitions, generates the expected JSON Schema, and diffs it against the committed JSON Schema files. Discrepancies fail the build. This approach accommodates cases where the JSON Schema needs manual refinement (e.g., adding `description` fields or `examples` that have no TypeScript analog) while preventing drift. It is analogous to snapshot testing for schemas.

Each strategy trades off purity against pragmatism. Strategy 1 is cleanest for greenfield development. Strategy 2 is least disruptive for existing codebases. Strategy 3 offers the most flexibility but requires disciplined CI enforcement. The important point is that SSOT is not a binary choice between "one config file rules everything" and "no consistency guarantees." It is a spectrum, and even a partial SSOT with CI-enforced alignment is vastly better than independently maintained definitions that drift silently.


## 6. Risks and Counter-Arguments

### 6.1 The Inner Platform Effect

The most dangerous risk. If command metadata starts including conditionals, loops, or inheritance hierarchies, the system has gone too far. VS Code's when-clauses are the upper bound of acceptable metadata complexity, and even those are a frequent source of confusion. The guardrail: command metadata should be *data, not code* [13].

**Mitigation.** The safeguard is structural: keep the command definition interface minimal (id, label, schema, execute, when-clause) and resist pressure to add expressiveness. If a use case requires conditional logic, it belongs in the command handler, not in the metadata. Reviewing proposed metadata additions against the question "is this data or code?" catches most violations early.

### 6.2 Premature Generalization

Research at Microsoft found that only about one-third of carefully analyzed features improve their target metrics [28]. Extension points built for hypothetical consumers have similar failure rates. The mitigation is the **rule of three**: do not formalize a command until it needs to be triggered from at least three surfaces. Do not build the extension API until there are three concrete extension use cases. As Sandi Metz wrote: "Duplication is far cheaper than the wrong abstraction" [29].

This heuristic deserves nuance. The rule of three was formulated in a world where each new surface required substantial independent development effort. When the architecture amortizes that effort—because formalizing a command once automatically serves the palette, AI, MCP, macros, and tests—the "three surfaces" threshold is reached sooner and more naturally than it would be with ad hoc integration. The rule of three remains the right guard against premature abstraction, but the command dispatch architecture changes the economics: the *cost* of formalization is lower, and the *benefit* spans more surfaces.

### 6.3 Performance Overhead

Command dispatch indirection is a concern for performance-sensitive applications (e.g., WebGL rendering, real-time data processing). The solution is to *bifurcate the command space*: user-initiated operations (load, filter, zoom, select) flow through the command registry with full middleware, while hot-path operations (rendering, physics simulation, viewport calculations) remain as direct function calls. The command pattern is for operations at human-interaction frequency (milliseconds to seconds), not at frame-render frequency (16ms budget).

It is worth being precise about which consumers actually *require* routing commands through a dispatch layer with middleware interception. Several of the most valuable consumer surfaces—the command palette, keyboard shortcuts, AI tool calling, and MCP servers—need only the *registry metadata* (command ID, label, schema) to function. They call the command handler directly; no middleware intercepts the call. The palette looks up the handler by ID and invokes it. The AI generates arguments and calls the handler. No dispatch overhead is involved.

Middleware interception—where every invocation passes through a chain of pre/post hooks—is needed specifically for telemetry (logging every dispatch), feature flags (gating execution), and undo/redo (capturing state patches). Even for these consumers, the overhead is negligible for operations at human-interaction frequency. A telemetry middleware that logs a command ID and timestamp adds microseconds to an operation that the user perceives in hundreds of milliseconds.

The practical guideline: route all user-initiated, human-frequency commands through the dispatch layer. Leave render-frequency operations (frame updates, pointer tracking, layout computations) as direct function calls. This bifurcation gives a clean architecture for all the surfaces that matter without any perceptible performance cost.

### 6.4 Architecture Astronaut Syndrome

Building elaborate infrastructure that never gets used. Joel Spolsky's diagnostic: "The hallmark of an architecture astronaut is that they don't solve an actual problem" [30]. The antidote is *immediate user value at every phase*. Phase 1 ships a command palette. Phase 2 ships AI tool expansion. Phase 3 ships MCP integration. If any phase does not ship user-facing value, it is a red flag.

**Mitigation.** The strangler fig migration strategy (Section 7) is specifically designed to prevent this. Each phase wraps existing functionality rather than building speculative infrastructure. The command registry starts by wrapping existing store actions—no new features are required. Value is delivered by *exposing existing capabilities* through new surfaces, not by building new capabilities for hypothetical consumers.

### 6.5 Command Pattern vs. Event Sourcing

Some architectures (Redux, CQRS) use events as a central concept, and the relationship between commands and events deserves clarification.

*Commands* are imperative and intent-driven: "Apply this filter." They describe what the caller *wants to happen*. They can fail—a precondition might not be met, a parameter might be invalid, the operation might conflict with current state.

*Events* are past-tense and factual: "FilterApplied." They describe what *did happen*. They are records of accomplished facts and cannot fail—they have already occurred.

The distinction matters practically. The GoF command pattern [35] was designed with undo/redo as a primary use case: each command object carries both an `execute()` and an `undo()` method (or, in modern implementations, a reverse state patch). This is a natural fit for the command dispatch architecture—the undo stack is a sequence of executed commands with their reverse patches [24]. Event sourcing, by contrast, achieves time-travel and audit trails by replaying the event log, which is powerful for auditability but requires computing compensating events for undo—a harder problem in general.

Redux occupies a hybrid position: its "actions" are named with past-tense or imperative verbs (`{ type: 'APPLY_FILTER', payload: {...} }`) and are dispatched imperatively like commands, but the reducer treats them as facts to fold into state. Redux's time-travel debugging is event replay (scrubbing through the action log), not command undo (reversing individual operations).

We recommend commands as the primary primitive—imperative, intent-driven, carrying typed parameters and schemas—with optional event emission *after* successful execution. This event emission serves logging, undo (via captured patches), extension event subscriptions, and telemetry. It is a pragmatic middle ground that provides the benefits of both paradigms without requiring a full event-sourcing rewrite. The command is what the user (or AI, or macro) *intends*; the event is what the system *records*.


## 7. Migration Strategy: The Strangler Fig

The strangler fig pattern [7][31]—wrapping new architecture around existing code, then gradually replacing internals—is the proven approach for introducing a command dispatch architecture without a big-bang rewrite. The pattern was named by Martin Fowler after the strangler fig plant, which grows around a host tree and gradually replaces it [32].

### 7.1 Step 1: Wrap

Create command wrappers around existing store actions and event handlers without changing their behavior:

```typescript
commandRegistry.register({
  id: 'app.camera.zoomToFit',
  label: 'Zoom to Fit',
  execute: () => store.getState().fitView(500)
});
```

The existing action continues to work. The command wrapper is an additional entry point, not a replacement. Feature flags control whether the command palette surfaces these wrapped commands.

### 7.2 Step 2: Enrich

Add metadata progressively. Labels and descriptions first (for command palette). Schema definitions second (for AI tools and MCP). Preconditions third (for context-aware availability). Not all commands need full metadata from day one—a command without a schema is simply not available as an AI tool yet.

### 7.3 Step 3: Extract

Gradually move business logic from store action implementations into command handlers. The store action becomes a thin delegate that calls `commandRegistry.execute(id, params)`. At this point, all consumers (UI, AI, tests, extensions, macros, MCP) go through the same code path, and the command handler is the canonical implementation.

This approach was validated by real-world migrations at multiple organizations, including incremental frontend framework migrations with high test coverage enabling confident refactoring [33][34]. The common success factor is maintaining zero downtime and continuous feature delivery throughout the migration.

### 7.4 Phased Development Plan

The plan is designed for *horizontal coverage with incremental depth*—touching multiple consumer surfaces early with shallow implementations, then deepening based on observed value.

**Phase 1 — Foundation.** Define typed interfaces for key state slices. Build a minimal command registry: `Map<string, CommandDef>` with `id`, `label`, `execute`, optional `schema`. Wrap 15–20 existing store actions as commands. Ship a command palette using `cmdk` [18] or `kbar` [19]. Bind keyboard shortcuts to command IDs using `tinykeys` [20]. Outcome: users can press Ctrl+K and search for operations.

**Phase 2 — Schema Hardening + AI Wiring.** Add schemas to the 10–15 highest-value command parameters. Add validation middleware to key state slices. Wire the AI assistant: commands with schemas auto-register as AI-callable tools. Define 5 critical user stories as command sequences for testing. Outcome: the AI assistant can control the application beyond its original narrow tools.

**Phase 3 — Broadening.** Expand to 50+ commands. Compile intent-based test stories to E2E tests via adapter layers. Build an MCP server adapter: iterate registry, expose commands as MCP tools. Define extension API v0.1. Enable macro recording for user-initiated commands. Outcome: the same user stories that drive tests also drive the AI's available tools, the MCP server's capabilities, and user-composable macros.

**Phase 4 — Maturation.** Extension sandboxing [3]. API lifecycle management (`proposed` → `stable`) [26]. Undo/redo via patches captured in command execution [24]. Schema versioning and breaking-change detection in CI. Command telemetry for data-driven QA prioritization. Macro analytics to identify high-value user workflows.

The only truly sequential dependency is: **State Model → Command Registry → everything else.** All consumer workstreams can be parallelized and reprioritized independently.


## 8. Related Work

The command pattern originates in Gamma et al.'s *Design Patterns* [35], where it encapsulates a request as an object, enabling parameterization, queuing, and undo. Our contribution extends this classical pattern to the multi-surface reality of modern frontend applications, where the "request object" must also carry metadata for discoverability (labels, categories), schema information for AI tool calling (JSON Schema), and preconditions for context-aware availability.

The Command-Query Separation principle, introduced by Bertrand Meyer [40], provides the taxonomic foundation for our classification of commands into mutations and queries. CQRS [41] extends this principle to the architectural level, separating read and write models. Our command taxonomy (Section 4.1) applies CQS at the command registry level, where the distinction guides middleware behavior (undo, telemetry, confirmation) rather than data model separation.

Buschmann et al.'s *Pattern-Oriented Software Architecture* [36] catalogs the command processor pattern in the context of concurrent and networked systems. The schema bridge primitive we identify has no direct analog in the classical pattern literature, reflecting the emergence of JSON Schema as a universal interchange format driven by LLM tool use protocols.

The strangler fig migration pattern was introduced by Fowler [32] and subsequently formalized by Cartwright, Horn, and Lewis [37] as a set of four high-level activities for incremental legacy modernization. Our application of the pattern to frontend command extraction is novel in its focus on progressive metadata enrichment as the mechanism of incremental adoption.

Recent work on LLM function calling [4] and the Model Context Protocol specification [5] establishes JSON Schema as the standard contract between language models and application tools. Our framework explicitly leverages this standardization to unify the AI tool definition problem with the broader command dispatch problem.

The concept of macro recording as a user-facing capability has deep roots in desktop applications (from Emacs keyboard macros to Excel VBA), but its integration into a typed command dispatch architecture—where macros, AI sequences, tests, and extensions share the same structural representation—appears to be a novel synthesis in the frontend architecture literature.


## 9. Conclusion

The command dispatch architecture—built around a named, typed, schema-defined operation registered in a centralized registry—emerges as the natural unifying approach for modern frontend applications that must serve multiple invocation surfaces. The convergent adoption of this pattern by VS Code, Figma, Linear, and Obsidian provides strong empirical evidence. The simultaneous convergence of AI tool frameworks on JSON Schema as the tool parameter contract provides the missing "schema bridge" that connects the command pattern to the new world of LLM-driven application control.

The framework we propose is deliberately minimal: three primitives (state model, command registry, schema bridge), a command taxonomy grounded in Command-Query Separation that avoids recursive complexity, and a strangler fig migration strategy that delivers user-facing value at every phase. The "rule of three" heuristic guards against premature generalization—while acknowledging that the economics of formalization change when the architecture amortizes cost across multiple surfaces. The bifurcation of the command space into human-frequency and render-frequency operations addresses performance concerns, and the distinction between metadata consumers (palette, AI, MCP) and middleware consumers (telemetry, undo, feature flags) clarifies where dispatch overhead actually applies.

The implications extend beyond any single application. As LLM-driven interfaces become standard, every interactive application will face the multi-surface dispatch problem. The applications that have already solved it—through a command dispatch architecture—will be best positioned to expose their capabilities to AI assistants, external protocols, macro composition, and ecosystems of extensions. The architecture does not merely enable these capabilities individually; it enables them as a coherent whole, where a command formalized once serves every surface simultaneously, and where the macro a user records today becomes the test case that prevents a regression tomorrow and the workflow that an AI assistant can compose on a colleague's behalf.


## References

[1] VS Code Extension API: Commands. https://code.visualstudio.com/api/extension-guides/command

[2] VS Code Extension API: Contribution Points. https://code.visualstudio.com/api/references/contribution-points

[3] E. Wallace, "How We Built the Figma Plugin System," Figma Engineering Blog, 2019. https://www.figma.com/blog/how-we-built-the-figma-plugin-system/

[4] K. Ramanathan, "Function Calling Using LLMs," martinfowler.com, 2025. https://martinfowler.com/articles/function-call-LLM.html

[5] Model Context Protocol: Tools Concept. https://modelcontextprotocol.info/docs/concepts/tools/

[6] Vercel AI SDK: Tool Foundations. https://ai-sdk.dev/docs/foundations/tools

[7] I. Cartwright, R. Horn, and J. Lewis, "Patterns of Legacy Displacement," martinfowler.com, 2024. https://martinfowler.com/articles/patterns-legacy-displacement/

[8] Zod JSON Schema Generation. https://zod.dev/json-schema

[9] E. Elliott, "The Command Pattern, Event Sourcing, and Redux Are All Different Architectures," Medium, 2019. https://medium.com/@_ericelliott/the-command-pattern-event-sourcing-and-redux-are-all-different-architectures-but-they-all-3e36b70cbc60

[10] VS Code When-Clause Contexts. https://code.visualstudio.com/api/references/when-clause-contexts

[11] VS Code Extension Anatomy. https://code.visualstudio.com/api/get-started/extension-anatomy

[12] VS Code Extension Patterns and Principles. https://vscode-docs.readthedocs.io/en/stable/extensions/our-approach/

[13] A. Papadimoulis, "The Inner Platform Effect," The Daily WTF, 2005. https://thedailywtf.com/articles/the_inner-platform_effect

[14] MCP TypeScript SDK. https://github.com/modelcontextprotocol/typescript-sdk

[15] Vercel AI SDK: Tool Foundations. https://ai-sdk.dev/docs/foundations/tools

[16] Vercel AI SDK: zodSchema Reference. https://ai-sdk.dev/docs/reference/ai-sdk-core/zod-schema

[17] A. Suska, "Command Palette UX Patterns," Medium (Design Bootcamp), 2023. https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1

[18] cmdk: Command Menu for React. https://cmdk.paco.me/

[19] kbar: Command Palette for React. https://kbar.vercel.app/

[20] tinykeys: Tiny Keybinding Library. https://github.com/jamiebuilds/tinykeys

[21] T. DeSchryver, "Generated Tests with XState and Cypress," 2020. https://timdeschryver.dev/blog/generated-tests-with-xstate-and-cypress

[22] Cucumber Step Definitions. https://cucumber.io/docs/cucumber/step-definitions/

[23] fast-check: Property-Based Testing for TypeScript. https://github.com/dubzzz/fast-check

[24] N. P. Bee, "Command-Based Undo for JS Apps," 2023. https://www.npbee.me/posts/command-based-undo

[25] Trunk-Based Development (Atlassian). https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development

[26] VS Code Proposed API Lifecycle. https://code.visualstudio.com/api/advanced-topics/using-proposed-api

[27] M. Fowler, "YAGNI — You Aren't Gonna Need It," martinfowler.com, 2015. https://martinfowler.com/bliki/Yagni.html

[28] R. Kohavi, D. Tang, and Y. Xu, *Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing*, Cambridge University Press, 2020.

[29] S. Metz, "The Wrong Abstraction," sandimetz.com, 2016. https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction

[30] J. Spolsky, "Don't Let Architecture Astronauts Scare You," joelonsoftware.com, 2001. https://www.joelonsoftware.com/2001/04/21/dont-let-architecture-astronauts-scare-you/

[31] Incremental Migration Strategies. https://medium.com/@navidbarsalari/incremental-migration-evolving-without-breaking-production-edf679769918

[32] M. Fowler, "Strangler Fig Application," martinfowler.com, 2004 (updated 2024). https://martinfowler.com/bliki/StranglerFigApplication.html

[33] AI-Driven Refactoring in Large-Scale Migrations (Qonto). https://medium.com/qonto-way/ai-driven-refactoring-in-large-scale-migrations-strategies-and-techniques-fcdb9b5116c6

[34] Incremental Refactoring Case Study (This Dot Labs). https://www.thisdot.co/case-study/incremental-refactoring

[35] E. Gamma, R. Helm, R. Johnson, and J. Vlissides, *Design Patterns: Elements of Reusable Object-Oriented Software*, Addison-Wesley, 1994.

[36] F. Buschmann, R. Meunier, H. Rohnert, P. Sommerlad, and M. Stal, *Pattern-Oriented Software Architecture, Volume 1: A System of Patterns*, Wiley, 1996.

[37] M. Fowler, "Patterns of Legacy Displacement," martinfowler.com, 2024. https://martinfowler.com/articles/patterns-legacy-displacement/

[38] Redux and the Action Pattern. https://www.oursky.com/blogs/why-and-when-to-use-redux-design-pattern-redux-store-data-flows

[39] M. Cohn, *Succeeding with Agile: Software Development Using Scrum*, Addison-Wesley, 2009. (Introduces the test automation pyramid.)

[40] B. Meyer, *Object-Oriented Software Construction*, Prentice Hall, 1988. (Introduces Command-Query Separation.)

[41] M. Fowler, "CQRS," martinfowler.com, 2011. https://www.martinfowler.com/bliki/CQRS.html

[42] T. Aribart, json-schema-to-ts: Infer TypeScript types from JSON schemas. https://github.com/ThomasAribart/json-schema-to-ts

[43] ts-json-schema-generator: Generate JSON Schema from TypeScript sources. https://github.com/vega/ts-json-schema-generator

[44] typescript-json-schema: Generate JSON Schema from TypeScript sources. https://github.com/YousefED/typescript-json-schema

[45] C. Holland, "The Schema Language Question: Avro, JSON Schema, Protobuf, and the Quest for a Single Source of Truth," chiply.dev, 2025. https://www.chiply.dev/post-schema-languages

[46] VS Code QuickInput API Sample. https://github.com/microsoft/vscode-extension-samples/tree/main/quickinput-sample

[47] Raycast Extension API: Arguments. https://developers.raycast.com/information/lifecycle/arguments

[48] AutoForm: Automatically Render Forms from Schema. https://github.com/vantezzen/autoform

[49] react-jsonschema-form: A React Component for Building Web Forms from JSON Schema. https://github.com/rjsf-team/react-jsonschema-form

[50] S. Solomon, "Designing Command Palettes," solomon.io, 2024. https://solomon.io/designing-command-palettes/

[51] T. Boucher, "How to Build a Remarkable Command Palette," Superhuman Engineering Blog, 2021. https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
