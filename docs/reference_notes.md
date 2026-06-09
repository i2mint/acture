# Reference Notes — Command Dispatch Architecture

> **Migrated from wrapex 2026-05-12.** All `wrapex` / `command-wrapex` references renamed to `acture`. The referenced `command_dispatch_journal_article -- fetched/` directory lives at the *external* path `/Users/thorwhalen/Dropbox/_odata/ai_contexts/projects/soft_design/command_dispatch/command_dispatch_journal_article -- fetched/` (manifest.json + ref_01…ref_51). It is not copied into this repo. Read individual `ref_NN_*.md` files there only when this distilled notes file is insufficient for a specific design question.

Per-article distilled notes on the references cited in [`command_dispatch_journal_article.md`](command_dispatch_journal_article.md). Each section follows a consistent shape: **Core idea**, **Key ideas / concepts**, **Dos**, **Don'ts**, **Direct relevance to acture design**, and optional **Quotable lines**.

Notes are organized thematically (VS Code core; AI / MCP / plugins; migration & discipline; schema & SSOT; testing, undo, CQRS; palette UX & keybindings) rather than by reference number, with cross-links to the corresponding external `ref_NN_*.md` files.

**The three acture modes** referenced throughout:
- **Mode 1 — Minimize footprint:** add command-dispatch capabilities to an existing app with the smallest possible disruption; steady-state, not a migration trajectory.
- **Mode 2 — Full migration (strangler fig):** incrementally move an existing app to pure command-dispatch.
- **Mode 3 — Greenfield:** design the app command-dispatch-first from day one.

---

## Part I — VS Code: the gold-standard architecture

### ref_01 — VS Code Commands API

**Core idea:** Commands are the unit of action — a stable string ID bound to a handler, discoverable via the palette, invokable from keybindings, menus, or programmatically via `executeCommand`. The architecture deliberately separates the *binding* (handler) from the *user-facing declaration* (manifest entry), so commands have UI metadata even before the implementing extension is loaded.

**Key ideas / concepts:**
- Dual model: `registerCommand(id, handler)` (imperative) vs. `contributes.commands` in `package.json` (declarative).
- `executeCommand(id, ...args)` is the single dispatch primitive — both internal logic and the UI use it.
- Command URIs (`command:foo.bar?<JSON-encoded-args>`) make commands addressable as hyperlinks (only inside `isTrusted` markdown).
- `enablement` (applies to keybindings + menus globally) vs. `when` (per-menu visibility) — distinct semantics that prevent menu clutter.
- Custom context keys via `setContext` for app-specific gating.
- Naming convention: verb + noun, title case, no "command" in title.

**Dos:**
- Make `dispatch(id, args)` the single entry point — every surface goes through it.
- Separate declarative metadata (labels, categories, schemas) from imperative handlers; allow lazy handler resolution.
- Distinguish "hide from palette" (when) from "disable everywhere" (enablement) — acture needs both knobs.
- Treat command URIs as a first-class surface (hover cards, error messages, AI-generated links).

**Don'ts:**
- Don't bake conditional execution logic into command metadata — keep it data, not code.
- Don't require handlers at registration time for every command; that breaks lazy loading and the strangler-fig mode.
- Don't conflate "should show" with "should run."

**Direct relevance to acture design:**
- Most directly informs the **command registry** primitive (Section 2.2 of the article) for all three modes. For mode 1, the dual model means an existing app can declare commands in a manifest without restructuring handlers. For mode 3, `dispatch` becomes the only call site convention.
- Argues for two separate predicate fields on `CommandSpec`: `visibleWhen` (palettes/menus) and `enabledWhen` (keybindings + AI tools). acture should not collapse these.
- Command URIs map directly to acture's "AI assistant + MCP" surface: an LLM-generated message containing `command:foo?args` becomes an actionable suggestion.

**Quotable lines:**
- "There is semantic overlap between `enablement` and the `when` condition of menu items… The `when` clause prevents clutter."

---

### ref_02 — VS Code Contribution Points

**Core idea:** Static JSON declarations under `contributes` in `package.json` extend VS Code without executing code — commands, keybindings, menus, configuration, views, walkthroughs, etc. all share a uniform declarative schema with `when`-clause gating, allowing the editor to render UI before any extension code loads.

**Key ideas / concepts:**
- ~40 distinct contribution types; commands, keybindings, menus, and configuration are the foundational quartet.
- `configuration` uses JSON Schema directly — type/enum/min/max/pattern, with extensions like `markdownDescription`, `scope`, `enumItemLabels`, `deprecationMessage`.
- Menus are addressed by *location* (e.g. `editor/title`, `commandPalette`, `view/item/context`) — commands declare *what they do*; menus declare *where they appear*.
- Group + order syntax (`navigation`, `1_modification`, `myGroup@1`) for stable, lexicographically sortable placement.
- Keybindings include `key`/`mac`/`linux`/`win` overrides and a `when` clause.
- `commandPalette` is itself just a menu location — palette visibility is a menu rule, not a command property.
- Walkthroughs/welcome content can include `command:` links — UI as data pointing at command IDs.

**Dos:**
- Express *placement* (palette, menu, keybinding) as separate declarative records that *reference* a command ID — not as fields on the command itself.
- Use JSON Schema as the configuration substrate; expose `description`/`markdownDescription`/`enumDescriptions` so AI tool descriptions and UI tooltips come from one source.
- Provide group + order for menu/palette ordering rather than implicit registration order.

**Don'ts:**
- Don't fold all surface metadata into the command record — it creates an explosion (`paletteWhen`, `menuWhen`, `keybindingWhen`, …). Separate records are simpler.
- Don't allow `$ref`/`definition` in configuration schemas (VS Code disallows this) — keep schemas self-contained for portability.
- Don't surface disabled items the same everywhere — palettes should *filter*, context menus should *gray out*.

**Direct relevance to acture design:**
- This is the canonical pattern for the **schema bridge** + **registry** boundary. acture should split its registry into (a) `CommandSpec` (id, schema, handler) and (b) `Contribution` records (`PaletteEntry`, `KeybindingEntry`, `MenuEntry`) that *reference* a command id. Particularly relevant to mode 1: contributions can live in a JSON file an existing app loads, with zero code changes.
- The `menus.commandPalette` pattern justifies acture's "palette is just one consumer" framing — palette visibility is not a command attribute.
- The configuration contribution point is a model for how acture should expose app-level settings to the same JSON-Schema-driven render layer used for command parameters.

---

### ref_10 — VS Code When-Clause Contexts

**Core idea:** A small predicate DSL (boolean, equality, comparison, regex match, `in`/`not in`) evaluated against a context-key store, used everywhere VS Code needs conditional UI: keybindings, menu visibility, view welcome content, walkthrough steps. Context keys are pushed by the runtime (e.g. `editorFocus`, `resourceLangId`) and by extensions via `setContext`.

**Key ideas / concepts:**
- DSL surface: `!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~` (regex), `in`, `not in`.
- Context keys are scalars or arrays/objects (for `in` lookup).
- `config.foo.bar` magic prefix exposes any setting as a context key.
- `view.${id}.visible` / `focusedView` / `activeViewlet` — first-class focus/visibility keys.
- Extensions register custom keys via `executeCommand('setContext', key, value)`.
- Right-hand side of `==` is a *literal*, never re-resolved — no transitive lookup except via `in`.
- The expression is *data* — serializable, inspectable (Developer: Inspect Context Keys).

**Dos:**
- Treat preconditions as a small, serializable expression language, not arbitrary JS callbacks. Serializable preconditions are inspectable by AI, exportable to MCP, testable.
- Provide a global `setContext(key, value)` for app code to push reactive state.
- Auto-publish a curated set of built-in context keys (focus, route, selection size, dirtiness, OS) — these are 80% of real-world conditions.
- Allow `config.*` to be referenced directly so settings double as predicates.

