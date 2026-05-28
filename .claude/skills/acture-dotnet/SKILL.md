---
name: acture-dotnet
description: Foundational skill for adding a command-dispatch architecture to a C# / .NET project — greenfield or strangler-fig. Maps acture's three primitives (state model, command registry, schema bridge) to the modern .NET stack (`record` + `required` + nullable refs; a hand-rolled `IServiceCollection`-backed registry or `martinothamar/Mediator`; `System.Text.Json.Schema.JsonSchemaExporter`), names the AIFunction convergence (`Microsoft.Extensions.AI.AIFunction` IS the `CommandRecord` shape and the MCP SDK's `McpClientTool` inherits from it), surfaces the AOT-vs-reflection axis, and routes to the right deeper skill (`acture-dotnet-greenfield`). Triggers on ".NET command dispatch", "C# command bus", "MediatR alternative", "MediatR replaced what", "MCP server C#", "Microsoft.Extensions.AI tool calling", "expose .NET service to MCP", "WPF command palette acture", "ASP.NET command registry", "Blazor command palette", "Wolverine vs Brighter vs MediatR", "JsonSchemaExporter for AI tools", "acture in C#", "acture in .NET", "Roslyn source generator for command registry".
---

# acture .NET — command dispatch for C# / .NET projects

The .NET ecosystem has a *very* well-established mediator/command-bus tradition (`MediatR`, `Brighter`, `Wolverine`, `MassTransit`, `Cortex.Mediator`). Every one of them solves *one* of the journal's three primitives — **handler dispatch** — and treats metadata as an afterthought. The journal's registry, by contrast, must be a **first-class enumerable artifact**: command palettes iterate it, MCP `tools/list` returns it, LLM `tools=[...]` reads it, plugin hosts traverse it. You will always wrap any mediator with a metadata side-car layer, so for new code the side-car *is* the registry — and the mediator is optional.

This skill is the .NET entry point. It maps the three primitives to the language, names the convergent shape that already exists in the BCL-adjacent libraries, surfaces the two trade-offs every .NET project faces (AOT vs reflection + framework variant), and hands off to the path skill (greenfield).

> Load `acture-architecture-primer` first if you have not — the three primitives and the eight consumer surfaces are the conceptual baseline this skill specializes for .NET. Load `acture-hard-donts` before merging anything.

The companion research note lives at [`docs/research/acture_research_8 -- Command Dispatch Architecture in C# : .NET — A Tooling Report for Skill-Building Agents.md`](../../docs/research/acture_research_8%20--%20Command%20Dispatch%20Architecture%20in%20C%23%20:%20.NET%20%E2%80%94%20A%20Tooling%20Report%20for%20Skill-Building%20Agents.md). When in doubt about a library choice, version, or licence, that is the source of truth.

## The single most valuable .NET insight

> **The `CommandRecord` shape already exists in modern .NET — it is `Microsoft.Extensions.AI.AIFunction`.**

`AIFunction` carries `Name`, `Description`, `JsonSchema`, and an `InvokeAsync` method. The official **ModelContextProtocol** C# SDK's `McpClientTool` *inherits from* `AIFunction`. That means one C# definition can serve LLM tool-calling, MCP, and UI surfaces from a single source of truth — **no adapter layer is required between the AI and MCP surfaces**.

Build your registry around `AIFunction` (or a thin wrapper that exposes it), not around `IRequest<TResponse>`. This is the *one* architectural lever the journal wants in this ecosystem.

## The one rule you cannot break

> Command metadata is **data, not code** — and that includes in C#.

`[Command(Id = "...", Title = "...", Category = "...", Icon = "...", Hotkey = "...")]` is a C# attribute whose arguments are compile-time constants. The C# attribute grammar enforces this structurally — do not invent a runtime DSL on top. `When` is a *string predicate name* resolved by the host; conditional logic that the registry would have to interpret belongs in the handler, not in metadata. This is the same guardrail that rejects nested registries and "command inheritance" in the TS core.

