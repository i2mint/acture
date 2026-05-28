# Command Dispatch Architecture in C# / .NET — A Tooling Report for Skill-Building Agents

**Author:** Thor Whalen
**Date:** May 2026

## TL;DR

- **Three primitives map cleanly to modern .NET** — `record` + nullable reference types + `[Required]` for the *state model*; a hand-rolled `IServiceCollection`-backed registry (or `martinothamar/Mediator` source-generator) for the *command registry*; and **`System.Text.Json.Schema.JsonSchemaExporter`** (`.NET 9+`) for the *schema bridge*. Avoid MediatR for new work — it relicensed to RPL-1.5 + commercial on **2 April 2025** under Lucky Penny Software, with a free Community tier limited to organisations with **under $5 M USD annual gross revenue *and* under $10 M USD in outside capital** (per mediatr.io), and government/quasi-government agencies do not qualify [1][2].
- **The single most valuable .NET-specific insight** is that `Microsoft.Extensions.AI.AIFunction` is *already* the convergent `CommandRecord` shape (id/title/description/JSON schema/handler), and the official **ModelContextProtocol** C# SDK's `McpClientTool` *inherits from* `AIFunction`. That means one C# definition can serve LLM tool-calling, MCP, and UI surfaces from a single source of truth — no adapter layer required [3][4][5].
- **Recommended greenfield stack:** .NET 10 LTS + `Microsoft.Extensions.AI` **10.6.0** (5 May 2026, MIT) + `ModelContextProtocol` 1.x + `System.Text.Json` 9/10 with `JsonSchemaExporter` + `FluentValidation` 12 (Apache-2.0) + `CommunityToolkit.Mvvm` for UI command surfaces + `System.CommandLine` 2.0 (GA Nov 2025) for CLI. Use Roslyn source generators (not reflection) for the registry if you want trim/AOT support.

---

## 1. Mapping the Three Primitives to C#

### 1.1 State model — typed, schema-described, single source of truth

The journal's "state model" primitive maps to a **`record`** (C# 9+) with **`required` members** (C# 11) and nullable-reference-type annotations. These three features together give you exactly what the journal demands: typed, immutable, schema-describable, and round-trippable through `System.Text.Json`.

```csharp
public sealed record FilterState
{
    public required string Column { get; init; }
    public required FilterOperator Op { get; init; }
    public string? Value { get; init; }              // explicitly optional
    public IReadOnlyList<string> Tags { get; init; } = [];
}

public enum FilterOperator { Equals, Contains, GreaterThan, LessThan }
```

Why this works as a "single source of truth":
- **Records** give value-equality and `with`-expressions (cheap state derivation).
- **`required`** is enforced both by the C# compiler *and* by `System.Text.Json` when you set `RespectRequiredConstructorParameters = true` or use `init`-only required properties [6].
- **Nullable annotations** flow into the generated JSON Schema's `required` array when you enable `RespectNullableAnnotations = true` (.NET 9+) [7].
- **`enum`** members become `enum` keywords in JSON Schema, with names controllable via `[JsonStringEnumMemberName]`.

**Validation:** prefer **`FluentValidation` 12** (NuGet `FluentValidation`, **Apache-2.0**, latest **12.1.1 released 3 December 2025**, .NET 8+ only since v12 dropped older TFMs) for non-trivial cross-field rules; use **`System.ComponentModel.DataAnnotations`** (`[Required]`, `[Range]`, `[StringLength]`, `[RegularExpression]`) when you want the annotations to *also* appear in the exported JSON Schema and OpenAPI [8]. The `DataAnnotations` route is the only one that round-trips into the schema bridge automatically; FluentValidation rules are code, not metadata.

> ⚠️ **Do not confuse FluentValidation with Fluent Assertions.** FluentValidation 12 remains Apache-2.0. **Fluent Assertions 8.0** (a separate library) switched to the **Xceed Community License** (commercial use requires a paid licence) in January 2025; pin to `[7.0.0]` or migrate to the **AwesomeAssertions** fork if you need that capability free [9].

### 1.2 Command registry — id → handler + metadata + parameter schema

The .NET ecosystem has a *very* well-established mediator/command-bus tradition (`MediatR`, `Brighter`, `Wolverine`, `MassTransit`, `Cortex.Mediator`). The journal's CommandRecord shape (`id`, `title`, `handler`, `parameters/schema`, `when`, `category`, `icon`, `hotkey`) is **strictly richer** than what classic mediators expose — they are *dispatch-focused* and treat metadata as an afterthought. You will end up wrapping any mediator with your own registry layer to surface the metadata the journal demands.

#### Mediator / command-bus comparison

| Library | NuGet ID | License | TFM | AOT | Metadata-rich? | Verdict for journal's pattern |
|---|---|---|---|---|---|---|
| **MediatR** (v13+) | `MediatR` | **RPL-1.5 + commercial** (Lucky Penny SW) — Community tier free for orgs <$5 M revenue *and* <$10 M outside capital; gov't agencies excluded [1][2] | net8/net9/net10/netfx4.x | No (reflection) | No | **Avoid for new work** unless your org qualifies for Community and accepts licence key flow |
| **martinothamar/Mediator** | `Mediator.SourceGenerator` + `Mediator.Abstractions` | MIT | netstandard2.0, net8+ | **Yes** (source-gen) [11] | No (dispatch only) | **Strong**: best fit if you want a MediatR-like API with free licence and AOT support |
| **Wolverine** | `WolverineFx` | MIT (paid support via JasperFx) [12] | net8+ | Partial | Some (handler discovery rich; not parameter schema) | Heavy; great if you also want messaging/outbox; over-engineered for an in-proc command registry |
| **Brighter** | `Paramore.Brighter` 10.x | **MIT** [13] | netstandard2.0, net8+ | No | No (focuses on dispatch + middleware) | Solid permissive alternative if you need RabbitMQ/Kafka/SQS transports |
| **MassTransit v9** | `MassTransit` | **Commercial for production via Massient, Inc.** (Apache-2.0 v8 remains free, maintained ≥ end of 2026); orgs with annual gross revenue under $1 M qualify for a 100% discount per massient.com [14] | net8+ | No | No | Avoid for greenfield; distributed-messaging focus, not in-proc command dispatch |
| **Cortex.Mediator** | `Cortex.Mediator` | MIT | net8+ | Limited | No | Niche; thin MediatR drop-in |
| **Plain `Microsoft.Extensions.DependencyInjection`** | (built-in) | MIT | net8+ | Yes | **You own the metadata** | **Recommended for the journal's pattern** — see §3 |