**Don'ts:**
- Don't let preconditions become full JS — that destroys static analysis, AI usability, and serializability.
- Don't expose every internal flag as a context key; curate. Stale keys become a maintenance tax.
- Don't make precondition evaluation slow — it runs on every keystroke / menu open.

**Direct relevance to acture design:**
- Defines the shape of the `visibleWhen`/`enabledWhen` predicate type. acture should ship a `WhenClause` parser/evaluator with the same operator set — small, serializable, JSON-friendly. Critical for the AI/MCP surface: an LLM can read a when-clause string and reason about availability, which it cannot do with an opaque function.
- A reactive context store (zustand slice keyed by string → primitive) is the natural backing for when-clauses. Most affects modes 2 and 3.
- Argues against allowing `(state) => boolean` as a precondition in the public API; instead require declarative expression, with an `escapeHatch: (state) => boolean` only for advanced cases.

**Quotable lines:**
- "The right-hand side is a value and not interpreted as a context key, meaning it is not looked up in the context."

---

### ref_11 — VS Code Extension Anatomy

**Core idea:** A VS Code extension is exactly three things: activation events (when to load), contribution points (static `package.json` declarations), and the runtime API (what code can do once loaded). The `activate(context)` / `deactivate()` lifecycle plus `context.subscriptions` (disposable registry) gives a uniform, leak-free pattern for owning UI bindings.

**Key ideas / concepts:**
- Three pillars: activation events, contribution points, API. Same three the article in §2 mirrors (state, registry, schema).
- `registerCommand` returns a `Disposable`; pushing it onto `context.subscriptions` ties lifetime to the extension.
- Since VS Code 1.74, declared commands implicitly activate the extension — declarative entries are enough for lazy loading.
- `engines.vscode` pins the API version, enabling forward-compatible types.

**Dos:**
- Tie every registration's lifetime to an owner so cleanup is one call. acture realizes this lesson with bare `() => void` unregister thunks rather than `Disposable` objects — `registerAll` returns a single thunk that unloads a group atomically.
- Implicit activation: declaring a command in the manifest should be enough for acture to know about it; runtime handler binding can be deferred until first invocation.
- Version the registry API surface (`engines.acture: "^1.0"`) so consumers can pin and acture can deprecate cleanly.

**Don'ts:**
- Don't require an `activate()` hook in mode-1 integrations — that imposes a framework where the user wanted a library.
- Don't leak subscriptions; every `register*` must be paired with a disposal path.

**Direct relevance to acture design:**
- Maps to acture's existing **owner lifecycle management** (recent commit `bb9a790`). Confirms the design instinct: each registration returns a handle, owners group handles, owners dispose en masse. Keep this.
- Suggests acture needs a "minimal manifest" loader for mode 1: a JSON file declares commands/keybindings, acture registers them, the host app supplies handlers later via `setHandler(id, fn)`.
- Argues for separating `registerCommandSpec(spec)` (metadata only, eager) from `bindHandler(id, fn)` (lazy) in the public API.

---

### ref_12 — VS Code Extension Patterns and Principles

**Core idea:** A statement of the design philosophy behind VS Code's extension model: extensions run isolated in a separate process, never touch the DOM, and interact through a curated, intentionally small API. Stability and performance dominate; expressive power is intentionally throttled because UI coupling is the enemy of long-term API stability.

**Key ideas / concepts:**
- *No DOM access* — UI is consumed via contribution points, not built by extensions.
- *Process isolation* — extension host is a separate Node process; a misbehaving extension cannot freeze the editor.
- *Lazy activation* — extensions load only when their activation event fires; never used = never loaded.
- *Small, growing API surface* — start tiny, expand on request, because added API is permanent.
- *Protocol-based extensibility* — LSP, DAP: when the surface area is huge (a language), use an IPC protocol instead of an in-process API.

**Dos:**
- Curate acture's API surface aggressively — every public symbol is a long-term commitment.
- Lazy-load command handlers; never load all of them at startup just to populate a palette.
- Prefer protocol/serialization boundaries (JSON Schema, MCP) for cross-process/cross-language reach instead of expanding the in-process API.
- Give consumers declarative escape hatches (manifest entries) before imperative ones.

**Don'ts:**
- Don't expose internal UI primitives (React components, store internals) to consumers — they will couple to them and you can never refactor.
- Don't add API "because someone asked" without a strangler/migration story.
- Don't conflate "extension API" with "internal API"; they have different stability contracts.

**Direct relevance to acture design:**
- Strongest argument for acture to have a documented **stability tier system** (stable / proposed / internal). Most affects mode 3 (greenfield) where acture is the long-term API.
- Justifies a two-layer architecture: a small, stable command-dispatch core + a separate, opinionated UI layer (palette, forms) that is replaceable.
- Reinforces MCP integration as the *primary* extensibility surface — acture should not invent a plugin API; MCP + JSON Schema *is* the plugin API.

**Quotable lines:**
- "VS Code took the defensive approach to not expose the DOM to extenders."
- (Implicit) Small, growing > large and frozen.

---

### ref_26 — VS Code Proposed API Lifecycle

**Core idea:** VS Code separates API into stable and "proposed" tiers; proposed APIs are unstable, Insiders-only, opt-in via `enabledApiProposals` in `package.json`, and explicitly cannot be published. This is the institutional mechanism that lets a long-lived API platform iterate without breaking consumers.

**Key ideas / concepts:**
- *Two-tier API*: stable (forever) and proposed (subject to change, no Marketplace publishing).
- Per-proposal opt-in: each proposed API has its own `.d.ts` and is enabled by name — not a global beta flag.
- Type files distributed separately (`@vscode/dts`).
- Insiders-only enforcement makes "do not use in production" a runtime constraint.
- Stable promotion path: proposed → community feedback → stable, with API potentially changing during proposal phase.

**Dos:**
- Adopt a tier system in acture: `@stable`, `@experimental` (opt-in per feature), `@internal`. JSDoc tags + TS conditional types + a runtime guard that warns when an experimental API is used without an opt-in flag.
- Ship experimental types in a separate sub-export (e.g. `acture/experimental`).
- Per-feature opt-in beats a global beta flag.

**Don'ts:**
- Don't promote experimental APIs without a deprecation/migration story.
- Don't expose experimental APIs from the default barrel export.
- Don't allow indefinite proposed state — set a 3–6 month timeout for promotion or removal.

**Direct relevance to acture design:**
- Informs versioning and deprecation policy. Most relevant for mode 3 and for any third-party MCP exposure where breakage propagates to LLM tool definitions.
- Suggests `acture` (stable), `acture/experimental` (opt-in), `acture/internal` (no SemVer guarantee).
- For the AI/MCP surface, an LLM trained on tool schemas at version N must keep working at N+1. Proposed APIs should *never* be exported to MCP without an explicit flag.

---

### ref_46 — VS Code QuickInput API Sample

**Core idea:** Thin reference that points at `QuickPick` and `InputBox` — the imperative APIs behind VS Code's command palette and prompt UIs. Both `showX` (one-shot promise) and `createX` (stateful, mutable, event-driven) variants exist for different complexity levels.

**Key ideas / concepts:**
- Two-tier API per primitive: `window.showQuickPick(items)` (simple, returns promise) vs. `window.createQuickPick()` (returns a mutable, event-emitting object).
- The palette and the parameter-collection UX use the *same* primitive.
- This is invoked from a command registered in `package.json` — the palette is itself just a command consumer.

**Dos:**
- Provide both a simple promise API (`pick(items)`, `input(prompt)`) and a stateful/eventful API for multi-step or live-validated flows.
- Use the same primitives for the palette and for command-parameter collection — acture should not have two unrelated UIs.
- Multi-step flows are state machines over QuickInputs — model parameter collection that way.