The corollary: **classic .NET mediators are dispatchers, not registries.** MediatR / Mediator / Wolverine / Brighter / MassTransit all route by request type. They are perfectly good dispatchers — the registry is the metadata side-car you put next to them (and in greenfield .NET projects in 2026, you usually skip the mediator and ship the side-car directly).

## The three primitives in .NET

| Primitive        | .NET shape                                                                                              | Reference library                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| State model      | `sealed record` + `required` members + nullable reference types; round-trips through `System.Text.Json`. | **(built-in)** + `FluentValidation` 12 for non-trivial rules; `DataAnnotations` for schema-visible validation |
| Command registry | `IReadOnlyDictionary<string, CommandRecord>` built by a Roslyn `IIncrementalGenerator` scanning `[Command]`, registered via DI. The registry projects each record to an `AIFunction` for the AI/MCP surfaces. | **(your code)** + optional `Mediator.SourceGenerator` for handler dispatch                       |
| Schema bridge    | CLR type → JSON Schema via `System.Text.Json.Schema.JsonSchemaExporter` (`JsonTypeInfo`-driven, matches what STJ accepts).  | **`System.Text.Json` ≥ 9** (first-party)                                                          |

`[McpServerTool]` is the **MCP-surface** primitive. `AIFunction` is the **AI-surface** primitive. `[Command(...)]` is the **registry/metadata** primitive. They are not the same — keep them on adjacent layers so each surface stays swappable.

### Stack reference (May 2026)

```
.NET                10 LTS                          (supported until 10 Nov 2028)
Language            C# 14
State / DTOs        record + required + nullable    (built-in)
Validation          FluentValidation 12.1.1+        Apache-2.0
Schema bridge       System.Text.Json ≥ 9            MIT (first-party)
AI tool surface     Microsoft.Extensions.AI 10.6+   MIT
MCP surface         ModelContextProtocol 1.x        MIT (MS + Anthropic)
HTTP transport      ModelContextProtocol.AspNetCore MIT
Desktop UI bridge   CommunityToolkit.Mvvm 8.3+      MIT
CLI                 System.CommandLine 2.0          MIT  (GA 11 Nov 2025)
Feature flags       Microsoft.FeatureManagement     MIT
Tests               xUnit + CsCheck 4.6+            Apache-2.0
Migration HTTP path Yarp.ReverseProxy + Microsoft.AspNetCore.SystemWebAdapters  MIT
```

## Library choices that have changed in the last 18 months

Three commercial-licence shifts have rewritten the default-stack advice. Knowing them is non-optional.

| Library                          | Status                                                                                                                                                       | Practical effect                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MediatR** (≥ v13)              | **RPL-1.5 + commercial** under Lucky Penny Software since 2 July 2025. Community tier free *only* for orgs under **$5 M USD revenue AND under $10 M outside capital**; government agencies excluded. | **Do not pick for new code** unless the org qualifies. Older v12 (MIT) is archived. For greenfield, use `martinothamar/Mediator` (MIT) or hand-roll the registry.                          |
| **Fluent Assertions ≥ v8**       | **Xceed Community License** (paid for commercial use) since January 2025.                                                                                     | Pin `FluentAssertions` to `[7.0.0]` or migrate to the **AwesomeAssertions** fork. **Easy to confuse with FluentValidation, which remains Apache-2.0** — keep the two names straight.       |
| **MassTransit ≥ v9**             | **Commercial via Massient, Inc.** for production use. v8 (Apache-2.0) maintained at least through end of 2026; 100% discount for orgs <$1 M USD annual revenue. | If you need MassTransit specifically, pin v8 unless you've licensed v9. For an in-proc command registry you don't need MassTransit at all — it solves a different problem (distributed messaging). |
| **Newtonsoft.Json.Schema**       | **AGPL-3.0 + commercial** with a 1000-ops-per-hour throttle when unlicensed.                                                                                 | Do not pick for new code. Use `System.Text.Json.Schema.JsonSchemaExporter` instead.                                                                                                       |

