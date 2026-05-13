# Deep Research Prompts — Acture Architecture

**Purpose:** Standalone research prompts to refine the design of `acture` (formerly `wrapex` / `command-wrapex`) — a TypeScript/React library providing a command-dispatch architecture for frontends.

Each prompt is **fully self-contained** — designed to be copy-pasted into a fresh Claude.ai conversation. Each prompt includes its own context block so the receiving conversation does not need access to the rest of this repository — only to the specific reference files listed in its **Project knowledge files** section.

---

## How to use these prompts

1. **Order matters for some.** See the [Recommended order](#recommended-order) section at the bottom. Prompt 1 is already launched. Run the others in the suggested sequence so later prompts can build on earlier findings.
2. **Project knowledge files.** Each prompt lists the exact file names you should add to that conversation's project knowledge. The file names match those in the directory [`command_dispatch_journal_article -- fetched/`](command_dispatch_journal_article%20--%20fetched/) and the top-level docs.
3. **File references inside the prompt.** When a prompt says `ref_NN`, it refers to a file whose name *contains* that prefix (e.g., `ref_50` refers to the file in your project knowledge starting with `ref_50_`). The prompt makes this explicit each time.
4. **Output.** Each prompt asks for a written report. Save the report alongside this file (e.g., `research_findings_prompt_2.md`) so a finalizing agent can read all findings together when modifying [`v1_plan.md`](v1_plan.md).

---

## Prompt 1 — Convergent-evidence audit *(already launched)*

*Status: launched in a separate conversation. Not reproduced here.*

The report from this prompt should be saved as `research_findings_prompt_1.md` in the [`docs/`](.) directory. Later prompts (especially Prompt 2) reference its conclusions about command-record shape.

---

## Prompt 2 — Parameterized command palette UX (across shipped products)

```
=== CONTEXT ===

I'm designing acture, a TypeScript/React library that provides a command-dispatch architecture for frontend applications: a typed, schema-driven command registry that powers a command palette, keyboard shortcuts, AI tool use (LLM function calling), MCP servers, automated tests, and undo/redo from a single source of truth.

One of acture's most opinionated features will be how it handles PARAMETERIZED commands in the command palette — commands that need arguments (e.g., "applyFilter({column, operator, value})") rather than parameter-free commands (e.g., "zoomToFit").

The architecture brief is in the file 'command_dispatch_journal_article.md' (the central paper). Section 3.1 ("Command Palette and Keyboard Shortcuts") and the deeper doc 'parameterized_command_palette_guide.md' describe my current thinking. The relevant references in your project knowledge include:

- 'ref_46_vs-code-quickinput-api-sample.md' — VS Code's QuickInput multi-step pattern.
- 'ref_47_raycast-extension-api-arguments.md' — Raycast caps args at 3, declared in manifest.
- 'ref_50_s-solomon-designing-command-palettes-solomon-io-2024.md' — designer framing of the "handoff" boundary.
- 'ref_51_t-boucher-how-to-build-a-remarkable-command-palette-superhuman-engineering-blog.md' — Superhuman's ranking, aliases, contextual scoring.
- 'ref_17_a-suska-command-palette-ux-patterns-medium-design-bootcamp-2023.md' — high-level UX taxonomy.

When this brief says "ref_NN", I mean the file in your project knowledge whose name starts with that prefix.

=== THE QUESTION ===

What is the QUALITATIVE UX experience of typing a parameterized command in real shipped products? When does it feel good vs. clunky? My references cover the implementation patterns but not how users actually experience them.

Specifically:

1. Survey 8-12 shipped command palettes that handle parameterized commands. Include at least: Raycast, Linear, Superhuman, Slack, Notion, Arc, Things, Cron/Notion Calendar, GitHub's command palette, Figma's quick actions, Obsidian, and any others you find with strong opinions on this.

2. For each, classify the parameterized-command UX along these axes:
   - Inline-typed-args (args parsed from one input string, like Spotlight)
   - Multi-step picker (palette transitions through screens, like VS Code QuickInput)
   - Modal hand-off (palette closes, opens a separate UI for the args)
   - Type-then-tab (user types command, hits Tab/Enter, then fills args inline)
   - Autocomplete-driven (args are typeahead-suggested from current context)
   - Schema-rendered form (args rendered as a small form within the palette)

3. Identify the patterns users LOVE (with references — blog posts, Reddit threads, Product Hunt comments, YouTube workflow videos) and the patterns users HATE.

4. Are there documented failure modes? Commands users abandon because the param flow is too painful? Cases where teams shipped a parameterized command and reverted it?

5. What is the empirical upper bound on parameter count before users give up using the palette and prefer a dedicated UI? Raycast caps at 3 — is that a UX limit or an implementation limit? Where does the cliff actually fall?

6. Surprising findings: anything that contradicts the obvious assumption? (E.g., maybe users prefer the modal-handoff over inline collection in some context.)

=== WHAT I NEED ===

A written report (2000-4000 words) with:

- A table mapping product → UX classification → params upper bound observed → notable design choice.
- 3-5 LOVE patterns with citations.
- 3-5 HATE patterns with citations.
- An opinionated recommendation: what should acture's DEFAULT behavior be for commands with 1 / 2 / 3 / 4+ parameters?
- A list of references with URLs.

This report will inform whether acture's command record should carry a "kind: atomic | handoff" field, what the default param-collector UI should do, and where the parameter-count cliff falls in practice.

Save the report as 'research_findings_prompt_2.md'.
```

**Decision it unblocks:** Default behavior of acture's param-collector; the `kind: "atomic" | "handoff"` field on the command record; defaults for N=1, 2, 3, 4+ parameter commands.

**Project knowledge files to add:**
- `command_dispatch_journal_article.md`
- `parameterized_command_palette_guide.md`
- `ref_17_a-suska-command-palette-ux-patterns-medium-design-bootcamp-2023.md`
- `ref_46_vs-code-quickinput-api-sample.md`
- `ref_47_raycast-extension-api-arguments.md`
- `ref_50_s-solomon-designing-command-palettes-solomon-io-2024.md`
- `ref_51_t-boucher-how-to-build-a-remarkable-command-palette-superhuman-engineering-blog.md`

---

## Prompt 3 — State-management substrate trade-offs

```
=== CONTEXT ===

I'm designing acture, a TypeScript/React library that provides a command-dispatch architecture for frontend applications. The architecture has three primitives: a state model, a command registry, and a schema bridge that connects them to external consumers (command palette, AI tool calling, MCP, tests).

The architecture brief is the file 'command_dispatch_journal_article.md' (the central paper). Section 2.1 describes the state model. Section 3 describes the consumer surfaces (palette, AI, MCP, tests, undo/redo, telemetry, macros, extensions). The relevant references in your project knowledge include:

- 'ref_09_e-elliott-the-command-pattern-event-sourcing-and-redux-are-all-different-architectures-medium-2019.md' — why pure-reducer-over-data is the load-bearing decision.
- 'ref_24_n-p-bee-command-based-undo-for-js-apps-2023.md' — strongly assumes Immer-style patches for undo.
- 'ref_41_m-fowler-cqrs-martinfowler-com-2011.md' — CQRS is risky outside specific bounded contexts.
- 'ref_19_kbar-command-palette-for-react.md' — kbar uses React-context-coupled state; we want to avoid that coupling.

When this brief says "ref_NN", I mean the file in your project knowledge whose name starts with that prefix.

=== KEY DECISION CONTEXT ===

The user wants acture to remain AGNOSTIC about which state-management library is used. The intent is that when an AI coding agent (Claude Code) installs acture in a user's codebase, the agent picks the state library based on what the user is already using (or what they want to use), and wires up the adapter.

But: the architecture has constraints that the state library must satisfy. Specifically:
- An eventual undo subsystem (post-v1) will need Immer-style patches.
- The registry needs 'commandsChanged'-style observables.
- AI tool definitions need typed state slices.
- Tests need JSON-serializable state snapshots for replay.

So the question is NOT "which library is best" but "what is the minimum interface acture must require, such that multiple state libraries can implement it cleanly?"

=== THE QUESTION ===

1. For each of these state-management libraries: zustand, Redux Toolkit, Jotai, MobX, Valtio, Effector, XState — produce a concrete assessment along these axes:
   - (a) How easily does it produce Immer-style patches per mutation? (For future undo.)
   - (b) How easily does it expose typed slices that an AI tool description can reference? (For LLM function calling.)
   - (c) Does it have a native subscribe/observable API suitable for 'commandsChanged' broadcasts?
   - (d) Are mutations JSON-serializable for replay/test-debugging?
   - (e) How heavily does it dictate component structure or boilerplate?

2. Define the MINIMUM INTERFACE acture should require. Concretely: what TypeScript interface must each state-library adapter implement? Strong default to evaluate: `{ getState(): S; setState(updater): void; subscribe(listener): Unsubscribe }`. Is that sufficient? Too thin? Too thick?

3. Which 1-2 libraries should ship with example adapter packages (e.g., 'acture/state-zustand', 'acture/state-redux'), and which should be left for users to implement?

4. Are there real-world OSS apps using command-dispatch patterns with each of these libraries? (Look for kbar adopters, VS Code-style command systems in the wild.) What did they regret?

5. The user's caveat: "agnostic if possible." Is there a case where opinionation pays off enough to overrule this? (E.g., if 9 out of 10 greenfield apps would benefit from a default, maybe ship one.)

=== WHAT I NEED ===

A written report (2000-4000 words) with:

- A comparison table: library × (patches, typed slices, observables, serializability, boilerplate).
- A proposed minimum-interface TypeScript signature with rationale.
- An ordered recommendation: which adapters to ship in v1, which to defer, which to leave to users.
- 3-5 case studies of real OSS apps using each library with command-dispatch (or close to it).
- A list of references with URLs.

Save the report as 'research_findings_prompt_3.md'.
```

**Decision it unblocks:** The state-adapter interface in `acture/core`; which `acture/state-*` packages ship in Phase 1 vs. Phase 2.

**Project knowledge files to add:**
- `command_dispatch_journal_article.md`
- `ref_09_e-elliott-the-command-pattern-event-sourcing-and-redux-are-all-different-architectures-medium-2019.md`
- `ref_19_kbar-command-palette-for-react.md`
- `ref_24_n-p-bee-command-based-undo-for-js-apps-2023.md`
- `ref_41_m-fowler-cqrs-martinfowler-com-2011.md`

---

## Prompt 4 — Migration tooling: transitional API + codemods (packed)

```
=== CONTEXT ===

I'm designing acture, a TypeScript/React library that provides a command-dispatch architecture. One of acture's three positioning paths is "strangler-fig migration" — incrementally adopting command dispatch in an existing codebase without a big-bang rewrite.

The architecture brief is the file 'command_dispatch_journal_article.md'. Section 7 describes the strangler-fig migration strategy. The relevant references in your project knowledge include:

- 'ref_07_i-cartwright-r-horn-and-j-lewis-patterns-of-legacy-displacement-martinfowler.md' — full taxonomy of legacy displacement patterns: Event Interception, Branch by Abstraction, divert-the-flow, Legacy Mimic.
- 'ref_31_n-barsalari-incremental-migration-evolving-without-breaking-production-medium-2025.md' — field reports of incremental migrations (edge routing, sidecar pattern).
- 'ref_32_m-fowler-strangler-fig-application-martinfowler-com-2004-updated-2024.md' — the canonical strangler-fig essay.
- 'ref_33_ai-driven-refactoring-in-large-scale-migrations-qonto-medium-2025.md' — Qonto's two-pass AI + codemod workflow that migrated 1M lines.
- 'ref_34_incremental-refactoring-case-study-this-dot-labs.md' — three-pillar approach: tests first, code organization, API standardization.

When this brief says "ref_NN", I mean the file in your project knowledge whose name starts with that prefix.

=== KEY DECISION CONTEXT ===

The user has specified that acture's migration package is meant to be used by Claude Code (AI coding agent) when assembling a command-dispatch architecture in a user's existing codebase. The package provides defaults, but the agent adapts them to the user's actual stack.

Two related sub-questions therefore matter:
(A) What concrete TypeScript API surface should 'acture/migration' expose? (E.g., 'wrapMutation', 'divertHandler', event-interception middleware.)
(B) What codemod / AST-transformation tooling should accompany it, so the agent can mechanically extract commands from existing code?

The currently sketched API:
- 'wrapMutation(legacyHandler, spec)' — wraps an existing function as a command without changing its internals.
- 'divertHandler(commandId, { legacy, modern, predicate })' — per-command routing between old and new implementations (analog of nginx edge routing for backend migrations).
- Event-interception middleware: lets DOM/store events transparently become command dispatches.

=== THE QUESTION ===

**Part A — Transitional API shape:**

1. Find existing OSS libraries that codify Event Interception, Branch by Abstraction, divert-the-flow, or Legacy Mimic as TypeScript APIs. Candidates to investigate: nestjs-strangler, strangler-fig npm packages, Backstage / Spotify's plugin migration tooling, LaunchDarkly's progressive rollout libraries, NX migration tooling.

2. For each library found: what does the USER CODE look like before and after adopting the pattern? Show concrete snippets.

3. Are there libraries that specifically wrap mutation handlers (not just routes or services) for migration? This is the closer analog to acture's use case — we're not migrating HTTP routes, we're migrating onClick handlers and store actions.

4. How do these libraries handle GRADUATION — removing the transitional code once migration is complete? Is graduation typically a manual cleanup, a tool-assisted refactor, or built into the library itself?

5. Critique the currently-sketched API ('wrapMutation', 'divertHandler', event-interception). Is the shape right? What's missing? What's over-engineered?

**Part B — Codemod tooling:**

6. For each of these codemod libraries — jscodeshift, ts-morph, ast-grep, semgrep — evaluate how well-suited each is to the transformation: "extract this onClick / store-action / mutation handler into a registered acture command." What are the concrete strengths and weaknesses for this specific use case?

7. Find existing OSS codemods for SIMILAR transformations (e.g., extracting Redux actions, lifting state to a store, converting class components to hooks). What patterns generalize to acture's needs?

8. Qonto's two-pass workflow (AI translation → codemod cleanup → AI refinement → human review, per the Qonto reference) achieved ~1000 lines/day/engineer. Does this workflow work at smaller scale (100-line PRs), or does the overhead dominate? Are there scale thresholds where AI-only or codemod-only beats the combined workflow?

9. What should an 'acture/codemods' package contain? Is it a v1 deliverable or a v1.1 follow-up?

=== WHAT I NEED ===

A written report (3000-5000 words, two-part) with:

Part A (transitional API):
- A table of OSS libraries surveyed, with before/after code snippets.
- An opinionated recommendation: what should 'acture/migration' export in v1? What signatures? What defaults?
- An assessment of the sketched API: keep / modify / drop each of 'wrapMutation', 'divertHandler', event-interception middleware.

Part B (codemods):
- A comparison of jscodeshift / ts-morph / ast-grep / semgrep for this use case.
- 3-5 reference codemods (with links) that perform similar transformations.
- A scope recommendation for 'acture/codemods': v1 / v1.1 / never.
- A sketch of how Claude Code would invoke these codemods inside the agent migration workflow.

A list of references with URLs.

Save the report as 'research_findings_prompt_4.md'.
```

**Decision it unblocks:** Concrete shape of `acture/migration`; whether `acture/codemods` ships in v1 or v1.1; how the migration-track skills invoke transformation tooling.

**Project knowledge files to add:**
- `command_dispatch_journal_article.md`
- `ref_07_i-cartwright-r-horn-and-j-lewis-patterns-of-legacy-displacement-martinfowler.md`
- `ref_31_n-barsalari-incremental-migration-evolving-without-breaking-production-medium-2025.md`
- `ref_32_m-fowler-strangler-fig-application-martinfowler-com-2004-updated-2024.md`
- `ref_33_ai-driven-refactoring-in-large-scale-migrations-qonto-medium-2025.md`
- `ref_34_incremental-refactoring-case-study-this-dot-labs.md`

---

## Prompt 5 — Schema versioning and breaking-change tooling for AI / MCP

```
=== CONTEXT ===

I'm designing acture, a TypeScript/React library that provides a command-dispatch architecture. Commands are defined once and projected through a "schema bridge" to multiple consumer surfaces: command palette parameter forms, LLM tool-call JSON, MCP tool definitions, OpenAPI clients, and test fixtures.

The architecture brief is the file 'command_dispatch_journal_article.md'. Section 2.3 describes the schema bridge; Section 5 ("The SSOT Imperative") argues that schema stability is critical when schemas cross process or language boundaries. The relevant references in your project knowledge include:

- 'ref_05_model-context-protocol-tools-concept.md' — MCP defines tools as {name, description, inputSchema}.
- 'ref_08_zod-json-schema-generation.md' — Zod's z.toJSONSchema() and what's lossy.
- 'ref_26_vs-code-proposed-api-lifecycle.md' — VS Code's stable / proposed API tier system.
- 'ref_45_c-holland-the-schema-language-question-avro-json-schema-protobuf-and-the-quest.md' — 60-page argument that JSON Schema is the IDL for AI tool calling; emphasizes versioning.

When this brief says "ref_NN", I mean the file in your project knowledge whose name starts with that prefix.

=== THE QUESTION ===

If acture's commands become the API surface to deployed LLM agents and MCP clients, schema stability is a real production concern. A model prompted (or fine-tuned) against tool schemas at version N must keep working at N+1.

1. How do production MCP server operators handle breaking schema changes today? Survey the MCP GitHub spec discussions, the MCP TypeScript SDK issues, and any blog posts on operating MCP servers in production.

2. Are there established patterns for tool-definition versioning? Examples to evaluate:
   - Per-tool semver (each command has its own version field).
   - Deprecation warnings in the tool description (model reads "deprecated, use X instead").
   - Dual-publishing old + new tools side-by-side during a transition.
   - Stable / proposed / experimental tier system (like VS Code's per-feature opt-in).

3. What does 'buf breaking' do for Protobuf (the canonical "schema-language breaking-change linter"), and what's the JSON Schema equivalent? Survey:
   - json-schema-diff and similar npm packages.
   - openapi-diff and how OpenAPI-driven teams handle breaking changes.
   - Any "MCP-diff" or analogous tools that exist today.

4. How do model providers (Anthropic, OpenAI, Google) themselves handle tool-schema changes in their own SDKs and docs? Are there public commitments to stability? Documented best practices?

5. The specific decision: should acture v1 ship a 'acture compare-schemas' CLI that diffs two snapshots of a registry's emitted JSON Schemas and flags breaking changes? Or defer until users ask?

6. The tier system: what does it look like in practice? Concretely:
   - A command tagged 'experimental' — does it appear in the MCP tools/list? Only with an opt-in flag?
   - A command tagged 'deprecated' — what does the LLM see? When does it disappear?
   - How does a command graduate from experimental to stable?

=== WHAT I NEED ===

A written report (2000-4000 words) with:

- A survey of existing MCP / LLM-tool versioning practice (or absence thereof) in production.
- A comparison of 'buf breaking' and the JSON Schema equivalents.
- A concrete recommendation: should 'acture compare-schemas' ship in v1? With what scope?
- A concrete recommendation: what does acture's stable / experimental / internal tier system look like, in terms of runtime behavior and developer API?
- A list of references with URLs.

Save the report as 'research_findings_prompt_5.md'.
```

**Decision it unblocks:** Whether `acture compare-schemas` ships in v1; design of the `@stable`/`@experimental`/`@internal` tier system for commands.

**Project knowledge files to add:**
- `command_dispatch_journal_article.md`
- `ref_05_model-context-protocol-tools-concept.md`
- `ref_08_zod-json-schema-generation.md`
- `ref_26_vs-code-proposed-api-lifecycle.md`
- `ref_45_c-holland-the-schema-language-question-avro-json-schema-protobuf-and-the-quest.md`

---

## Prompt 6 — Cross-language story (TypeScript ↔ Python)

```
=== CONTEXT ===

I'm designing acture, a TypeScript/React library that provides a command-dispatch architecture for frontends. One claimed benefit of the architecture is "cross-language bindings" — for example, a Python wrapper for a TypeScript application, validated against the same schema, with drift caught in CI.

The user has a large local Python ecosystem (~200 packages) and may want to expose acture command registries to Python clients, or invoke Python-implemented commands from a TypeScript frontend.

The architecture brief is the file 'command_dispatch_journal_article.md'. Section 2.1 mentions cross-language bindings; Section 3.3 describes MCP server integration. The relevant references in your project knowledge include:

- 'ref_05_model-context-protocol-tools-concept.md' — MCP as the cross-process tool protocol.
- 'ref_14_mcp-typescript-sdk.md' — MCP TypeScript SDK structure.
- 'ref_42_t-aribart-json-schema-to-ts-infer-typescript-types-from-json-schemas.md' — JSON Schema → TS types.
- 'ref_43_ts-json-schema-generator-generate-json-schema-from-typescript-sources.md' — TS → JSON Schema.
- 'ref_45_c-holland-the-schema-language-question-avro-json-schema-protobuf-and-the-quest.md' — schema languages as cross-language IDLs.

When this brief says "ref_NN", I mean the file in your project knowledge whose name starts with that prefix.

=== THE QUESTION ===

1. What does it concretely look like to expose an acture command registry to Python? Compare the leading patterns:
   - **MCP over stdio/HTTP**: acture commands become MCP tools; Python clients use the MCP Python SDK.
   - **JSON Schema → Pydantic codegen**: emit Pydantic models per command; Python uses HTTP/RPC.
   - **OpenAPI emission**: acture emits an OpenAPI spec; Python uses openapi-generator clients.
   - **ts-rs / typeshare-style direct TS↔Python codegen**: any tools that do this for Python specifically?

2. For each pattern: what does the developer experience look like on each side (TS author + Python consumer)? What ceremony, what drift risk, what runtime overhead?

3. Is JSON Schema enough to generate IDIOMATIC Python clients (typed Pydantic models with docstrings derived from .describe() calls)? What metadata is lost? What needs to be added?

4. The INVERSE direction: a TS frontend calling out to Python-implemented commands. (User has a Python backend; some commands may be implemented in Python but invoked from the React app.) Is MCP the right wire here, or is there something better (RPC, gRPC, FastAPI + generated TS client)?

5. Real reports: find write-ups from teams doing TS↔Python with shared schemas. What did they learn? Where did they get bitten?

6. Specific to the user's context: this user already has ~200 local Python packages, many of which expose Pythonic APIs. Would the user benefit MORE from "acture commands → MCP → Python MCP server" (loose, protocol-based) or "acture commands → JSON Schema → Pydantic models → HTTP/gRPC" (tighter, codegen-based)?

7. Should acture ship a Python companion package (also named 'acture' on pypi)? If yes, what should its scope be? Just an MCP client wrapper? A full Pydantic-models codegen? An async dispatcher mirroring the TS one?

=== WHAT I NEED ===

A written report (2000-4000 words) with:

- A comparison table of the 4 patterns (MCP / Pydantic codegen / OpenAPI / direct codegen) along axes of: DX, drift risk, runtime overhead, ceremony.
- 2-3 real case studies of TS↔Python shared-schema work, with what worked and what didn't.
- A concrete recommendation: what should acture's cross-language story be in v1? Post-v1?
- If a Python companion package is recommended: a sketch of its scope and API.
- A list of references with URLs.

Save the report as 'research_findings_prompt_6.md'.
```

**Decision it unblocks:** Whether acture ships a Python companion package; the cross-language story for the user's Python ecosystem.

**Project knowledge files to add:**
- `command_dispatch_journal_article.md`
- `ref_05_model-context-protocol-tools-concept.md`
- `ref_14_mcp-typescript-sdk.md`
- `ref_42_t-aribart-json-schema-to-ts-infer-typescript-types-from-json-schemas.md`
- `ref_43_ts-json-schema-generator-generate-json-schema-from-typescript-sources.md`
- `ref_45_c-holland-the-schema-language-question-avro-json-schema-protobuf-and-the-quest.md`

---

## Recommended order

You've already launched **Prompt 1** (convergent-evidence audit). The recommended order for the remaining 5 prompts is below. The ordering principle is: prompts whose findings the most other prompts could build on come first.

| Order | Prompt | Why this order | Depends on |
| --- | --- | --- | --- |
| **1 (launched)** | 1 — Convergent evidence | Settles command-record shape; informs all others | — |
| **2** | 2 — Parameterized palette UX | Self-contained; high leverage on Phase 2; independent of others | — |
| **3** | 3 — State substrate | Decision-blocking for Phase 1 implementation | — |
| **4** | 4 — Migration API + codemods | Mode-2 specific; large scope; can run in parallel with 2 and 3 | — |
| **5** | 5 — Schema versioning | Narrower scope; informs Phase 4 tier system | Lightly: P1's findings on what shipped products do |
| **6** | 6 — Cross-language story | Post-v1 question; lowest urgency | Lightly: P5's findings on schema versioning |

### Parallelism

Prompts 2, 3, 4 can run **fully in parallel** with each other and with Prompt 1. None depends on the others' findings. If you want maximum throughput: launch 2, 3, 4 now, alongside the already-running Prompt 1.

Prompts 5 and 6 should run **after Prompt 1 lands**, because:
- Prompt 5 (schema versioning) is more useful once we know whether the command-record shape from Prompt 1 already includes versioning conventions.
- Prompt 6 (cross-language) is post-v1 and benefits from having Prompt 5's versioning findings to reference.

If you only run two: **Prompts 2 and 3.** They unblock Phase 1 and Phase 2 of [`v1_plan.md`](v1_plan.md) most directly.

If you only run three: **Prompts 2, 3, 4.** Adds the mode-2 migration concrete story.

Prompts 5 and 6 are valuable but not phase-blocking — they can land during Phase 2 or Phase 3 without slowing implementation.