**Don'ts:**
- Don't conflate "show a picker" with "the command palette" — the palette is one *instance* of picker.
- Don't ship only the high-level API; users with live validation/cancellation needs hit a wall.

**Direct relevance to acture design:**
- Direct guidance for acture's **param-collector** module (commit `ad0d9c8`). Confirms the two-tier API split: simple `collect(commandId, partialArgs)` + `createCollector()` factory for stateful multi-step wizards.
- Validates that the palette and param-collection share UI primitives — acture's "parameterized command palette" guide fits this model.
- Most acute for mode 1: a small-footprint integration wants `await acture.pick(items)` without a registered command. acture should expose the QuickInput primitives independently of the registry.

---

## Part II — AI, MCP, and Plugin Sandboxing

### ref_03 — Figma plugin sandbox: how to safely run third-party code

**Core idea:** Figma's journey from naive `eval` through iframes to Realms-based sandboxing illustrates that running untrusted code safely requires whitelisting (not blacklisting) globals, and that the API surface between host and sandbox must be designed as a thin, auditable, low-level membrane. The membrane pattern decouples the API from the sandbox technology so the implementation can be swapped without breaking plugins.

**Key ideas / concepts:**
- Sync vs async API ergonomics: forcing `await` everywhere is a usability tax non-CS authors can't pay.
- Copying state across a boundary doesn't scale; direct, in-process manipulation on the main thread wins on perf.
- Membrane pattern: a tiny (~500 LOC) low-level VM-like handle interface so individual API endpoints don't each need a security audit.
- "Hide globals" via `with` + Proxy + same-origin iframe globals (Realms shim).
- Two-part plugin model: privileged document-access part + sandboxed iframe UI part communicating via message passing.

**Dos:**
- Design the command API so it can run synchronously in the host's process — don't force async on consumers.
- Keep the trust boundary small and explicit (a single handle-based interface), not spread across every command.
- Allow third-party extensions to register commands; gate them via capability whitelists.
- Make the sandbox/runtime pluggable behind a stable extension API.

**Don'ts:**
- Don't bolt security onto each command individually — surface area explodes.
- Don't expose host objects directly to extension code (prototype-chain escapes).
- Don't require extension authors to learn `async/await` semantics for trivial actions.

**Direct relevance to acture design:**
- Directly informs the **extension/plugin story** for all three modes, especially mode 3 where command-dispatch is the universal extension point. Argues for: (a) a thin command-handle interface that third-party tools call into rather than direct registry mutation, (b) sync-first command signatures with optional async, (c) capability-scoped command exposure (a plugin sees a filtered subset of the registry).
- Mode 1 benefits from the membrane idea: wrap the existing app behind a stable command interface so future sandboxing is possible without rewrites.

**Quotable lines:**
- "JavaScript doesn't have to be dangerous… It's Browser APIs that are dangerous."
- "Writing a plugin should feel like a designer automating their actions."

---

### ref_04 — Function calling using LLMs (Ramanathan, Martin Fowler)

**Core idea:** Function calling is just the LLM emitting a structured (name, args) JSON payload — the host program decides what (if anything) to execute. The article walks a shopping agent from hand-written schemas to Pydantic-generated schemas via `instructor`, and frames MCP as the natural next step when the tool set must be discovered dynamically. Argues function-calling agents are a viable replacement for traditional rules engines.

**Key ideas / concepts:**
- LLM never executes — it proposes. Dispatch stays under host control.
- Tool schema duplication is a real pain point; derive schemas from typed action classes (Pydantic / Zod).
- Restrict action space with explicit conditional dispatch — never `eval` LLM output.
- Guardrails: input sanitization + denylist + LLM-as-validator, layered.
- Hardcoded tool set vs MCP runtime discovery: more flexibility, more attack surface.

**Dos:**
- One source of truth: define command (action class) once, derive LLM schema, CLI schema, UI form from it.
- Explicit name→class dispatch table; never reflectively call by string from LLM output.
- Start with low-risk commands exposed to the LLM, expand as guardrails mature.

**Don'ts:**
- Don't `eval()` LLM-produced JSON or argument strings.
- Don't hand-maintain JSON schemas in parallel with action classes.
- Don't trust the LLM's chosen function as authorization — it's a suggestion, not a permission.

**Direct relevance to acture design:**
- Validates the core thesis: the command registry is the structured dispatch layer between any caller and the action. Argues for (a) Zod-as-SSOT with `toJSONSchema` for LLM/MCP, (b) a runtime `dispatch(name, args)` that runs validation and authorization independent of who proposed the call, (c) "risk levels" or capability tags per command so mode 1 adopters can incrementally widen LLM exposure.
- Most relevant to modes 1 and 2 — the strangler-fig framing matches "expose low-risk commands first."

---

### ref_05 — MCP Tools concept

**Core idea:** MCP defines tools as `{name, description, inputSchema}` discoverable via `tools/list` and invokable via `tools/call`, designed to be model-controlled with human-in-the-loop approval. Errors are reported in-band (`isError: true` in the result content), not as protocol errors, so the model can react to them. Tools are dynamic — servers can notify clients of changes via `notifications/tools/list_changed`.

**Key ideas / concepts:**
- `{name, description, inputSchema (JSON Schema), result}` is the minimal tool contract — pretty much exactly the acture command shape.
- Model-controlled with human approval gate baked into the conceptual model.
- Tools represent *actions* (state-changing) vs resources (data) — important conceptual split.
- Errors-as-data: surface failures in the result object so the model can recover.
- Dynamic tool surfaces: list-changed notifications enable hot-registration.

**Dos:**
- Return errors as structured content (`isError: true`) rather than throwing across the wire — preserves LLM observability.
- Emit registry-changed events when commands are added/removed so observers (palettes, MCP servers, LLM clients) can refresh.
- Keep tool ops focused and atomic; document return-value shape per command.
- Implement progress reporting hooks for long-running commands.

**Don'ts:**
- Don't conflate authentication/authorization with the tool definition — handle outside the schema.
- Don't expose internal error details to model callers (leak vector).
- Don't update tool definitions silently — version them.

**Direct relevance to acture design:**
- This is essentially the target shape for acture's command interface — adopt the MCP tool shape directly so any command can be exposed as an MCP tool with zero translation. Command registry should emit `commandsChanged` events; every command result must be a discriminated union with an error variant (not exceptions); progress should be a first-class concept. Most relevant to mode 3 — design command shape MCP-isomorphic from day one.

---

### ref_06 — Vercel AI SDK tool foundations

**Core idea:** A tool is `{description, inputSchema, execute}` — Zod or any Standard Schema works. The SDK splits tools into three kinds (custom / provider-defined / provider-executed), and treats tools as just JavaScript objects that can be packaged and published as npm modules. Multi-step calls auto-pipe tool results back to the LLM.

**Key ideas / concepts:**
- `tool({description, inputSchema, execute})` factory — minimal, plain-object surface.
- Standard Schema compatibility (Zod v3/v4, Valibot, ArkType, JSON Schema) means no library lock-in.
- Tools-as-packages: distribute a curated tool set via npm; consumer just imports and spreads into `tools:`.
- Three execution loci: client custom, client provider-shaped, server-side.
- `stopWhen: stepCountIs(10)` style budget controls on agent loops.

**Dos:**
- Plain-object command/tool descriptors — make acture commands trivially convertible to Vercel AI SDK tools (one-liner adapter).
- Embrace Standard Schema so users aren't forced into Zod.
- Make commands packageable: a acture "command pack" should be just an exported object users spread into their registry.
- Cap multi-step agent loops with an explicit budget primitive.