These are the moves that make the May-2026 stack different from the May-2024 stack a typical .NET tutorial still recommends.

## Two dimensions — always keep both open

For any .NET engagement, locate the task on both axes before writing code:

### Dimension 1 — greenfield vs strangler-fig

Is command dispatch designed in from the start, or wrapped around an existing .NET codebase incrementally?

- **Greenfield** → load **`acture-dotnet-greenfield`**. State model first, registry second, surfaces last.
- **Strangler-fig** → load **`acture-dotnet-strangler`**. Wrap existing service/controller methods as `[Command]`-tagged handlers, feature-flag the new surface with `Microsoft.FeatureManagement`, retire the legacy branch once telemetry is green. See also §"Strangler fig in .NET" below for the YARP + `SystemWebAdapters` HTTP migration path and the MediatR escape path.

The PR description / decision log should record which path the project is on; later sessions need to know.

### Dimension 2 — AOT/trim vs reflection

This is the .NET-specific axis. Many of the *most ergonomic* APIs in this ecosystem (`AIFunctionFactory.Create`, `WithToolsFromAssembly`, reflection-mode `JsonSchemaExporter`) emit **IL2026** / **IL3050** trim warnings under Native AOT. The trade-off is real and shapes the registry's implementation:

| Path                  | Registry built by                                          | Schema generated by                               | AOT-safe? | When to pick                                                                                                       |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| **Reflection path**   | Runtime assembly scan for `[Command]`                       | `JsonSerializerOptions.Default.GetJsonSchemaAsNode(typeof(T))` | ❌         | Server / desktop apps that don't ship AOT; the cheapest path to a working registry; the path the research note demos. |
| **Source-generator path** | Roslyn `IIncrementalGenerator` emits a `partial GeneratedCommandRegistry.All` dictionary at compile time | Pre-computed schema strings emitted by the generator, plus a source-gen `JsonSerializerContext` for STJ | ✅         | AOT-targeted builds (mobile MAUI, single-file native, container cold-start), trim-safe libraries, plugins shipped as NuGet packages. |

**Recommendation for `[Command]`-tagged registries:** prefer source generators. The same attribute drives both paths — at design time, the generator transcribes the attribute values into a `CommandRecord` instance; at runtime, no reflection is needed. This matches the "data, not code" guardrail because the generator only *transcribes* attribute values into record instances — it never executes them.

## The `[Command]` attribute — the canonical shape

Whether the project hand-writes its registry or uses a source-generator scanner, the attribute shape is the same. Project this onto whatever your codebase already does (extra fields are fine — but stay in the "data, not code" lane).

```csharp
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class CommandAttribute : Attribute
{
    public required string Id      { get; init; }            // 'app.data.applyFilter' — namespaced
    public required string Title   { get; init; }            // 'Apply filter'
    public string  Category        { get; init; } = "general";
    public string? Description     { get; init; }
    public string? Icon            { get; init; }
    public string? Hotkey          { get; init; }            // 'mod+f' — host parses
    public string? When            { get; init; }            // 'app.datasetLoaded' — host evaluates
    public bool    RequiresConfirmation { get; init; }
}
```

The handler is a class implementing a single-DTO contract — see `acture-dotnet-greenfield` for the canonical shape.

## Consumer surfaces — what's idiomatic, what isn't