**Recommendation:** for a faithful port of the journal's metadata-rich, flat `CommandRecord` registry, a **hand-rolled `IServiceCollection`-backed registry** is the most idiomatic choice in 2026. The classical mediator pattern hides the registry behind a `Send(IRequest)` API; the journal's design *requires* the registry to be a first-class enumerable artifact (it's consumed by command palettes, MCP tool lists, AI tool descriptions, plugin systems). If you must use a library, choose **`martinothamar/Mediator`** for its source-generated, AOT-friendly, MIT-licensed character.

### 1.3 Schema bridge — CLR type → JSON Schema → CLR type

This is where **.NET 9 changed the game**: `System.Text.Json.Schema.JsonSchemaExporter` is now first-party, fast, and uses the same `JsonTypeInfo` that drives serialization, so the schema is *guaranteed* to match what `System.Text.Json` will accept and produce [3][7].

```csharp
using System.Text.Json;
using System.Text.Json.Schema;

JsonNode schema = JsonSerializerOptions.Default.GetJsonSchemaAsNode(typeof(FilterState),
    new JsonSchemaExporterOptions { TreatNullObliviousAsNonNullable = true });
```

#### Schema-bridge library comparison

| Library | NuGet ID | License | Required .NET | AOT | Notes |
|---|---|---|---|---|---|
| **`System.Text.Json` `JsonSchemaExporter`** | `System.Text.Json` 9+ | MIT | **.NET 9+** [3] | **Yes when fed source-gen `JsonTypeInfo`** — reflection overloads emit IL2026/IL3050 [15] | First-party, schema matches STJ contract exactly; **drops `title`/`description` by default** (use `TransformSchemaNode` to inject from `[Description]`) [16] |
| **NJsonSchema** | `NJsonSchema` 11.x | MIT | netstandard2.0 | Limited | Mature; backs NSwag; uses `Newtonsoft.Json`; handles many attributes/annotations and code-gen [17] |
| **JsonSchema.Net.Generation** (json-everything) | `JsonSchema.Net.Generation` 7.x | MIT | netstandard2.0, net8+ | **Yes** via separate source-generator [18] | Pure JSON-schema focus; recommends a *separate* schema-only DTO model from your domain |
| **Newtonsoft.Json.Schema** (`JSchemaGenerator`) | `Newtonsoft.Json.Schema` 3.x | **AGPL-3.0 + commercial** [19] | netstandard2.0 | No | **Free quota is 1000 ops/hour or AGPL — buy a per-developer commercial licence for closed-source/SaaS** [19][20]. Avoid unless you already have it |

**Recommendation:** **`System.Text.Json.JsonSchemaExporter`** for any project on .NET 9+. It is the only option whose generated schema is by construction what `JsonSerializer.Deserialize` will accept. Use the `TransformSchemaNode` delegate to inject `title` / `description` from `[Description]` attributes — it is a 10-line helper, shown in §3.

> **Known round-trip caveats:** `JsonSchemaExporter` produces `"type": ["object","null"]` for top-level nullable reference types because *reflection cannot distinguish* `MyPoco` from `MyPoco?` at runtime; non-generic constructor-parameter nullability *does* flow through [7]. `$ref` / cyclic types are emitted as `$ref` to `$defs`. There is no `title` or `description` emission by default. `Newtonsoft.Json.Schema`'s `JSchemaGenerator` carries `[Description]` to schema `description` natively, which is a real ergonomic loss for STJ; budget for the transform delegate.

---

## 2. Mapping the Consumer Surfaces to C#

| Surface | Idiomatic in .NET? | Tooling |
|---|---|---|
| **LLM tool calling** | ✅ Idiomatic | `Microsoft.Extensions.AI` (`AIFunction`, `AIFunctionFactory`, `FunctionInvokingChatClient`); Semantic Kernel `[KernelFunction]`; OpenAI/Azure OpenAI SDKs |
| **MCP server** | ✅ Idiomatic (since 2025) | Official `ModelContextProtocol` C# SDK (MS + Anthropic) — `McpServerTool` *inherits* from `AIFunction` so shares the schema-bridge code path |
| **Desktop command palette** | ✅ Idiomatic (native .NET tradition) | `System.Windows.Input.ICommand`, `RoutedCommand`, `CommunityToolkit.Mvvm.Input.RelayCommand` + `[RelayCommand]` source-gen attribute |
| **CLI** | ✅ Idiomatic | `System.CommandLine` 2.0 (GA Nov 2025) [21]; `Spectre.Console.Cli` for richer interactive shells |
| **Blazor / Web** | ✅ Possible-with-adaptation | Minimal APIs + `[McpServerTool]`-decorated endpoint handlers; `app.MapMcp()` to expose the same registry over HTTP |
| **Testing** | ✅ Idiomatic | xUnit / NUnit / TUnit; **`CsCheck`** (Apache-2.0, no reflection, C#-idiomatic) or **`FsCheck` 3.x** (BSD-3-Clause, fluent C# API in v3) for property-based testing |
| **Undo/redo + macros** | ✅ Idiomatic | The journal's `{commandId, params}` envelope serializes via `System.Text.Json`; pair each `Command` with an `Inverse` factory or use Memento (`record`-based snapshots) |
| **Plugin/extension API** | ✅ Idiomatic | `AssemblyLoadContext` + `AssemblyDependencyResolver` (modern, `isCollectible:true` enables hot reload); `MEF` (legacy); `McMaster.NETCore.Plugins` [22] |
| **Middleware (telemetry, FF, validation)** | ✅ Idiomatic | Pipeline-behavior pattern (`IPipelineBehavior<TRequest,TResponse>`); `Microsoft.FeatureManagement` for feature flags; `System.Diagnostics.ActivitySource` for OpenTelemetry |

### 2.1 LLM tool calling — the convergent shape

`Microsoft.Extensions.AI` (MEAI) is the abstraction layer Microsoft shipped to collapse OpenAI/Azure OpenAI/Anthropic/Ollama tool-calling APIs into one shape. The **three types you need** are:

- **`AIFunction`** — represents a function describable to an AI model and invokable. Carries `Name`, `Description`, `JsonSchema`, and an `InvokeAsync` method. *This is the journal's `CommandRecord` shape, already in the BCL-adjacent libraries.* [4]
- **`AIFunctionFactory.Create(Delegate, name?, description?)`** — wraps any C# delegate as an `AIFunction`, with automatic JSON-schema generation from the delegate's parameter types and `[Description]` attributes [23].
- **`FunctionInvokingChatClient`** (via `ChatClientBuilder.UseFunctionInvocation()`) — middleware that runs the model→call→response loop automatically.

```csharp
ChatOptions chatOptions = new() {
    Tools = [ AIFunctionFactory.Create(ApplyFilter, name: "applyFilter",
              description: "Apply a typed filter to the active dataset.") ]
};
```

> ⚠️ **AOT note:** `AIFunctionFactory.Create` is implemented internally as a `ReflectionAIFunction` and uses `JsonSerializerOptions` defaults to produce its schema. As of `Microsoft.Extensions.AI` 10.6 (5 May 2026), this emits **IL2026** / **IL3050** trim warnings under Native AOT [24]. For AOT-targeted builds, construct `AIFunction` subclasses manually with a pre-computed JSON-schema string and pre-cached `JsonTypeInfo` from a source-generated `JsonSerializerContext`.

### 2.2 MCP server — same definition, second surface

The **official ModelContextProtocol C# SDK** is maintained jointly by Microsoft and Anthropic and reached **v1.0 on 5 March 2026** with full support for the 2025-11-25 MCP specification [5][25]. Three NuGet packages:

| Package | Use when |
|---|---|
| `ModelContextProtocol.Core` | Client-only / low-level server, minimal deps |
| `ModelContextProtocol` | Server + DI + hosting extensions (most common) |
| `ModelContextProtocol.AspNetCore` | HTTP / Streamable HTTP transport |

```csharp
// Program.cs — full MCP server in 12 lines
var builder = Host.CreateApplicationBuilder(args);
builder.Logging.AddConsole(o => o.LogToStandardErrorThreshold = LogLevel.Trace);
builder.Services.AddMcpServer()
                .WithStdioServerTransport()
                .WithToolsFromAssembly();        // scans for [McpServerTool]
await builder.Build().RunAsync();

[McpServerToolType]
public static class FilterTools {
    [McpServerTool, Description("Apply a typed filter to the active dataset.")]
    public static FilterResult ApplyFilter(string column, FilterOperator op, string? value)
        => FilterEngine.Apply(column, op, value);
}
```

**Key integration fact:** `McpClientTool` inherits from `AIFunction`. So a client-side MCP tool *is* a MEAI tool — the same `ChatOptions.Tools` list accepts either. This is the architectural lever the journal wants: one definition, both surfaces [4][26].

> ⚠️ **AOT note:** `WithToolsFromAssembly()` uses reflection and emits **IL2026** in Native AOT builds; the SDK docs explicitly say "Assembly scanning uses reflection and may not work in Native AOT scenarios. For AOT compatibility, use the generic `WithTools<T>()` method instead." [27]

### 2.3 Invocation UIs

- **WPF/WinUI/MAUI/Avalonia:** use `CommunityToolkit.Mvvm` (MIT). The `[RelayCommand]` attribute (source-generator) turns a method into an `IRelayCommand` property automatically [28]:

  ```csharp
  public partial class FilterViewModel : ObservableObject {
      [RelayCommand(CanExecute = nameof(CanApply))]
      private async Task ApplyFilterAsync(FilterState s, CancellationToken ct) { /* … */ }
      private bool CanApply(FilterState s) => !string.IsNullOrEmpty(s.Column);
  }
  ```
  These XAML `ICommand`s are not the same as the journal's commands — they're per-ViewModel bindings. Bridge them by having each `RelayCommand` delegate to `_dispatcher.Dispatch("applyFilter", s)`.

- **CLI:** `System.CommandLine` 2.0.0 went GA on 11 November 2025 [21][29]. Use `RootCommand`, `Option<T>`, `Argument<T>`, and `SetAction` (no longer `SetHandler`). Discontinued sub-packages: `.Hosting`, `.NamingConventionBinder`, `.Rendering`, `.DragonFruit` [21].

- **Web (Blazor / Minimal APIs):** map `dispatcher.Dispatch(id, json)` onto a `MapPost("/commands/{id}", …)` minimal-API endpoint. The MCP SDK's `app.MapMcp()` exposes the *same* registry via HTTP transport — no extra code.

### 2.4 Testing

```csharp
[Fact]
public async Task Dispatching_applyFilter_updates_state() {
    var registry = CreateRegistry();
    var state = new AppState(Filters: []);
    var newState = await registry.Dispatch(state, "applyFilter",
        new { column = "price", op = "GreaterThan", value = "100" });
    Assert.Single(newState.Filters);
}
```

For property-based tests: prefer **`CsCheck`** (NuGet `CsCheck` 4.6.x, **Apache-2.0**, "no reflection", "close to AOT compatible") for C#-first ergonomics. Use **`FsCheck` 3.3.x** (NuGet `FsCheck` / `FsCheck.Xunit`, **BSD-3-Clause**) if you already have F# code or want the most mature shrinking story; v3.x added a dedicated fluent C# API.

### 2.5 Undo/redo and macros

The journal's `{commandId, params}` envelope is a **trivially serializable record** in C#:

```csharp
public sealed record DispatchedCommand(string Id, JsonElement Params, DateTimeOffset At);
```

A macro is `IReadOnlyList<DispatchedCommand>`. Reversibility is per-command: either define `IReversibleCommand<TParams>` with `Task<TParams> InverseAsync(TParams, AppState)`, or take a Memento snapshot of `AppState` before each mutating dispatch (cheap if your state model is a `record` with structural sharing).

### 2.6 Extension/plugin APIs

The .NET-idiomatic answer is **`AssemblyLoadContext` + `AssemblyDependencyResolver`** (built-in since .NET Core 3.0). The official tutorial walks through a plugin-loader that discovers `ICommand` implementations from external DLLs [30]. Key practical advice from the ecosystem [22][31]:

- Use `isCollectible: true` for hot-reload (but understand the `WeakReference` GC dance).
- Keep the contracts assembly (containing your `ICommand`, `CommandRecord`, parameter types) in the *default* `AssemblyLoadContext`. Register concrete types **by contract interface**, never by concrete `Type`.
- For multi-version dependency tolerance, give every plugin its own ALC.
- `McMaster.NETCore.Plugins` (NuGet `McMaster.NETCore.Plugins`) wraps the ALC dance with shared-types unification and unloadability — a battle-tested helper if you don't want to write it yourself.

### 2.7 Middleware consumers

- **Telemetry:** wrap `Dispatch` in `using var activity = ActivitySource.StartActivity("command.dispatch")`. MEAI provides `ChatClientBuilder.UseOpenTelemetry()` for the AI side [32]; the MCP SDK has its own activity source.
- **Feature flags:** `Microsoft.FeatureManagement` (and `.AspNetCore` / `.Mvc` / minimal-APIs `WithFeatureGate`) lets you gate command *registration* (skip registering `experimental.*` commands when a flag is off) or command *execution* (a pipeline-behavior that returns "disabled" if the flag is off) [33].
- **Validation:** plug FluentValidation or DataAnnotations into your pipeline as the *first* behavior, before the handler runs.

---

## 3. The "Real" Reference Stack

**Recommended for new code:**

| Layer | Choice | NuGet |
|---|---|---|
| Runtime | **.NET 10 LTS** (released 11 Nov 2025, supported until 10 Nov 2028) [34] | — |
| Language | C# 14 | — |
| State model | `record` + `required` + nullable refs | (built-in) |
| Validation | `FluentValidation` 12 (Apache-2.0) | `FluentValidation` 12.1.1 (3 Dec 2025) |
| Command registry | **Hand-rolled `IServiceCollection`-backed registry** with an attribute-driven Roslyn source generator | (your code) |
| Schema bridge | `JsonSchemaExporter` | `System.Text.Json` (>=9.0.0) |
| AI tool surface | `Microsoft.Extensions.AI` 10.6.0 (5 May 2026, MIT) | `Microsoft.Extensions.AI`, `Microsoft.Extensions.AI.OpenAI` |
| MCP surface | `ModelContextProtocol` 1.x | `ModelContextProtocol` + `.AspNetCore` |
| Desktop UI bridge | `CommunityToolkit.Mvvm` | `CommunityToolkit.Mvvm` |
| CLI | `System.CommandLine` 2.0 | `System.CommandLine` |
| Telemetry | `System.Diagnostics.ActivitySource` + OpenTelemetry | `OpenTelemetry`, `OpenTelemetry.Exporter.*` |
| Feature flags | `Microsoft.FeatureManagement` | `Microsoft.FeatureManagement(.AspNetCore)` |
| Tests | xUnit + `CsCheck` | `xunit`, `CsCheck` |

**Alternative (less hand-rolling, accept a thin abstraction):** swap the hand-rolled registry for **`martinothamar/Mediator`** (`Mediator.SourceGenerator` 3.0.2 / `Mediator.Abstractions` 3.0.1, both last updated 22 March 2026; `3.1.0-rc.1` also available; MIT, AOT-friendly). You keep the schema bridge and AI/MCP surfaces as above; the trade is that you must layer metadata on top of `IRequest<TResponse>` yourself (the mediator interface is dispatch-only).

### 3.1 Why *not* MediatR

As of **2 April 2025**, Jimmy Bogard announced the commercialization of MediatR (and AutoMapper). On **2 July 2025** the commercial editions launched under **Lucky Penny Software** at `LuckyPennySoftware/MediatR`. The licence is now **dual: RPL-1.5 + commercial**, with a Community edition free only for organisations meeting **all** of: under **$5 M USD annual gross revenue**, under **$10 M USD in outside capital** (e.g. private equity or VC), and excluding government and quasi-government agencies (per mediatr.io). A licence key is still required to remove startup log warnings [10][1]. Older v12 remains MIT and is archived; expect divergent forks. For a project that intends to be open-source-redistributable or used inside a commercial entity over the revenue/capital thresholds, MediatR is no longer the obvious default — particularly when the journal's pattern *does not need* MediatR's pipeline-behavior plumbing (you can build the same in ~60 lines of DI code).

### 3.2 End-to-end sketch: one command, both surfaces

```csharp
// === 1. The state model ====================================================
public sealed record AppState(IReadOnlyList<FilterState> Filters)
{
    public static AppState Empty { get; } = new([]);
}

// === 2. The command parameters (typed, schema-described) ===================
public sealed record ApplyFilterParams(
    [property: Description("Column name to filter on")] string Column,
    [property: Description("Comparison operator")]      FilterOperator Op,
    [property: Description("Right-hand value (optional for IsNull/IsNotNull)")] string? Value);

// === 3. The CommandRecord shape ===========================================
public sealed record CommandRecord(
    string Id,
    string Title,
    string? Description,
    Type ParamsType,
    JsonNode JsonSchema,
    Func<AppState, JsonElement, CancellationToken, Task<AppState>> Handler,
    string? Category = null,
    string? Icon = null,
    string? Hotkey = null);

// === 4. The handler (CQS-respecting: returns next state) ==================
[CommandHandler(Id = "applyFilter", Title = "Apply Filter", Category = "data")]
public sealed class ApplyFilterHandler
{
    public static Task<AppState> HandleAsync(AppState state, ApplyFilterParams p, CancellationToken ct)
        => Task.FromResult(state with { Filters = [..state.Filters,
                                                   new FilterState { Column = p.Column,
                                                                     Op = p.Op,
                                                                     Value = p.Value }] });
}

// === 5. The hand-rolled registry ==========================================
public interface ICommandRegistry
{
    IReadOnlyDictionary<string, CommandRecord> All { get; }
    Task<AppState> DispatchAsync(AppState state, string id, JsonElement parameters, CancellationToken ct);
}

public sealed class CommandRegistry(IEnumerable<CommandRecord> commands,
                                    IEnumerable<IPipelineBehavior> pipeline) : ICommandRegistry
{
    public IReadOnlyDictionary<string, CommandRecord> All { get; }
        = commands.ToDictionary(c => c.Id, c => c);

    public async Task<AppState> DispatchAsync(AppState state, string id, JsonElement p, CancellationToken ct)
    {
        var cmd = All[id];
        Func<AppState, JsonElement, CancellationToken, Task<AppState>> next = cmd.Handler;
        foreach (var behavior in pipeline.Reverse())
        {
            var captured = next;
            next = (s, pp, c) => behavior.InvokeAsync(cmd, s, pp, c, captured);
        }
        return await next(state, p, ct);
    }
}

// === 6. Pipeline behaviors (telemetry, validation, feature flags) =========
public interface IPipelineBehavior
{
    Task<AppState> InvokeAsync(CommandRecord cmd, AppState s, JsonElement p, CancellationToken ct,
                               Func<AppState, JsonElement, CancellationToken, Task<AppState>> next);
}

// === 7. The schema bridge (one helper, used by AI + MCP + UI) =============
public static class SchemaBridge
{
    public static JsonNode SchemaFor(Type t) =>
        JsonSerializerOptions.Default.GetJsonSchemaAsNode(t, new JsonSchemaExporterOptions {
            TreatNullObliviousAsNonNullable = true,
            TransformSchemaNode = (ctx, node) => {
                var provider = (ICustomAttributeProvider?)ctx.PropertyInfo?.AttributeProvider
                               ?? ctx.TypeInfo.Type;
                var desc = provider.GetCustomAttributes(typeof(DescriptionAttribute), true)
                                   .OfType<DescriptionAttribute>().FirstOrDefault();
                if (desc is not null && node is JsonObject obj) obj["description"] = desc.Description;
                return node;
            }
        });
}

// === 8. Expose the SAME registry as AI tools AND MCP tools =================
public static class CommandSurfaces
{
    public static ChatOptions AsChatOptions(this ICommandRegistry r, AppState state) => new() {
        Tools = r.All.Values
                 .Select(c => AIFunctionFactory.Create(
                     method: async args => {
                         var elem = JsonSerializer.SerializeToElement(args);
                         return await r.DispatchAsync(state, c.Id, elem, default);
                     },
                     name: c.Id,
                     description: c.Description ?? c.Title))
                 .Cast<AITool>().ToList()
    };
}

// In Program.cs — register the AI client, then expose via MCP
builder.Services.AddSingleton<ICommandRegistry, CommandRegistry>();
builder.Services.AddSingleton(sp => sp.GetRequiredService<ICommandRegistry>()
                                      .AsChatOptions(/* state ref */));
builder.Services.AddMcpServer()
                .WithHttpTransport()
                .WithTools(/* same list, adapted to McpServerTool.Create */);
```

This is the journal's pattern in C#: **one `CommandRecord` defined once, surfaced through MEAI for LLM tool-calling and through MCP for external clients, with the schema bridge as the only piece of glue.**

---

## 4. The Strangler Fig Migration in C#

The journal's wrap → enrich → extract phases map onto a well-known .NET migration playbook combining **YARP** (Yet Another Reverse Proxy, MIT, MS-maintained) and **System.Web Adapters** for ASP.NET-Framework cases, plus **branch-by-abstraction** for in-proc cases [35][36][37].

### Phase 1 — Wrap

Wrap existing service methods as commands without touching their signatures. The simplest approach is a thin adapter:

```csharp
public sealed class LegacyOrderServiceAdapter(LegacyOrderService legacy) {
    public static CommandRecord Submit { get; } = new(
        Id: "orders.submit",
        Title: "Submit Order",
        Description: "Submits an order for processing.",
        ParamsType: typeof(SubmitOrderParams),
        JsonSchema: SchemaBridge.SchemaFor(typeof(SubmitOrderParams)),
        Handler: (state, p, ct) => /* call legacy.SubmitOrder(...) and project to AppState */);
}
```

No legacy code changes; the registry now has a new entry.

### Phase 2 — Enrich

Add **C# attributes** to the legacy methods themselves and have a Roslyn source generator emit the `CommandRecord` registration at compile time. This avoids the "data, not code" inner-platform-effect risk by keeping the metadata declarative and inspectable by tooling:

```csharp
[Command(Id = "orders.submit", Category = "orders", Icon = "📦")]
[CommandDescription("Submits an order for processing.")]
public Task<OrderResult> SubmitOrderAsync([Description("Customer ID")] Guid customerId,
                                          [Description("Line items")]   IReadOnlyList<OrderLine> lines,
                                          CancellationToken ct) { /* … */ }
```

A small `IIncrementalGenerator` scans for `[Command]`, generates `Add<commandName>Command(this IServiceCollection)`, and emits a `CommandRecord` instance with its schema baked in (this also resolves the AOT concerns from §2.1 and §2.2 because the schema is *string-literal* code, no runtime reflection).

### Phase 3 — Extract

Once a critical mass of commands flows through the registry, you can replace the legacy method's body with a thin shim that simply dispatches to the registry. Then move the registry (and its handlers) into its own assembly and version it independently.

### HTTP-level techniques

For **ASP.NET (Framework → Core)** migration, use the official `Microsoft.AspNetCore.SystemWebAdapters` pattern: a new ASP.NET Core 10 host wraps `Yarp.ReverseProxy` and routes anything-not-yet-migrated to the legacy framework app [37]. Per-endpoint migration to the new command registry happens behind the proxy. Externalize session state (Redis) before the YARP hop or sessions break.

### Feature flagging the new surfaces

`Microsoft.FeatureManagement` lets you keep the new command-palette UI, MCP server, and AI tools dark in production until you flip a flag. Combine with `FeatureGate` filters on minimal-API endpoints so an entire surface (`/mcp`, `/commands`) returns 404 when disabled.

### Zero downtime

- Blue/green deploy via the YARP facade.
- Use the new registry as a *parallel-run* layer: send each command to *both* legacy and new, compare outputs, return legacy. After N days of zero diffs, flip the proxy.

---

## 5. Metadata Mechanism and Guardrails

| Mechanism | AOT/trim | Startup cost | Discoverability | Aligns with "data, not code" |
|---|---|---|---|---|
| **Attributes + runtime reflection** (`typeof().GetCustomAttributes(...)`) | ❌ emits IL2026/IL3050; needs `[DynamicallyAccessedMembers]` everywhere | Pay-on-startup (assembly scan) | Easy at runtime, opaque at design time | ✅ The attribute *is* declarative metadata |
| **Roslyn source generators (`IIncrementalGenerator`)** | ✅ Fully AOT-safe; generated code is just C# | ~Zero (everything is compile-time) | Visible in IDE as generated files; great for diagnostics | ✅ Generated `CommandRecord` instances are pure data |

**Recommendation for the registry:** prefer **source generators**. The same `[Command(Id=...)]` attributes drive both: at design time, the generator produces the registry; at runtime, no reflection is needed. This matches the journal's guardrail "metadata is data, not code" because the generator only *transcribes* attribute values into a record instance — it never executes them.

**Flat-registry enforcement:** the generator should emit a `partial class GeneratedCommandRegistry` whose `All` dictionary is the *only* place commands live. Any nested or hierarchical command shape should be rejected by an analyzer-with-a-diagnostic — this is .NET's idiomatic way to enforce architectural guardrails.

**Inner-platform-effect risk:** the danger in .NET is heavier than in TypeScript, because .NET's mediator culture (MediatR + pipeline behaviors + decorators + handlers + notifications) trends toward reimplementing ASP.NET-style middleware *inside* the command registry. Keep the rule from the journal: **command behavior should be a function of `(state, params) → state`**, and middleware should be small and listable. Resist the urge to define `ICommandHandler<TRequest, TResponse>` generic constraints that pull in DI lifetimes (`IServiceScope`, `IUnitOfWork`, …) — those are infrastructure concerns, not journal-pattern primitives.

---

## 6. Ecosystem Health

| Library | NuGet | Latest (May 2026) | License | TFM | AOT | Maintenance | Gotchas |
|---|---|---|---|---|---|---|---|
| `System.Text.Json` | first-party | 10.x | MIT | net8/9/10 | ✅ with source-gen ctx | Active (MS) | Reflection overloads emit IL2026/IL3050; no `title`/`description` by default |
| `Microsoft.Extensions.AI` | `Microsoft.Extensions.AI` | **10.6.0** (5 May 2026) | MIT | net8+, netstandard2.0, netfx4.6.2+ | ⚠️ `AIFunctionFactory.Create` uses reflection | Active (MS) | Schema generation calls into STJ defaults; for AOT, hand-build `AIFunction` with pre-computed schema |
| `ModelContextProtocol` | `ModelContextProtocol` | 1.x (GA 5 Mar 2026) | MIT | net8+ | ⚠️ `WithToolsFromAssembly` uses reflection | Active (MS + Anthropic) | Use `WithTools<T>()` for AOT; log to stderr in stdio servers |
| `MediatR` | `MediatR` | 13/14.x | **RPL-1.5 + commercial** (Community free for orgs <$5 M revenue *and* <$10 M outside capital; gov't excluded) [10] | net8+, netfx4.x | ❌ | Active (Lucky Penny SW) | Licence-key registration required; audit revenue *and* capital thresholds |
| `martinothamar/Mediator` | `Mediator.SourceGenerator`, `Mediator.Abstractions` | **3.0.2 / 3.0.1 stable (22 Mar 2026); 3.1.0-rc.1 prerelease** | MIT | netstandard2.0, net8 | ✅ | Active | Configuration is compile-time; no generic requests/notifications support |
| `Wolverine` | `WolverineFx` | 5/6 alpha | MIT (paid support) | net8+ | Partial | Active (JasperFx) | Convention-based; bigger than an in-proc registry needs |
| `Brighter` | `Paramore.Brighter` | 10.4.x | MIT | netstandard2.0, net8/9/10 | ❌ | Active (Brighter org) | Best when you also need transports (Kafka/SNS/RMQ) |
| `MassTransit` | `MassTransit` (v8 OSS, v9 commercial via Massient, Inc.) | v8 (OSS, maintained ≥ end of 2026) / v9 (commercial; 100% discount for orgs <$1 M annual revenue) | Apache-2.0 v8, **commercial v9** [14] | net8+ | ❌ | Active | v9 prod use requires a Massient licence |
| `FluentValidation` | `FluentValidation` | **12.1.1 (3 Dec 2025)** | **Apache-2.0** | net8+ (v12 dropped older TFMs) | Limited | Active (Jeremy Skinner) | v12 has no new features — pure cleanup release; pin <12 if you still need netstandard2.0 |
| `NJsonSchema` | `NJsonSchema` | 11.6.x | MIT | netstandard2.0 | Limited | Active (Rico Suter) | Depends on `Newtonsoft.Json` |
| `JsonSchema.Net.Generation` | `JsonSchema.Net.Generation` | 7.3.x | MIT | netstandard2.0, net8+ | ✅ via source-gen | Active (Greg Dennis) | Use the source generator for AOT |
| `Newtonsoft.Json.Schema` | `Newtonsoft.Json.Schema` | 3.0.x | **AGPL-3.0 + commercial** (1000-ops/hour throttle when unlicensed) [19][20] | netstandard2.0 | ❌ | Active | Per-developer commercial price; avoid unless already licensed |
| `CommunityToolkit.Mvvm` | `CommunityToolkit.Mvvm` | 8.3.x | MIT | net8+, netstandard2.0 | ✅ | Active (MS Comm Toolkit) | `[RelayCommand]`-annotated types must be `partial` |
| `System.CommandLine` | `System.CommandLine` | 2.0.0 (Nov 2025) | MIT | net8+, netstandard2.0 | ✅ | Active (MS) | Sub-packages discontinued; SetHandler → SetAction |
| `Spectre.Console.Cli` | `Spectre.Console.Cli` | 0.49.x | MIT | net8+ | ✅ | Active | Richer interactive UI than `System.CommandLine` |
| `Microsoft.FeatureManagement` | `Microsoft.FeatureManagement(.AspNetCore)` | 4.x | MIT | net8+ | ✅ | Active (MS) | `IVariantFeatureManagerSnapshot` for per-request consistency |
| `CsCheck` | `CsCheck` | 4.6.x (Mar 2026) | Apache-2.0 | net8+ | "close to AOT compatible" | Active (Anthony Lloyd) | No reflection; C#-idiomatic |
| `FsCheck` | `FsCheck`, `FsCheck.Xunit` | 3.3.x | BSD-3-Clause | netstandard2.0 | Limited | Active | Pulls `FSharp.Core`; 3.x has fluent C# API |
| `YARP` | `Yarp.ReverseProxy` | 2.x | MIT | net8+ | ✅ | Active (MS) | Externalize session state before adding the proxy hop |
| `McMaster.NETCore.Plugins` | `McMaster.NETCore.Plugins` | 2.x | Apache-2.0 | net8+ | ⚠️ requires careful shared-types config | Maintained (community fork) | Use `isUnloadable: true` only when you really need hot-reload |

### JSON Schema features that do **not** round-trip cleanly

- **Top-level reference-type nullability** — STJ cannot distinguish `Person` from `Person?` at runtime; default exporter emits `["object", "null"]` for top-level types. Set `TreatNullObliviousAsNonNullable = true` to force non-nullable [3][7].
- **Generic member nullability** — `List<string?>` vs `List<string>` is invisible to reflection; the exporter cannot enforce it.
- **`description` / `title`** — `JsonSchemaExporter` does not emit them by default. Use the `TransformSchemaNode` delegate to lift from `[Description]`.
- **`format` keyword** — STJ does not emit `format: "email"` / `"date-time"` / `"uri"` by default; you must inject via `TransformSchemaNode` based on type.
- **Polymorphism** — STJ's polymorphic discriminator (`$type`, configured via `[JsonDerivedType]`) becomes an `anyOf` / `oneOf` schema with a discriminator property; verify your MCP client supports it.
- **Cyclic types** — emitted as `$ref` to `$defs` entries; some older JSON-Schema validators do not chase `$ref` correctly.
- **`required` for constructor parameters** — `RespectRequiredConstructorParameters = true` flips the default of "optional ctor parameter ⇒ optional schema property"; verify your handlers don't rely on the legacy behavior.

---

## What a Skill-Building Agent Should Know — the Actionable Distillation (in priority order)

1. **The `CommandRecord` shape already exists in modern .NET — it's `Microsoft.Extensions.AI.AIFunction`.** The MCP SDK's `McpClientTool` *inherits* from it. Build the registry around `AIFunction`, not around `IRequest<TResponse>`.
2. **Use `System.Text.Json.JsonSchemaExporter` (.NET 9+) for the schema bridge.** It is the only option whose schema matches what the runtime serializer accepts. Add a `TransformSchemaNode` delegate to inject `description` from `[Description]`.
3. **Do *not* default to MediatR in 2026.** It is **RPL-1.5 + commercial** since 2 July 2025 (Lucky Penny Software); the Community tier excludes orgs ≥ $5 M revenue, ≥ $10 M raised, and any government agency. For new code, prefer a hand-rolled DI-backed registry, or `martinothamar/Mediator` 3.x (MIT, source-gen, AOT).
4. **For metadata: attributes + a Roslyn `IIncrementalGenerator`, not reflection.** This is the only path that is AOT/trim-safe, has zero startup cost, and produces inspectable data that survives "data, not code" review.
5. **Model state as `record` + `required` + nullable reference types.** Validate with FluentValidation 12 (Apache-2.0, 12.1.1 of 3 Dec 2025); `DataAnnotations` if you want validations to ride along into the JSON Schema.
6. **Three NuGet packages, one definition, two AI surfaces:** `Microsoft.Extensions.AI` 10.6.0 for IChatClient/tool-calling, `ModelContextProtocol` (+ `.AspNetCore`) 1.x for MCP server, and your own registry to bridge.
7. **The CLI is also a command surface.** `System.CommandLine` 2.0 went GA on 11 Nov 2025; use `RootCommand` + `SetAction`. Do not pull in the discontinued `.Hosting`/`.NamingConventionBinder`/`.Rendering` packages.
8. **Desktop palette = `CommunityToolkit.Mvvm` `[RelayCommand]`-generated `ICommand`s that delegate to the registry.** Keep the XAML `ICommand` instances as a thin adapter, not the source of truth.
9. **Plugin/extension surface = `AssemblyLoadContext` + `AssemblyDependencyResolver`.** Register plugin types **by contract interface**; keep contracts in the *default* ALC. Use `McMaster.NETCore.Plugins` if you don't want to write the dance yourself.
10. **Strangler fig: YARP + ASP.NET Core 10 + `Microsoft.AspNetCore.SystemWebAdapters` for the HTTP path; branch-by-abstraction for the in-proc path. Feature-flag every new surface with `Microsoft.FeatureManagement`.**
11. **Watch the AOT warnings.** `AIFunctionFactory.Create`, MCP `WithToolsFromAssembly`, and STJ's reflection-mode exporter all emit **IL2026** / **IL3050**. For AOT builds, hand-build `AIFunction`s with pre-computed JSON-schema strings and a source-gen `JsonSerializerContext`.
12. **For tests, prefer `xUnit` + `CsCheck` (Apache-2.0, no reflection, C#-idiomatic).** Use `FsCheck` 3.x if you live in mixed C#/F# codebases.
13. **Pin `FluentAssertions` to `[7.0.0]` or use `AwesomeAssertions`.** v8+ switched to the **Xceed Community License** (paid for commercial use). This is the most-confused-with-FluentValidation gotcha in the ecosystem.
14. **Do not pick `Newtonsoft.Json.Schema` for a new project** unless your org already has commercial licences — it is **AGPL-3.0 + commercial**, with a 1000-ops-per-hour throttle when unregistered.
15. **MassTransit v9 is no longer free for commercial production use.** It is now sold under Massient, Inc. — orgs with under $1 M USD annual gross revenue qualify for a 100% discount; everyone else pays. v8 (Apache-2.0) remains officially maintained at least through the end of 2026 if you need a free option.

## References

[1] Jimmy Bogard, "AutoMapper and MediatR Commercial Editions Launch Today", *jimmybogard.com*. https://www.jimmybogard.com/automapper-and-mediatr-commercial-editions-launch-today/
[2] LuckyPennySoftware/MediatR Discussion #1105, "MediatR is going commercial". https://github.com/LuckyPennySoftware/MediatR/discussions/1105
[3] Microsoft Learn, "JSON schema exporter — .NET". https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/extract-schema
[4] Microsoft Learn, "AIFunctionFactory Class (Microsoft.Extensions.AI)". https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.aifunctionfactory
[5] *DevBlogs*, "Release v1.0 of the official MCP C# SDK". https://devblogs.microsoft.com/dotnet/release-v10-of-the-official-mcp-csharp-sdk/
[6] Oleg Kyrylchuk, "What's new in System.Text.Json in .NET 9". https://okyrylchuk.dev/blog/whats-new-in-system-text-json-in-dotnet-9/
[7] *DevBlogs*, "What's new in System.Text.Json in .NET 9". https://devblogs.microsoft.com/dotnet/system-text-json-in-dotnet-9/
[8] NuGet, "FluentValidation 12.1.1". https://www.nuget.org/packages/fluentvalidation/
[9] *DEVCLASS*, "Another open source project shifts to restrictive license: Fluent Assertions following Xceed partnership". https://www.devclass.com/development/2025/01/16/another-open-source-project-shifts-to-restrictive-license-fluent-assertions-following-xceed-partnership/1621343
[10] Dariusz Woźniak, "MediatR" (FOSSed). https://dariusz-wozniak.github.io/fossed/library/mediatr
[11] martinothamar/Mediator, README. https://github.com/martinothamar/Mediator
[12] JasperFx/wolverine, README. https://github.com/JasperFx/wolverine
[13] BrighterCommand/Brighter, README. https://github.com/BrighterCommand/Brighter
[14] Babayevqocheli, "Wolverine for .NET Microservices: The Best MassTransit Alternative?", *Medium*. https://medium.com/@babayevqocheli/wolverine-for-net-microservices-the-best-masstransit-alternative-571f9ef08fa2
[15] Microsoft Learn, "How to use source generation in System.Text.Json". https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
[16] elmah.io, "What's new in .NET 9: System.Text.Json improvements". https://blog.elmah.io/whats-new-in-net-9-system-text-json-improvements/
[17] RicoSuter/NJsonSchema, README. https://github.com/RicoSuter/NJsonSchema
[18] json-everything docs, "Generating JSON Schema from .Net Types". https://docs.json-everything.net/schema/schemagen/schema-generation/
[19] Newtonsoft, "Json.NET Schema — pricing". https://www.newtonsoft.com/store/jsonschema
[20] JamesNK/Newtonsoft.Json.Schema, "LicenseHelpers.cs" (1000 ops/hour throttle). https://github.com/JamesNK/Newtonsoft.Json.Schema/blob/master/Src/Newtonsoft.Json.Schema/Infrastructure/Licensing/LicenseHelpers.cs
[21] dotnet/command-line-api, "Announcing System.CommandLine 2.0.0-beta5 and our path to a stable release". https://github.com/dotnet/command-line-api/issues/2576
[22] Nate McMaster, ".NET Core Plugins". https://natemcmaster.com/blog/2018/07/25/netcore-plugins/
[23] Microsoft Learn, "AI tool calling — .NET". https://learn.microsoft.com/en-us/dotnet/ai/conceptual/calling-tools
[24] dotnet/extensions, `AIFunctionFactory.cs`. https://github.com/dotnet/extensions/blob/main/src/Libraries/Microsoft.Extensions.AI.Abstractions/Functions/AIFunctionFactory.cs
[25] modelcontextprotocol/csharp-sdk Releases. https://github.com/modelcontextprotocol/csharp-sdk/releases
[26] MCP C# SDK Getting Started. https://csharp.sdk.modelcontextprotocol.io/concepts/getting-started.html
[27] DeepWiki, "Server Tools — modelcontextprotocol/csharp-sdk". https://deepwiki.com/modelcontextprotocol/csharp-sdk/2.1-server-tools
[28] Microsoft Learn, "RelayCommand attribute — Community Toolkits for .NET". https://learn.microsoft.com/en-us/dotnet/communitytoolkit/mvvm/generators/relaycommand
[29] Pieterjan De Clippel, "Microsoft just released System.CommandLine — And I made it even easier to use" (Nov 2025), *Medium*. https://pieterjandeclippel.medium.com/microsoft-just-released-system-commandline-and-i-made-it-even-easier-to-use-5a0193e97162
[30] Microsoft Learn, "Create a .NET Core application with plugins". https://learn.microsoft.com/en-us/dotnet/core/tutorials/creating-app-with-plugin-support
[31] *Dev Leader*, "Plugin Loading in .NET: AssemblyLoadContext with Dependency Injection". https://www.devleader.ca/2026/04/09/plugin-loading-in-net-assemblyloadcontext-with-dependency-injection
[32] Microsoft Learn, "Microsoft.Extensions.AI libraries". https://learn.microsoft.com/en-us/dotnet/ai/microsoft-extensions-ai
[33] Microsoft Learn, ".NET Feature Flag Management — Azure App Configuration". https://learn.microsoft.com/en-us/azure/azure-app-configuration/feature-management-dotnet-reference
[34] *DevBlogs*, "Announcing .NET 10". https://devblogs.microsoft.com/dotnet/announcing-dotnet-10/
[35] Trailhead Tech, "Migrating Your Legacy ASP.NET Projects to ASP.NET Core Incrementally with YARP". https://trailheadtechnology.com/migrating-legacy-asp-net-to-asp-net-core-incrementally-with-yarp/
[36] Code Maze, "Strangler Fig Architectural Pattern in C#". https://code-maze.com/csharp-strangler-fig-architectural-pattern/
[37] *DevBlogs*, "Incremental ASP.NET to ASP.NET Core Migration". https://devblogs.microsoft.com/dotnet/incremental-asp-net-to-asp-net-core-migration/