**Don'ts:**
- Don't invent a bespoke schema format; ride the Standard Schema rails.
- Don't bundle execution semantics tightly with the descriptor — keep `execute` separable.
- Don't make tools harder to publish than a plain npm package.

**Direct relevance to acture design:**
- Strongest direct API influence: acture commands should look like Vercel-SDK tools but with extra metadata (keybindings, UI hints, palette grouping, auth). Provide first-class adapters: `toVercelTools(registry)`, `toMcpServer(registry)`. Most relevant to modes 1 and 3.

---

### ref_14 — MCP TypeScript SDK (v2)

**Core idea:** The official TS SDK splits server and client into separate packages, with thin runtime adapters (Express/Hono/Node http) kept as opt-in middleware. Tools and prompts use Standard Schema — bring your own. v2 is pre-alpha; v1 remains production-recommended.

**Key ideas / concepts:**
- `server.registerTool(name, {description, inputSchema}, handler)` — name + schema + executor, exactly the acture command triple.
- Transport-agnostic server (`connect(transport)` decoupled from stdio/HTTP) — pluggable I/O.
- Middleware packages are *thin adapters* with an explicit "no business logic" rule.
- Standard Schema rather than Zod-lock-in.

**Dos:**
- Split core registry from transport: `acture/core` (registry, dispatch, schemas) and `acture/mcp`, `acture/palette`, `acture/hotkeys` as adapter packages.
- Adopt the "thin adapter" discipline — adapter packages must not add behaviour, only translation.
- Standard Schema in/out so users pick their validator.

**Don'ts:**
- Don't put framework-specific code (React, Express) in the core package.
- Don't ship a monolith; split by transport/consumer.

**Direct relevance to acture design:**
- Direct templating for acture package layout — mirror this split exactly. Core is a typed registry + dispatch; everything else (palette UI, MCP server adapter, AI SDK adapter, keyboard shortcut binder, test harness, undo recorder) is an opt-in package consuming the core. Relevant to all three modes; the "thin adapter, no business logic" rule should be enshrined in CONTRIBUTING.

---

### ref_16 — Vercel AI SDK `zodSchema()` reference

**Core idea:** `zodSchema()` converts a Zod schema to a JSON Schema compatible with the AI SDK; usually Zod objects can be passed directly. The article is mostly a footgun warning: Zod's immutability means metadata methods (`.meta()`, `.describe()`) only stick if they're the *last* call in the schema chain. Recursive schemas need `useReferences: true`.

**Key ideas / concepts:**
- Implicit Zod→JSON Schema conversion is the happy path.
- Metadata loss footgun: chain order matters because schema methods return new instances.
- `useReferences: true` for recursive types.

**Dos:**
- Provide an internal `commandSchema()` helper that wraps Zod conversion, normalizes metadata placement, and surfaces clear errors when descriptions are missing.
- Allow recursive command argument types (file trees, AST nodes) via reference-aware conversion.

**Don'ts:**
- Don't expose raw Zod→JSON Schema conversion without warning about metadata ordering.
- Don't assume `.describe()` survives further chaining.

**Direct relevance to acture design:**
- Narrow but real: acture's command-definition DX must guard users against this exact footgun. Validate at registration time that `description` is present and metadata round-trips through JSON Schema; fail loudly otherwise. Marginal across modes — equally relevant wherever Zod is used.

---

## Part III — Migration, Discipline, and Avoiding Architecture Astronaut Syndrome

### ref_07 — Patterns of Legacy Displacement (Cartwright, Horn, Lewis)

**Core idea:** Legacy modernization fails when treated as a one-shot "replacement programme" with feature parity and big-bang cutover. Instead, displace legacy incrementally via four activities — clarify outcomes, find seams, deliver in slices, and change the organization. Transitional architecture is a deliberate investment, not throwaway waste.

**Key ideas / concepts:**
- The Legacy Replacement Treadmill: 3–5 year programmes that get overtaken by reality.
- Feature Parity is an anti-pattern.
- Seams (technical + business) are the unit of breakdown.
- Transitional Architecture is intentional, budgeted, and removed when done.
- Event Interception + Content-Based Router as the canonical entry seam.
- Branch by Abstraction at sub-system scale.
- "Technology is at most 50% of the legacy problem."
- Conway's Law / Inverse Conway Maneuver.

**Dos:**
- Name explicit outcomes before designing migration.
- Find seams in both technology AND business processes.
- Build event routers / interceptors that route some traffic to the new world.
- Treat the transitional layer as a first-class deliverable.
- Pick technology that can be "done over" in 2–3 years.
- Segment rollout by business dimension.