| Surface                  | Idiomatic in .NET? | Notes                                                                                                                                                                                                              |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LLM tool calling**     | ✅ Idiomatic        | `Microsoft.Extensions.AI` (`AIFunction`, `AIFunctionFactory.Create`, `ChatClientBuilder.UseFunctionInvocation()`); Semantic Kernel `[KernelFunction]`. `AIFunction` *is* the convergent registry shape.            |
| **MCP server**           | ✅ Idiomatic        | Official `ModelContextProtocol` C# SDK (MS + Anthropic). `McpClientTool` *inherits* `AIFunction` → same code path as the AI surface. `app.MapMcp()` exposes over HTTP.                                              |
| **Desktop palette**      | ✅ Idiomatic        | `CommunityToolkit.Mvvm.Input.RelayCommand` + `[RelayCommand]` source-generator attribute. The XAML `ICommand` is a thin per-ViewModel **adapter** that delegates to `registry.DispatchAsync(...)`, *not* the SSOT. |
| **CLI**                  | ✅ Idiomatic        | `System.CommandLine` 2.0 (GA 11 Nov 2025). `RootCommand` + `SetAction` (no more `SetHandler`). Do not pull the discontinued `.Hosting` / `.NamingConventionBinder` / `.Rendering` packages.                       |
| **Web (Blazor / API)**   | ✅ Idiomatic        | One `app.MapPost("/commands/{id}", ...)` + `app.MapGet("/commands", ...)` minimal-API endpoint pair, or `app.MapMcp()` for the MCP transport (same registry, second URL).                                          |
| **Telemetry / FF / undo / validation** | ✅ Idiomatic | Pipeline-behavior pattern (`IPipelineBehavior` in your own registry, or in `Mediator.SourceGenerator`); `Microsoft.FeatureManagement` for flags; `System.Diagnostics.ActivitySource` for OpenTelemetry; per-command `Inverse` factory or `record`-based snapshot for undo. |
| **Plugin / extension**   | ✅ Idiomatic        | `AssemblyLoadContext` + `AssemblyDependencyResolver`. Keep contracts in the default ALC; register by interface, not concrete type. `McMaster.NETCore.Plugins` wraps the dance if you don't want to write it.        |
| **Testing**              | ✅ Idiomatic        | xUnit / NUnit / TUnit; **`CsCheck`** (Apache-2.0, no reflection, AOT-friendly) or `FsCheck` 3.x for property-based tests.                                                                                          |

**Surface activation order** (lowest-risk first): CLI → HTTP (one endpoint pair) → telemetry middleware → MCP server → LLM tool calling → desktop / Blazor palette. Each surface goes behind a `FeatureGate` so it can be turned off in production.

## The convergent shape, in one diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  [Command(Id="app.data.applyFilter", Title="Apply filter")]     │
│  public sealed class ApplyFilterHandler                          │
│  {                                                               │
│      public Task<AppState> HandleAsync(AppState s,               │
│          ApplyFilterParams p, CancellationToken ct) { ... }      │
│  }                                                               │
└────────────┬────────────────────────────────────────────────────┘
             │ IIncrementalGenerator (or runtime scan)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  CommandRecord { Id, Title, ..., JsonSchema, Handler }           │
│  registered in IServiceCollection                                 │
└────────────┬────────────────────────────────────────────────────┘
             │ projection helpers
             ▼
   ┌──────────┴──────────┐
   │                     │
   ▼                     ▼
ChatOptions.Tools     [McpServerTool]-tagged methods
(AIFunction[])         (or Mcp tool list)
   │                     │
   └─────────┬───────────┘
             ▼
       LLM / MCP client