**Don'ts:**
- Big-bang cutover or feature-parity rewrites.
- "Netflix Envy" — copying mega-tech architecture you don't need.
- Treating modernization as orthogonal to BAU delivery.
- Hiding transitional-architecture cost (it's mistaken for waste).

**Direct relevance to acture design:**
- Maps directly to mode 2 strangler-fig migration. The command registry IS the seam: register one route/feature as a command, then divert UI/CLI/MCP entry points to dispatch through it while the legacy code path persists behind the handler.
- Justifies shipping a deliberate "transitional/coexistence" layer in the public API (e.g., `wrapMutation(legacyHandler)` adapters, Event Interception-style middleware) rather than purist command-only APIs.
- Supports mode 1: pitch acture as a tool that lets users intercept and reroute *some* actions without rewriting.
- The four activities should structure the migration skill/playbook.

**Quotable lines:**
- "Technology is at most only 50% of the legacy problem."
- "Don't make any choices that cannot easily be 'done over' [in] 2–3 years."

---

### ref_25 — Trunk-Based Development

**Core idea:** Small, frequent merges to a single trunk, kept always-green by automated tests and feature flags, beat long-lived feature branches for CI/CD throughput. Branches should be short-lived, reviewed asynchronously alongside CI, and never block a deploy. Feature flags substitute for branches when work isn't yet user-ready.

**Dos / Don'ts (compressed):**
- Tiny commits, daily merges, wrap incomplete features in flags, fast builds.
- Avoid long-lived branches, code freezes, async review queues that delay merging.

**Direct relevance to acture design:**
- Most relevant to mode 3 and to acture's own development. Argues for a `featureFlag`/`experimental` field on the command schema so unfinished commands can ship dark: hidden from palette, available to LLM in dev. Connects to ref_26.
- The migration playbook: each command-extraction PR should be a *small*, mergeable trunk commit, not a multi-week refactor branch. acture's tooling should produce small reviewable diffs.

**Quotable lines:**
- "Trunk-based development is a required practice of CI/CD."

---

### ref_27 — YAGNI (Martin Fowler)

**Core idea:** Don't build presumptive features or speculative abstractions; the empirical rate of correctly-predicted features is ~⅓, and even successful ones carry cost-of-delay and cost-of-carry. YAGNI is only safe when the codebase is *malleable* — refactoring, self-testing code, and CD are the enablers, not violations.

**Key ideas / concepts:**
- Four costs of presumptive features: build, delay, carry, repair.
- Most predicted features (⅔) are wrong even with careful analysis.
- "Any extensibility point that's never used isn't just wasted effort, it's likely to also get in your way as well" (Jeremy Miller).
- Cheap-to-add-later flexibility is fine *if it doesn't add complexity now*.

**Dos:**
- Add fields, options, and abstractions only when a real caller needs them.
- Invest in refactoring, tests, CD so deferring is cheap.
- Run the "imagine the refactoring" thought experiment.

**Don'ts:**
- Adding parameters "in case" or extension hooks "for plugins later."
- Speculative abstractions that obscure current code.
- Treating extensibility as inherently good.

**Direct relevance to acture design:**
- The most important article for acture's API surface. The library is at high risk of architecture-astronaut bloat: command palette + LLM tools + MCP + undo + macros + telemetry + extensions is exactly the "messaging" abstraction Joel warns about.
- Concrete decisions: don't ship undo/redo, macros, telemetry middleware, or proposed-API channels in v1 unless a real user has them. Ship the registry + dispatcher + palette + zod-schema-driven LLM tool conversion. Everything else stays in docs until pulled.
- Reinforces mode 1 "minimize footprint": tree-shakeable subpackages (`acture-llm`, `acture-mcp-server`, `acture-undo`) over a god-package.

**Quotable lines:**
- "Any extensibility point that's never used isn't just wasted effort, it's likely to also get in your way as well."
- "Yagni requires (and enables) malleable code."

---

### ref_29 — The Wrong Abstraction (Sandi Metz)

**Core idea:** Once a shared abstraction starts accreting boolean/conditional parameters per new caller, it has become the wrong abstraction; the sunk-cost instinct to preserve it is the disease. The fix is to inline it back into callers, delete the irrelevant branches, and re-discover the correct seam. Duplication is cheaper than the wrong abstraction.

**Dos:**
- Watch for "almost fits, add a flag" — the warning sign.
- Inline → delete dead branches → re-extract from real duplication.
- Treat duplication as a temporary, informational state.

**Don'ts:**
- Adding `if (mode === "X")` to a shared helper.
- Defending an abstraction because of effort already spent.
- Premature DRY before concrete callers exist.

**Direct relevance to acture design:**
- Affects all three modes. The temptation: make `commandSchema` carry every possible field (palette, LLM, MCP, undo, telemetry, accessibility). When a new caller "almost fits," acture will be tempted to add `command.options.kind` flags — exactly the smell. **Prefer composition:** thin core `Command`, then `palettable(cmd, {...})`, `toolCallable(cmd, {...})`, `undoable(cmd, {...})` as separate small abstractions.
- For mode 2 migration: allow users to *duplicate* business logic into a fresh command rather than route everything through one shared dispatcher that grows conditionals. The migration playbook should explicitly invoke "inline, then re-extract."

**Quotable lines:**
- "Duplication is far cheaper than the wrong abstraction."
- "When the abstraction is wrong, the fastest way forward is back."

---

### ref_30 — Don't Let Architecture Astronauts Scare You (Spolsky)

**Core idea:** "Architecture astronauts" climb levels of abstraction until they're talking about "messaging" or "peer-to-peer" — beautiful generalizations that have lost contact with the actual user benefit. The interesting thing about Napster wasn't peer-to-peer; it was typing a song name and hearing it instantly. Build for the concrete user win, not the elegant pattern.

**Dos:**
- Lead pitches with concrete user-visible wins, not architectural elegance.
- Validate every abstraction layer by asking "what can a user do now that they couldn't?"

**Don'ts:**
- Marketing on category ("a unified dispatch architecture") rather than capability.
- Generalizing past the use case.
- Confusing "this is a more general framework" with "this is more valuable."

**Direct relevance to acture design:**
- **Direct warning to acture's positioning.** The journal article risks the exact failure: "command dispatch architecture that unifies palette / LLM tools / MCP / undo / macros / extensions" is the "messaging" abstraction. The README and SKILL.md need a concrete-first framing: *"Type a command name, get a working palette + AI tool definition for free"* — the Napster framing — before any unification talk.
- Mode 1: killer demo must be a single small concrete win ("5 minutes to add a command palette to your existing app"). Mode 3: a single concrete win ("your form, your CLI, and your LLM tools come from one schema").

**Quotable lines:**
- "When you go too far up, abstraction-wise, you run out of oxygen."
- "Tell me something new that I can do that I couldn't do before, O Astronauts."

---

### ref_31 — Incremental Migration: Evolving Without Breaking Production

**Core idea:** Two field reports (Nuxt→Next, Node→Go) showing the same mechanics: define boundaries, run old + new in parallel, route at the edge (nginx / API gateway), share auth + data, expand module by module, retire the old only after full replacement. Sidecar services let you migrate hot paths first.

**Direct relevance to acture design:**
- Mode 2 playbook material. The "shared npm module" pattern maps to publishing acture's command registry as a *separate* shared package that both the legacy app and the new code consume — both sides dispatch through the same registry, allowing routing-control at the dispatcher.
- "Edge routing" maps to the dispatcher: `dispatch(cmd)` can be configured to send some commands to the legacy handler and others to the new implementation — acture's analog of nginx routing, a real product feature worth exposing.

**Quotable lines:**
- "Incremental Migration is not about moving fast — it's about moving without breaking things."

---

### ref_32 — Strangler Fig Application (Fowler)

**Core idea:** Replace legacy gradually by growing new code *around* the old, moving behavior across piece by piece, and letting the old system die when nothing depends on it. Big-bang replacements usually fail because existing behavior is hard to fully specify and much of it isn't actually wanted.

**Direct relevance to acture design:**
- The flagship metaphor for mode 2. Position acture explicitly as "the strangler-fig vine for your app's actions": every new feature goes in as a command, and existing actions get migrated one at a time. The library lives *in the nook* of the existing app.
- Justifies acture's bias toward additive APIs. New features attach to commands without forcing the host app to restructure.
- Argues for first-class "co-existence" affordances: dispatcher-level toggles between "legacy handler" and "new command," visible per-command in dev tools.

**Quotable lines:**
- "Like the fig, it begins with small additions, often new features, that are built on top of, yet separate to the legacy code base."

---

### ref_33 — AI-Driven Refactoring at Qonto

**Core idea:** Qonto migrated ~1M lines of Ember→React using Claude in an aider-based CLI agent, achieving ~1,000 lines/day/engineer via 93% test coverage and a two-pass workflow (AI translation + codemod cleanup + AI refinement + human review).

**Direct relevance to acture design:**
- Most relevant to mode 2 tooling and to the agentic-skill component. The acture migration story is exactly a Qonto-style refactor — "every action becomes a command" — and the same recipe applies: tests first, AI for boilerplate (extract command, build schema), codemod for mechanical steps, AI for refinement, human reviews.
- Argues for shipping acture with an *agentic skill* (already present at `.claude/skills/`) that knows the conversion pattern, has hand-picked examples, and produces the diagnosis → plan → refactor outputs already schematized.
- Validates the existing schemas (`commandCandidates`, `diagnosisReports`, `refactoringPlans`) as exactly the modular prompt artifacts Qonto wished they'd had earlier.

---

### ref_34 — Incremental Refactoring Case Study (This Dot Labs)

**Core idea:** Refactor on three pillars in order: (1) build tests first, (2) reorganize code and enforce architectural boundaries with tooling, (3) standardize APIs. Tests come first because they're the precondition for everything else.

**Direct relevance to acture design:**
- API standardization pillar is acture's whole pitch: replace ad-hoc action handlers / API calls / button onClicks with one standardized command-dispatch interface.
- Tests-first pillar argues that acture's migration skill must produce / require tests for each command before the refactor PR is merged — auto-generate behavior tests from the command schema.
- Boundary enforcement: ship an ESLint rule that flags "bare onClick handler that mutates state without going through dispatch" once a project opts in to command-dispatch-first (mode 3). Tooling-enforced boundaries are what make this stick.

---

## Part IV — Schemas and SSOT

### ref_08 — Zod JSON Schema generation

**Core idea:** Zod v4 has built-in `z.toJSONSchema()`, converting authored Zod schemas to JSON Schema with version targeting (draft-07/2020-12/openapi-3.0), io-direction control, registry-based `$defs`, and `override` hooks. Lossy by design: `transform`, `date`, `bigint`, `set`, `map`, `custom` throw unless `unrepresentable: "any"` is set.

**Key ideas / concepts:**
- Single authoring layer (Zod) projecting to many JSON Schema dialects via `target`.
- `io: "input" | "output"` distinguishes pre-transform vs post-transform — critical when the same schema is used for forms (input) and storage (output).
- Metadata registry (`z.globalRegistry`, `.meta()`) attaches `id`, `title`, `description`, `examples`.
- `override(ctx)` lets you patch the emitted JSON Schema.

**Dos:**
- Treat Zod as acture SSOT for command parameter schemas; emit JSON Schema on demand for MCP/LLM/OpenAPI/rjsf.
- Pick `target` per consumer.
- Use `io: "input"` when generating palette/AutoForm UIs; `"output"` for state-shape contracts.

**Don'ts:**
- Don't put `z.transform`, `z.date`, `z.bigint`, `z.custom`, `z.set`, `z.map` in command param schemas — they break export. Keep params declarative; do coercion in handlers.
- Don't rely on `z.fromJSONSchema` (experimental) for round-trips.
- Don't use `additionalProperties: false` blindly — it can break optional-field LLM payloads; use `z.looseObject` for tolerant params.

**Direct relevance to acture design:**
- The single most consequential dependency: acture's "schema bridge" is essentially a thin facade over `z.toJSONSchema`. Decision: `defineCommand({ params: z.object(...) })` where `params` is constrained to the JSON-Schema-representable subset, validated via an `override` that throws on unrepresentable nodes early (at registration, not LLM call time).
- Affects all three modes; load-bearing for greenfield (mode 3): "params are simple, declarative Zod" becomes a core design constraint.

**Quotable lines:**
- "Some types have no analog and cannot be reasonably represented. ... It is unsound to attempt a conversion to JSON Schema."

---

### ref_13 — The Inner-Platform Effect (Papadimoulis)

**Core idea:** Building a system so dynamically customizable that it ends up reimplementing a worse version of the platform it sits on. The end state is that only a programmer — not the end user the dynamism was sold to — can operate it.

**Dos:**
- Keep command metadata strictly *data, not code*: `{id, title, description, params: <schema>, handler: <fn>}` — the handler is a real function, not a serialized expression.
- Push variability into well-typed extension points (handlers, middleware, schema providers), not a config DSL.

**Don'ts:**
- Don't add a "when-clause expression language" inside command metadata strings beyond a small declarative DSL.
- Don't let users author commands as JSON-only documents with code-as-strings (`"handler": "doThing(state.foo)"`).
- Don't expose a "dynamic registry editor" UI as a primary surface.

**Direct relevance to acture design:**
- The journal article (§2.2, Cons) already cites this. Concrete decision: acture's command-metadata schema is closed and small — `{id, title, description?, category?, params?, when?: fn, keybinding?, execute: fn}` — with no place for nested expression trees, command inheritance, or schema-of-schemas. Most relevant to mode 3 (greenfield), where the temptation to build a fully data-driven command system is highest.

**Quotable lines:**
- "designing a system to be so customizable that it ends becoming a poor replica of the platform it was designed with."

---

### ref_42 — json-schema-to-ts (infer TS types from JSON Schemas)

**Core idea:** A dev-dependency TypeScript library that infers static types directly from JSON Schema literals declared `as const` (or `satisfies JSONSchema`) — zero runtime impact, types live entirely in type-space. Inverse direction of Zod's flow: schema is the source, TS types are derived.

**Key ideas / concepts:**
- `FromSchema<typeof mySchema>` gives a static type matching the schema.
- The `as const satisfies JSONSchema` pattern preserves literal narrowing.
- `deserialize` option maps schema patterns (e.g. `{type:"string", format:"date-time"}`) to richer TS types.
- `ExtendedJSONSchema<CustomProps>` allows custom keywords with type inference.
- Limitations: no recursive schemas, `oneOf` validated as `anyOf`, `not` opt-in.

**Direct relevance to acture design:**
- This is the alternative authoring axis to Zod. **Decision:** acture should be *schema-library-agnostic* at its core — accept either a Zod schema OR a JSON-Schema-`as const` literal, with the same downstream pipeline. Matters most for mode 1: a team already using ajv + JSON Schema can adopt acture without rewriting their schemas. The `ExtendedJSONSchema` pattern is the principled way to add acture-specific metadata (`x-undo`, `x-telemetry`).

**Quotable lines:**
- "Stop typing twice"
- "No impact on compiled code: json-schema-to-ts only operates in type space."

---

### ref_43 — ts-json-schema-generator (vega)

**Core idea:** A build-time generator that reads TypeScript source/AST and emits JSON Schema for named types, with JSDoc-driven annotation extraction. TS is the source, JSON Schema is the artifact.

**Direct relevance to acture design:**
- A third optional authoring path alongside Zod and JSON-Schema-as-const literals. Most useful in mode 2 (full migration) where teams already have hundreds of typed handlers and don't want to re-author each as a Zod schema. Migration story becomes: "annotate your existing `interface FormatDocumentParams` with JSDoc, run `acture generate`, get MCP/LLM tool defs for free." The acture command registry should accept `{ paramsSchema: JSONSchema7 }` as a first-class alternative to `{ params: ZodSchema }`.

---

### ref_44 — typescript-json-schema (YousefED)

**Core idea:** The older, in-maintenance-mode predecessor to ts-json-schema-generator. Same goal, different internal mechanism. Effectively superseded by ref_43; both share the JSDoc annotation vocabulary (`@minimum`, `@format`).

**Direct relevance to acture design:**
- Thin; mostly relevant for migration docs (mode 2) — mention as the deprecated path. The substantive carryover is the JSDoc vocabulary that both tools share.

---

### ref_45 — The Schema Language Question (Holland)

**Core idea:** A 60-page argument that schema languages exist to solve *model drift* across polyglot systems, and that Pydantic/Zod-as-source-of-truth is an antipattern: language-specific validators should be *consumers* of a portable schema, not its origin. Big Three: Protobuf (RPC), Avro (event streams), JSON Schema (web APIs + AI/LLMs); JSON Schema is the de facto IDL for AI tool calling.

**Key ideas / concepts:**
- Model drift is silent corruption, not loud crashes.
- Pydantic/Zod as authoring layer = fine; as cross-language SSOT = the "Validator Trap."
- JSON Schema's killer late-life feature: every LLM tool-calling API uses it.
- JSON Schema's expressiveness (`if/then/else`, `pattern`) is a *weakness* for codegen — most validators can't be mechanically translated.
- JTD (RFC 8927) is the trade-off: less expressive, unambiguously code-generatable.
- "If you're not sure whether you need binary performance, you don't need binary performance."

**Dos:**
- Be explicit: acture uses JSON Schema as the wire/interchange format because every LLM and MCP already does.
- Treat Zod as the *authoring* layer and *runtime validator*, but export to JSON Schema for every cross-process consumer.
- For acture commands spanning processes, keep the JSON Schema artifact checked in / served, not regenerated at consumer-time — analog of a schema registry.
- Consider a `acture compare-schemas` CLI that diffs two snapshots and flags breaking changes — analog of `buf breaking`.

**Don'ts:**
- Don't tell users "your Zod schema *is* the contract" across language boundaries.
- Don't use JSON Schema's full conditional-validation expressiveness in command params if you want forms or LLM tool defs.
- Don't pick Protobuf/Avro for acture's wire format just because they're faster — LLM latency dominates.

**Direct relevance to acture design:**
- Confirms the core architectural bet: acture's "schema bridge" should converge on **JSON Schema as the interchange and authoring-target**, with Zod (or TS, or JSON-as-const) as the *authoring layer*. Affects all modes; most acutely 2 and 3, where acture commands become the de facto API surface to AI agents and need to remain stable across versions.

**Quotable lines:**
- "Pydantic is best understood as a *consumer* of schemas, not a *source* of schemas." (Substitute Zod.)
- "JSON Schema has become the interface definition language for AI."

---

### ref_48 — AutoForm

**Core idea:** A React library that takes a Zod schema (via `ZodProvider`) and renders a working form against multiple UI kits (shadcn, MUI, Mantine). Author is explicit about scope: drop-in for internal/low-priority forms, not a replacement for Formik/RHF for complex flows.

**Direct relevance to acture design:**
- This *is* acture's command-palette-parameter-collector UX, packaged. acture should either depend on AutoForm or replicate its provider+UI-kit pattern. Most relevant to mode 1 (drop-in palette into an existing app) where the host already has a shadcn/MUI stack. The provider pattern (`new ZodProvider(schema)`) is the right shape for acture's `paramCollector(schema)` API.

---

### ref_49 — react-jsonschema-form (rjsf)

**Core idea:** Long-running, JSON-Schema-native React form library: feed it a JSON Schema (+ optional uiSchema), get a form. Theme adapters for ~10 UI kits. Separate `@rjsf/validator-ajv8` for validation. Separation of `schema` (validation/structure) from `uiSchema` (presentation hints).

**Direct relevance to acture design:**
- The natural pairing for the JSON-Schema-first authoring path (ref_42, ref_43). **Decision:** acture's `paramCollector` should support **two adapters**: AutoForm (Zod-native) and rjsf (JSON-Schema-native), selected by schema source. The `schema` + `uiSchema` split is also worth adopting in acture's command metadata: command params (machine-readable JSON Schema) vs. UI hints (`uiSchema`-like). Keep them separate so AI consumers ignore uiSchema cleanly.

---

## Part V — Testing, Undo, and Command Semantics

### ref_09 — Command Pattern, Event Sourcing, and Redux (Elliott)

**Core idea:** Command pattern, event sourcing, and Redux are distinct architectures that share one purpose: transactional state management. Redux's key contribution was using *pure reducers over serializable action objects* — decoupling the action message from any target object/method, which makes log replay reproducible.

**Direct relevance to acture design:**
- Validates acture's "command-as-data" core. The schema-driven command record (id + params validated by Zod) IS the action-object-as-data principle. The handler/effect split should keep the *registration* layer pure-data and push side effects into an effects subsystem so command logs replay cleanly. Most affects mode 3 (greenfield); also informs mode 2's strangler-fig migration target.

**Quotable lines:**
- "There is nothing new under the sun, but also, you can never step twice into the same river."

---

### ref_21 — Generated Tests with XState + Cypress (Deschryver)

**Core idea:** A state machine that models the app can drive *auto-generated* test plans: the test runner walks every reachable state via shortest paths, asserts a per-state invariant, and reports coverage. Test bodies become two small maps — `state → assertion` and `event → interaction`.

**Direct relevance to acture design:**
- The acture command registry IS an event vocabulary. If acture emits a graph (commands × preconditions × resulting states), it can plug into model-based test generators — `command → UI interaction` is exactly the `withEvents` shape. Suggests a `acture/testing` adapter exposing `eachCommand({assert, exec})` for autogenerated palette/shortcut/MCP test runs. Most affects mode 3 and serves as a marketing wedge ("free tests from your command registry").

---

### ref_22 — Cucumber Step Definitions

**Core idea:** Cucumber binds natural-language Gherkin steps to executable functions via expression-matching, with typed parameter capture (`{int}` → integer). Each step is a pure function over its extracted parameters.

**Direct relevance to acture design:**
- Direct analog for the parameterized command palette layer. When a user types `set theme dark`, acture needs Cucumber-style expression matching: a registry of parameter types (each with regex + parser + type tag) that converts user text into typed `params` before dispatch. Suggests exposing a `defineParamType({name, regex, parse, schema})` API. Most affects mode 1.

---

### ref_23 — fast-check: Property-Based Testing for TS

**Core idea:** fast-check brings QuickCheck-style property testing to TS with strong typing, shrinking, and model-based testing of state machines. Key superpowers for command-shaped systems: model-based testing and async race-condition detection.

**Direct relevance to acture design:**
- Each Zod-schema'd command param is convertible to a fast-check arbitrary. acture can ship `acture/testing/property`: given the registry, auto-derive a model-based test that fuzzes arbitrary command sequences against user-supplied invariants ("undo+redo is identity," "state is JSON-serializable"). Strong wedge for mode 2 — property tests catch regressions as legacy paths port into commands.

---

### ref_24 — Command-Based Undo for JS Apps (Bee)

**Core idea:** A practical, opinionated walkthrough of command-pattern undo vs. memento undo. Once you commit to commands, "undo" stops being a feature and becomes the architecture — and the hard parts are immediacy (optimistic apply), side effects, backend sync, and the redo-after-edit problem (GURQ).

**Key ideas / concepts:**
- Memento = snapshots, Command = action+inverse; choose per app.
- Immer `produceWithPatches` lets commands stay terse while still producing inverse patches.
- Transactions wrap `{command, payload}`; the log holds transactions, not raw commands.
- Undo must be *immediate* — anything that can't apply optimistically doesn't belong in the stack.
- Side effects belong in a queued sink, not inline in `undo`.
- GURQ: replay the redo stack twice (forward+inverse) to preserve linear history after an edit.

**Dos:**
- Model the log entry as a transaction `{command, params, payload, inversePatches}`.
- Decouple `apply-locally` from `sync-to-backend` — one syncQueue, one undoStack.
- Use patches (Immer) so commands describe *intent*, not full state.
- Surface side effects as data the dispatcher executes, not imperative calls inside `undo`.

**Don'ts:**
- Don't put network calls on the hot path of undo.
- Don't pre-compute the redo upfront if you're multiplayer.
- Don't mix data-mutation strategies per command without a unified handler contract.

**Direct relevance to acture design:**
- The most directly load-bearing reference for the undo subsystem. acture's command record should standardize: `params` (Zod), `exec(params, ctx) → {patches, payload, effects}`, optional `undo(entry, ctx)`, optional `redo(entry, ctx)`, separate `syncToBackend(entry)`. Effects should be returned as values, not invoked. The transaction-vs-command distinction must be explicit. Most affects mode 3; also defines what mode 1 users opt into when enabling undo.

**Quotable lines:**
- "Anything that goes into your undo or redo stacks should be able to be applied immediately."
- "Undo stops being a feature and starts becoming part of your architecture."

---

### ref_41 — CQRS (Fowler)

**Core idea:** CQRS splits the conceptual model into separate Command (write) and Query (read) models — different objects, often different processes/databases. Fowler is explicit: it is a *risky* pattern, justified only in specific Bounded Contexts; applying it system-wide is usually a mistake.

**Direct relevance to acture design:**
- acture is by construction a *Command* layer; CQRS reminds us not to leak read-side concerns into commands. The registry API should NOT grow query primitives — keep queries to selectors/hooks (zustand) and let commands stay write-intent. Informs the three-mode story: **mode 1** is a Command surface bolted onto a CRUD app (fine — no CQRS needed); **mode 3** is where the read/write split becomes a deliberate choice. The doc should explicitly say "acture is the C, not the CQ."

**Quotable lines:**
- "You should be very cautious about using CQRS."

---

## Part VI — Palette UX and Keybindings

### ref_17 — Command Palette UX Patterns (Suska)

**Core idea:** High-level UX taxonomy of the command palette pattern: a searchable popup of commands invoked by a shortcut, decomposed into four parts (trigger, search box, command list, feedback).

**Dos:**
- Show keybinding next to each command (free affordance for discoverability).
- Sort by recency by default; group when sets are large.
- Give an explicit "command executed" feedback path.
- Surface a visible UI trigger in addition to the shortcut.

**Don'ts:**
- Don't dump a flat unranked list of every command.
- Don't rely on "palette closed" as the only success signal.

**Direct relevance to acture design:**
- "Marketing brochure" lens — useful for README/landing rather than API. Informs that `CommandRecord` must expose `keybinding`, `category/group`, and a `recency` signal so the default palette renderer does these without app-author effort. Most relevant to mode 1: out-of-the-box defaults should already deliver recency, groups, and shortcut display.

---

### ref_18 — cmdk: Command Menu for React

**Core idea:** Paco Coursey's `cmdk` is the de-facto unstyled, composable React combobox/palette. It exposes a `Command.*` slot API where each part forwards refs/props and items auto-filter/sort by value+keywords; the host owns rendering, hotkeys, and async loading.

**Key ideas / concepts:**
- Composable slot components with `data-cmdk-*` attrs for unstyled theming.
- `value`+`keywords` per item with pluggable `filter(value, search, keywords) -> rank`.
- `shouldFilter={false}` escape hatch.
- "Pages" pattern: nested commands via host-managed page stack; Backspace at empty input pops the page.
- `useCommandState` exposes the internal store via `useSyncExternalStore`.
- Explicitly *does not* bind the hotkey — host owns keybinding context.
- No virtualization; React 18 only; client-only.

**Direct relevance to acture design:**
- The composable slot API is the right shape for acture's default UI surface. Critical for mode 1: drop-in `<CommandPalette/>` that internally uses cmdk (or a cmdk-shaped equivalent) and consumes the acture registry. For mode 3, advanced authors can swap to the slot form and use `useMatches` against acture's store directly. Strongly suggests acture should *not* re-implement combobox semantics — wrap cmdk or expose the same API surface.

**Quotable lines:**
- "Listen for ⌘K automatically? No, do it yourself to have full control over keybind context."

---

### ref_19 — kbar: Command Palette for React

**Core idea:** Higher-level, action-config-driven palette: you pass an `actions` array (id, name, shortcut, keywords, perform, parent) to `KBarProvider` and it owns search, hotkeys, nesting, and history. More opinionated about the data model than cmdk; less opinionated about UI.

**Direct relevance to acture design:**
- kbar is acture's closest existing-art neighbor and the strongest argument for the project's existence: kbar nailed the Action data model but stopped at the React palette. acture extends the same record into LLM tools, MCP, keybindings, and tests. Action schema convergence is validation that acture's `CommandRecord` is on the right track. Avoid kbar's React-context coupling: the acture registry must be reachable from non-React contexts (LLM tool-use, MCP server, tests).

---

### ref_20 — tinykeys: Tiny Keybinding Library

**Core idea:** A ~650 byte cross-platform keybinding library with a string DSL: `"$mod+K"`, `"g i"` (sequences), `"$mod+([0-9])"` (regex groups). `$mod` picks Meta on macOS and Control elsewhere. Separation of parse+handler from attachment.

**Key ideas / concepts:**
- String-DSL keybindings — declarative, ergonomic, serializable.
- Key sequences (`"g i"`) with 1000ms inter-press timeout.
- Regex groups for argument capture (`"$mod+([0-9])"`).
- Explicit `KeyboardEvent.key` vs `KeyboardEvent.code` distinction.

**Direct relevance to acture design:**
- acture should adopt tinykeys directly (or its DSL verbatim) as the keybinding substrate. `CommandRecord.keybinding: string | string[]` parseable by tinykeys; the registry wires them via `createKeybindingsHandler` so contexts (modal open, editor focused) can scope them. Most relevant to mode 1 (drop-in) and mode 3 (clean keybinding-as-data). The regex-group syntax is interesting for parameterized commands.

**Quotable lines:**
- "Setting this value too low (i.e. `300`) will be too fast for many of your users."

---

### ref_47 — Raycast Extension API: Arguments

**Core idea:** Raycast extends "command" to "command + arguments collected in Root Search before the command launches." Each command declares up to 3 typed arguments (`text`, `password`, `dropdown`) in its manifest, with `required`, `placeholder`, ordering, and (for dropdowns) data options.

**Direct relevance to acture design:**
- Direct validation of acture's parameterized-command-palette guide. The "declare args in schema, get typed `arguments` object" loop is exactly what acture's Zod-schema-driven command record should yield — but acture gets it *for free across all dispatch surfaces* (palette, hotkey, LLM, MCP), which Raycast does not. Most relevant to mode 3 (argument-first commands as the design unit) and to mode 1 via the existing `param-collector`.
- Important divergence: Raycast caps at 3 args — don't follow this; instead let the *renderer* show only the first N inline and the rest in an expanded form.

---

### ref_50 — Designing Command Palettes (Solomon)

**Core idea:** A designer's framing of palettes as primarily *action* surfaces (not search), with three core design axes: the keyboard-shortcut starting point, the *handoff* boundary between palette and traditional UI, and *context awareness* as the source of "superpowers."

**Direct relevance to acture design:**
- The handoff distinction maps directly to acture's `execute` signature: commands can resolve synchronously, *or* return a continuation (open a UI). acture should make this a first-class field (e.g. `kind: "atomic" | "hands-off"`). The context-injection point validates `execute(args, ctx)` — `ctx` should expose selection/route/active-record contributed by *context providers* registered alongside commands. Most relevant to mode 2: per-command, decide whether to pull workflow into the palette or hand off.

**Quotable lines:**
- "Command palettes aren't just for finding things — they are for doing things."
- "Global commands are a start, but knowing what the user will want to do in a given situation is where the super powers will come from."

---

### ref_51 — How to Build a Remarkable Command Palette (Boucher / Superhuman)

**Core idea:** Five rules from Superhuman's Cmd+K team: be available everywhere, be central (one palette for everything), be omnipotent (every action is a command), be flexible (fuzzy match + aliases + ranking), and be contextually relevant. The deepest content is on ranking: default scores, scales (multipliers), explicit `follow` ordering between command IDs, and aliases displayed as "Title (matching alias)".

**Key ideas / concepts:**
- Single shortcut, same everywhere; same shortcut also dismisses.
- "Decouple execution from UI" — acture's entire thesis, stated plainly.
- Re-press behavior when shortcut is taken in a context: first press = local action, second = palette.
- Fuzzy match via `command-score`.
- Aliases (synonyms) per command; display as `"Mark Done (Archive)"` when matched via alias.
- Ranking levers: per-command `defaultScore` (score 0 = hide until typed), `scale` multiplier, explicit `follow: [otherId]`.
- Context-conditional scoring: scale and defaultScore as functions of app context.

**Dos:**
- Adopt `defaultScore`, `scale`, `follow` as `CommandRecord` fields.
- First-class `aliases` field (cmdk's `keywords` and kbar agree).
- Display the matching alias parenthetically.
- Allow `scale: number | (ctx) => number` so context modulates ranking.
- Make shortcut toggle (open/close) the default.

**Don'ts:**
- Don't expose only equality filtering — fuzzy + aliases is the floor.
- Don't make `hide command` a different mechanism than `score=0` — keep the model unified.
- Don't bind the palette inside a single React tree.
- Don't ship without a sensible default ranking; "alphabetical" is hostile.

**Direct relevance to acture design:**
- The single most actionable reference for acture's `CommandRecord` shape and the registry's ranking pipeline. Concretely: include `aliases: string[]`, `defaultScore?: number | (ctx) => number`, `scale?: number | (ctx) => number`, `follow?: CommandId[]`. Expose a `score(command, query, ctx)` function that's overridable. Affects all three modes; the ranking story is the differentiator for mode 1: drop in acture and the palette feels like Superhuman's, not like an unranked filter.

**Quotable lines:**
- "Over time, it should become a reflex for product owners and engineers to see any action as a UI element, a keyboard shortcut, and a command."
- "Ensure you decouple execution of commands from the UI presented."
- "Architect your code so that you can add commands from any part of your codebase."