```

The arrow from `CommandRecord` to `AIFunction` is a ~20-line projection helper. The arrow from `CommandRecord` to MCP is the same projection (since `McpClientTool : AIFunction`). The arrow from `CommandRecord` to the desktop palette is iteration + `[RelayCommand]`-generated `ICommand`s that delegate to `registry.DispatchAsync(...)`.

## Strangler fig in .NET

The journal's wrap → enrich → extract phases map onto a well-known .NET migration playbook combining **YARP** (Yet Another Reverse Proxy, MIT, MS-maintained) and **`Microsoft.AspNetCore.SystemWebAdapters`** for ASP.NET-Framework cases, plus **branch-by-abstraction** for in-proc cases.

### Phase 1 — Wrap

Wrap existing service methods as `CommandRecord` entries without touching their signatures:

```csharp
public static class LegacyOrderServiceAdapter
{
    public static CommandRecord Submit { get; } = new(
        Id: "orders.submit",
        Title: "Submit Order",
        Description: "Submits an order for processing.",
        ParamsType: typeof(SubmitOrderParams),
        JsonSchema: SchemaBridge.SchemaFor(typeof(SubmitOrderParams)),
        Handler: (state, p, ct) => /* call legacy.SubmitOrder(...) */);
}
```

No legacy code changes; the registry has a new entry. Each wrapped command goes behind a `Microsoft.FeatureManagement` feature flag so you can dark-ship it.

### Phase 2 — Enrich

Add `[Command]` attributes to the legacy methods themselves and let the Roslyn `IIncrementalGenerator` emit the registration at compile time. This avoids the inner-platform-effect risk because the metadata is declarative and inspectable by tooling, and it resolves the AOT concerns because the schema becomes a string-literal in generated code.

### Phase 3 — Extract

Once a critical mass of commands flows through the registry, replace the legacy method body with a shim that simply dispatches: `=> _dispatcher.DispatchAsync(state, "orders.submit", paramsJson, ct);`. Then move the registry (and its handlers) into its own assembly and version it independently.

### HTTP-level techniques (ASP.NET Framework → ASP.NET Core)

The official `Microsoft.AspNetCore.SystemWebAdapters` pattern: a new ASP.NET Core 10 host wraps `Yarp.ReverseProxy` and routes anything-not-yet-migrated to the legacy framework app. Per-endpoint migration to the new command registry happens behind the proxy. **Externalize session state (Redis) before the YARP hop** or sessions break — this is the most common surprise.

### Zero downtime

- Blue/green deploy via the YARP facade.
- Use the new registry as a *parallel-run* layer: send each command to *both* legacy and new, compare outputs, return legacy. After N days of zero diffs, flip the proxy.

## Round-trip gotchas (cannot survive CLR ⇄ JSON Schema automatically)

`System.Text.Json.JsonSchemaExporter` is excellent — it is the *only* option whose schema is by construction what `JsonSerializer.Deserialize` will accept — but it has known limits. Budget for these or the AI / MCP surface will silently disagree with the dispatcher.

- **Top-level reference-type nullability** — STJ cannot distinguish `Person` from `Person?` at runtime; default exporter emits `"type": ["object", "null"]`. Set `TreatNullObliviousAsNonNullable = true`.
- **Generic-member nullability** — `List<string?>` vs `List<string>` is invisible to reflection.
- **`description` / `title`** — `JsonSchemaExporter` does **not** emit them by default. Use the `TransformSchemaNode` delegate to lift from `[Description]` attributes. **This is the single most surprising gap; do not ship the AI surface without it.**
- **`format: "email"` / `"date-time"` / `"uri"`** — not emitted by default. Inject via `TransformSchemaNode` based on type.
- **Polymorphism** — STJ's discriminator (`$type`, `[JsonDerivedType]`) becomes `anyOf` / `oneOf`; verify your MCP client supports it.
- **Cyclic types** — emitted as `$ref` to `$defs`; some older JSON Schema validators do not chase `$ref` correctly.
- **`required` for constructor parameters** — flip `RespectRequiredConstructorParameters = true` so required ctor params are not silently optional in the schema.

Keep parameter DTOs in the JSON-Schema-representable subset. Complex validation belongs in the handler, not the schema.

## What NOT to do (.NET-specific)

- **Don't reach for MediatR as the default in 2026.** It is RPL-1.5 + commercial; check the org's revenue/capital thresholds before adding a NuGet reference, and recognise that the journal's pattern does not need MediatR's pipeline-behavior plumbing — a hand-rolled DI-backed registry is ~60 lines.
- **Don't pick `Newtonsoft.Json.Schema` for new code.** AGPL-3.0 + commercial with a 1000-ops-per-hour throttle. Use `System.Text.Json.Schema.JsonSchemaExporter` (.NET 9+) instead.
- **Don't confuse `FluentValidation` with `Fluent Assertions`.** `FluentValidation` is Apache-2.0 and the right choice. `Fluent Assertions ≥ v8` switched to the Xceed Community License (paid for commercial use); pin to `[7.0.0]` or use `AwesomeAssertions`.
- **Don't ship `WithToolsFromAssembly()` in an AOT build.** It uses reflection and emits IL2026. For AOT, use `WithTools<T>()` and hand-construct `AIFunction`s with pre-computed JSON-schema strings and a source-generated `JsonSerializerContext`.
- **Don't put `[Command]` on a domain entity / EF Core entity.** Commands are *intents*; entities are *state*. The metadata-not-code guardrail rejects this — the registry must not become a poor reimplementation of the ORM.
- **Don't merge `[Command]` with `[McpServerTool]` into one attribute.** They are separate by design: one is registry/metadata, the other is the MCP surface. Keeping them apart lets you keep the same registry while swapping the MCP transport (stdio ↔ HTTP) or the AI SDK (MEAI ↔ Semantic Kernel ↔ raw).
- **Don't define `ICommandHandler<TRequest, TResponse>` with DI lifetimes (`IServiceScope`, `IUnitOfWork`) baked into the constraint.** Those are infrastructure concerns. The journal's primitive is `(state, params) → state`. Keep them out of the handler's generic signature; inject them at the handler's constructor if needed.
- **Don't build a `when`-clause DSL.** `When = "..."` is a *name* the host evaluates; the host owns the registry of named predicates. No string DSL until a real consumer (palette gating, AI gating) actually needs it.

## See also

- **`acture-dotnet-greenfield`** — concrete walk-through for a new project: state model → `[Command]` + `IIncrementalGenerator`-built registry → CLI → MEAI/MCP surfaces → tests.
- **`acture-dotnet-strangler`** — concrete walk-through for an existing .NET codebase: wrap a controller/service/MediatR handler, enrich metadata, feature-flag with `Microsoft.FeatureManagement`, retire the legacy branch. Includes the MediatR-licence escape playbook and the ASP.NET Framework → ASP.NET Core YARP migration.
- `acture-architecture-primer` — the three primitives and eight consumer surfaces; the language-agnostic baseline.
- `acture-hard-donts` — pre-merge anti-pattern checklist; applies just as much to C#.
- `acture-command-record-shape` — the closed-surface discipline for the `CommandRecord` (translates 1:1 to the `[Command]` attribute shape).
- `acture-schema-bridge` — the cross-language schema-bridge primitive; the .NET path is `JsonSchemaExporter` with a `TransformSchemaNode` delegate.
- `acture-mcp` — the MCP server surface; the .NET path is `ModelContextProtocol` 1.x (MS + Anthropic), not the TS SDK.
- `acture-ai` — LLM tool calling; the .NET path is `Microsoft.Extensions.AI` 10.6+ (or Semantic Kernel) rather than the Vercel AI SDK.
- `acture-palette-design` — the language-agnostic palette UX design; for .NET desktop, the implementation is `CommunityToolkit.Mvvm` `[RelayCommand]`s delegating to `registry.DispatchAsync(...)`.
- `migration-plan` / `migration-wrap` / `migration-graduate` — the language-agnostic strangler-fig walk-throughs; pair with §"Strangler fig in .NET" above for the YARP + `SystemWebAdapters` specifics.
- [`docs/research/acture_research_8 -- Command Dispatch Architecture in C# : .NET — A Tooling Report for Skill-Building Agents.md`](../../docs/research/acture_research_8%20--%20Command%20Dispatch%20Architecture%20in%20C%23%20:%20.NET%20%E2%80%94%20A%20Tooling%20Report%20for%20Skill-Building%20Agents.md) — the canonical .NET stack reference; check it for current library versions, licence statuses, and the ecosystem-health table.
