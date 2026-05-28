---
name: acture-dotnet-greenfield
description: Concrete, file-by-file walk-through for standing up a command-dispatch layer in a NEW C# / .NET project. Covers the state model (`record` + `required` + nullable refs), the `[Command]` attribute, a project-owned `CommandRegistry` registered through `IServiceCollection`, the schema bridge built on `System.Text.Json.Schema.JsonSchemaExporter` with a `TransformSchemaNode` delegate that lifts `[Description]` into the JSON Schema, the first CLI surface (`System.CommandLine` 2.0), the projection helpers that expose the same registry as `Microsoft.Extensions.AI` tools AND `ModelContextProtocol` server tools, and xUnit + `CsCheck` architecture tests. Use after `acture-dotnet` once the project has chosen the greenfield path. Triggers on "new C# project with commands", "set up .NET command registry from scratch", "C# greenfield acture", "first .NET command", "wire MEAI tools from scratch", "wire MCP server from scratch", "JsonSchemaExporter description transform", "AIFunction registry", "source-generated command registry C#".
---

# acture .NET greenfield — bootstrapping a new C# / .NET project

A greenfield .NET engagement designs command dispatch in from the start. This skill is the concrete walk-through. It assumes:

- You read **`acture-dotnet`** first — the three-primitive mapping, the AOT-vs-reflection axis, the canonical `[Command]` attribute shape, and the "do not pick MediatR in 2026 unless your org qualifies" guardrail come from there.
- The project chose the greenfield path on Dimension 1. (For an existing codebase, load **`acture-dotnet-strangler`** instead.)
- Target framework is **.NET 10 LTS** (released 11 Nov 2025, supported until 10 Nov 2028). Language is **C# 14**. `System.Text.Json.Schema.JsonSchemaExporter` requires .NET 9 or newer — do **not** start a greenfield project on .NET 8 for this work; the schema-bridge story is materially worse there.

The sequence below is **State model → Registry primitive → First command → Schema bridge → CLI surface → MEAI / MCP projection → Tests**. It mirrors `acture-greenfield-bootstrap`'s TS walk-through, projected onto .NET idiom.

## Step 0 — Project + NuGet dependencies

The vanilla / framework-agnostic core (ASP.NET Core, MAUI, and WPF adapt — see `acture-dotnet` for the variants):

```bash
dotnet new console -n MyApp -f net10.0
cd MyApp
dotnet add package Microsoft.Extensions.AI
dotnet add package Microsoft.Extensions.Hosting
dotnet add package Microsoft.Extensions.DependencyInjection
dotnet add package ModelContextProtocol
dotnet add package System.CommandLine            # 2.0.0+
dotnet add package FluentValidation              # 12.1.1+
dotnet add package Microsoft.FeatureManagement
dotnet add package --version "[7.0.0]" FluentAssertions   # pin v7 — v8+ is paid
```

For tests:

```bash
dotnet new xunit -n MyApp.Tests
dotnet add MyApp.Tests package CsCheck           # Apache-2.0, no reflection, AOT-friendly
dotnet add MyApp.Tests package Microsoft.NET.Test.Sdk
dotnet add MyApp.Tests package xunit
dotnet add MyApp.Tests package xunit.runner.visualstudio
```

Do **not** add `MediatR`, `Newtonsoft.Json.Schema`, `Fluent Assertions ≥ 8`, or `MassTransit ≥ 9` "to be ready later". `acture-dotnet` §"Library choices that have changed" covers why. Do **not** add `ModelContextProtocol.AspNetCore` yet — it is a surface dependency, added per surface in Step 7+.

## Step 1 — Design the state model

Before any command exists, decide what state exists. The state model is **owned by the project**, not by any library. The constraints from `acture-greenfield-state-model` apply identically: deterministic id generation, schema-described, separable into slices.

Modern C# gives you most of it for free:

```csharp
// src/Domain/Filter/FilterState.cs
namespace MyApp.Domain.Filter;

public enum FilterOperator { Equals, NotEquals, GreaterThan, LessThan, Contains }

public sealed record FilterState
{
    public required string Column { get; init; }
    public required FilterOperator Op { get; init; }
    public string? Value { get; init; }                  // explicitly optional
    public IReadOnlyList<string> Tags { get; init; } = [];
}

public sealed record AppState(IReadOnlyList<FilterState> Filters)
{
    public static AppState Empty { get; } = new([]);
}
```

Three .NET-specific notes:

- **`record` gives value-equality and `with`-expressions** — cheap state derivation, no manual `Equals` plumbing.
- **`required` is enforced both by the C# compiler *and* by `System.Text.Json`** when you set `RespectRequiredConstructorParameters = true` (or use `init` properties as shown above).
- **Nullable annotations flow into the JSON Schema's `required` array** when you set `RespectNullableAnnotations = true` on `JsonSchemaExporterOptions` (.NET 9+).

The state model is *not* an attribute target. Do not put `[Command]` on `FilterState` or `AppState`. Commands are intents; entities/values are state — see `acture-hard-donts` and `acture-dotnet`'s "What NOT to do".

## Step 2 — Author the `[Command]` attribute (project-owned)

This is the metadata primitive. Keep it in the project, not in a dependency. ~15 lines:

```csharp
// src/Acture/CommandAttribute.cs
namespace MyApp.Acture;

[AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
public sealed class CommandAttribute : Attribute
{
    public required string Id      { get; init; }
    public required string Title   { get; init; }
    public string  Category        { get; init; } = "general";
    public string? Description     { get; init; }
    public string? Icon            { get; init; }
    public string? Hotkey          { get; init; }
    public string? When            { get; init; }
    public bool    RequiresConfirmation { get; init; }
}
```

Resist the temptation to add a `HandlerType` field. The handler is the class itself — the registry resolves it through reflection or the source generator. Adding a `HandlerType` argument would let two sources of truth disagree.

## Step 3 — Define the handler contract and the `CommandRecord`

The journal's `CommandRecord` shape. Project-owned, ~20 lines. Note `JsonSchema` is `JsonNode` (the STJ DOM type) — this is what `JsonSchemaExporter` emits and what the MEAI / MCP surfaces consume.

```csharp
// src/Acture/CommandRecord.cs
namespace MyApp.Acture;
using System.Text.Json.Nodes;

public sealed record CommandRecord(
    string  Id,
    string  Title,
    string  Category,
    string? Description,
    string? Icon,
    string? Hotkey,
    string? When,
    bool    RequiresConfirmation,
    Type    ParamsType,
    JsonNode JsonSchema,
    Func<AppState, JsonElement, CancellationToken, Task<AppState>> Handler);

// src/Acture/ICommandHandler.cs
namespace MyApp.Acture;

public interface ICommandHandler<TParams>
{
    Task<AppState> HandleAsync(AppState state, TParams parameters, CancellationToken ct);
}
```

The handler contract is intentionally `(state, params, ct) → Task<state>`. No DI lifetimes baked into the generic constraint; no `IUnitOfWork` / `IServiceScope`. Those are infrastructure concerns — inject them at the handler's constructor if needed. The journal's primitive is `(state, params) → state`.

## Step 4 — Build the schema bridge (with the `[Description]` lift)

This is the .NET-specific gotcha. `System.Text.Json.Schema.JsonSchemaExporter` is excellent but **does not emit `description` / `title` by default**. The fix is a `TransformSchemaNode` delegate that lifts `[Description]` attributes into the schema. ~25 lines, project-owned:

```csharp
// src/Acture/SchemaBridge.cs
namespace MyApp.Acture;
using System.ComponentModel;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;

public static class SchemaBridge
{
    private static readonly JsonSchemaExporterOptions ExporterOptions = new()
    {
        TreatNullObliviousAsNonNullable = true,
        TransformSchemaNode = (ctx, node) =>
        {
            ICustomAttributeProvider? provider =
                ctx.PropertyInfo?.AttributeProvider
                ?? ctx.TypeInfo.Type;

            var desc = provider
                .GetCustomAttributes(typeof(DescriptionAttribute), inherit: true)
                .OfType<DescriptionAttribute>()
                .FirstOrDefault();

            if (desc is not null && node is JsonObject obj)
                obj["description"] = desc.Description;

            return node;
        }
    };

    public static JsonNode SchemaFor(Type t) =>
        JsonSerializerOptions.Default.GetJsonSchemaAsNode(t, ExporterOptions);
}
```

That delegate is the **single most important 25-line block in the entire greenfield setup**. Without it, the AI surface sees a schema without descriptions and the LLM picks the wrong tool more often. The same delegate handles `format: "email"` / `"date-time"` if you choose to add it later.

For AOT builds, `SchemaFor` becomes a switch on a `JsonSerializerContext` (source-generated). Until then, the reflection-mode call above suppresses IL2026 via a `[RequiresUnreferencedCode]` annotation on the calling method — apply this attribute, do not silence the warning globally.

## Step 5 — Build the `CommandRegistry`

A flat `IReadOnlyDictionary<string, CommandRecord>`, populated by DI. ~100 lines, project-owned. Two paths to populate it:

- **Reflection path** (the cheaper start): a startup pass scans `Assembly.GetExecutingAssembly()` for `[Command]`-tagged classes, calls `SchemaBridge.SchemaFor` once per handler at registration time, and stores the `CommandRecord` in the registry.
- **Source-generator path** (the AOT/trim-safe destination): a `Roslyn.IIncrementalGenerator` emits a `partial GeneratedCommandRegistry.All` dictionary at compile time, with pre-computed schema strings.

Start with the reflection path. The migration to source generation is a separate, mechanical refactor once command count justifies it.

```csharp
// src/Acture/ICommandRegistry.cs
namespace MyApp.Acture;
using System.Text.Json;

public interface ICommandRegistry
{
    IReadOnlyDictionary<string, CommandRecord> All { get; }
    Task<AppState> DispatchAsync(AppState state, string id,
                                 JsonElement parameters, CancellationToken ct);
}
```

```csharp
// src/Acture/CommandRegistry.cs
namespace MyApp.Acture;
using System.Reflection;
using System.Text.Json;

public sealed class CommandRegistry : ICommandRegistry
{
    public IReadOnlyDictionary<string, CommandRecord> All { get; }

    public CommandRegistry(IEnumerable<CommandRecord> commands)
    {
        var byId = new Dictionary<string, CommandRecord>(StringComparer.Ordinal);
        foreach (var c in commands)
        {
            if (!byId.TryAdd(c.Id, c))
                throw new InvalidOperationException($"Duplicate command id: {c.Id}");
        }
        All = byId;
    }

    public Task<AppState> DispatchAsync(AppState s, string id,
                                        JsonElement p, CancellationToken ct)
    {
        if (!All.TryGetValue(id, out var cmd))
            throw new KeyNotFoundException($"Unknown command: {id}");
        return cmd.Handler(s, p, ct);
    }
}

public static class CommandRegistryServices
{
    public static IServiceCollection AddActureCommandsFromAssembly(
        this IServiceCollection services, Assembly assembly)
    {
        foreach (var type in assembly.GetTypes())
        {
            var attr = type.GetCustomAttribute<CommandAttribute>();
            if (attr is null) continue;

            var (paramsType, invoker) = ResolveHandlerContract(type);
            services.AddSingleton(type);                       // handler itself
            services.AddSingleton(sp => Build(sp, type, attr, paramsType, invoker));
        }
        services.AddSingleton<ICommandRegistry, CommandRegistry>();
        return services;
    }

    private static CommandRecord Build(IServiceProvider sp, Type handlerType,
        CommandAttribute attr, Type paramsType,
        Func<object, AppState, JsonElement, CancellationToken, Task<AppState>> invoke)
    {
        var handler = sp.GetRequiredService(handlerType);
        return new CommandRecord(
            Id: attr.Id, Title: attr.Title, Category: attr.Category,
            Description: attr.Description, Icon: attr.Icon, Hotkey: attr.Hotkey,
            When: attr.When, RequiresConfirmation: attr.RequiresConfirmation,
            ParamsType: paramsType,
            JsonSchema: SchemaBridge.SchemaFor(paramsType),
            Handler: (s, p, ct) => invoke(handler, s, p, ct));
    }

    private static (Type, Func<object, AppState, JsonElement, CancellationToken, Task<AppState>>)
        ResolveHandlerContract(Type handlerType)
    {
        // Handler must implement ICommandHandler<TParams> exactly once.
        var iface = handlerType.GetInterfaces()
            .SingleOrDefault(i => i.IsGenericType &&
                                  i.GetGenericTypeDefinition() == typeof(ICommandHandler<>))
            ?? throw new InvalidOperationException(
                $"{handlerType.FullName} must implement ICommandHandler<TParams>");
        var paramsType = iface.GetGenericArguments()[0];

        Func<object, AppState, JsonElement, CancellationToken, Task<AppState>> invoke =
            async (handler, state, json, ct) =>
            {
                var p = JsonSerializer.Deserialize(json.GetRawText(), paramsType)
                        ?? throw new InvalidOperationException("Null params");
                var method = iface.GetMethod(nameof(ICommandHandler<object>.HandleAsync))!;
                var task = (Task<AppState>)method.Invoke(handler, new[] { state, p, (object)ct })!;
                return await task;
            };
        return (paramsType, invoke);
    }
}
```

Three structural choices worth calling out:

- **Duplicate-id detection in the constructor.** Enforce it from the first command — silent shadowing is the #1 way a flat registry decays into chaos.
- **The handler is required to implement `ICommandHandler<TParams>` exactly once.** This is the contract that lets architecture tests (Step 9) catch drift in CI.
- **JSON Schema is generated once at registration time**, not on every dispatch. The reflection-mode call to `JsonSchemaExporter` costs ~100 µs per type; the registry is the cache.

## Step 6 — Author the first command

One file per command. The handler class is the unit of registration:

```csharp
// src/Acture/Commands/Filter/ApplyFilterParams.cs
namespace MyApp.Acture.Commands.Filter;
using System.ComponentModel;
using MyApp.Domain.Filter;

public sealed record ApplyFilterParams(
    [property: Description("Column name to filter on")]
    string Column,
    [property: Description("Comparison operator")]
    FilterOperator Op,
    [property: Description("Right-hand value (optional for IsNull / IsNotNull)")]
    string? Value);
```

```csharp
// src/Acture/Commands/Filter/ApplyFilterHandler.cs
namespace MyApp.Acture.Commands.Filter;
using MyApp.Domain.Filter;

[Command(Id = "app.data.applyFilter",
         Title = "Apply Filter",
         Category = "data",
         Hotkey = "ctrl+shift+f",
         Description = "Filter the active dataset by a column condition.")]
public sealed class ApplyFilterHandler : ICommandHandler<ApplyFilterParams>
{
    public Task<AppState> HandleAsync(AppState state, ApplyFilterParams p, CancellationToken ct)
    {
        var next = state with
        {
            Filters = [..state.Filters,
                       new FilterState { Column = p.Column, Op = p.Op, Value = p.Value }]
        };
        return Task.FromResult(next);
    }
}
```

Registration happens once at host build:

```csharp
// Program.cs
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddActureCommandsFromAssembly(typeof(Program).Assembly);
builder.Services.AddSingleton(AppState.Empty);   // or a state holder
var app = builder.Build();
```

## Step 7 — Bring up the CLI surface first

CLI is the cheapest surface to validate the registry contract — no HTTP, no MCP, no schema-form rendering. `System.CommandLine` 2.0 (GA 11 Nov 2025) uses `RootCommand` + `SetAction`. The single CLI binding delegates to the registry:

```csharp
// Program.cs (continued)
using System.CommandLine;
using System.Text.Json;

var idArg     = new Argument<string>("id")     { Description = "Command id to dispatch." };
var paramsOpt = new Option<string>("--params") { Description = "JSON params object.", DefaultValueFactory = _ => "{}" };

var root = new RootCommand("Dispatch a registered command by id");
root.Arguments.Add(idArg);
root.Options.Add(paramsOpt);

root.SetAction(async parse =>
{
    var registry = app.Services.GetRequiredService<ICommandRegistry>();
    var state    = app.Services.GetRequiredService<AppState>();
    var id       = parse.GetValue(idArg)!;
    var rawJson  = parse.GetValue(paramsOpt) ?? "{}";

    using var doc = JsonDocument.Parse(rawJson);
    var next = await registry.DispatchAsync(state, id, doc.RootElement, CancellationToken.None);
    Console.WriteLine(JsonSerializer.Serialize(next, new JsonSerializerOptions { WriteIndented = true }));
});

return await root.Parse(args).InvokeAsync();
```

`dotnet run -- app.data.applyFilter --params '{"Column":"age","Op":"GreaterThan","Value":"25"}'` — the registry has shipped end-to-end. Everything afterwards (MEAI tools, MCP server, Blazor / desktop palette) is "another projection over `ICommandRegistry.All`".

> Do not pull `System.CommandLine.Hosting`, `.NamingConventionBinder`, `.Rendering`, or `.DragonFruit`. They were **discontinued** before 2.0 GA.

## Step 8 — Project the registry as MEAI tools AND MCP tools

This is the .NET payoff. Because `McpClientTool` inherits from `Microsoft.Extensions.AI.AIFunction`, one projection helper feeds both surfaces.

```csharp
// src/Acture/Surfaces/AISurface.cs
namespace MyApp.Acture.Surfaces;
using Microsoft.Extensions.AI;
using System.Text.Json;

public static class AISurface
{
    public static IList<AITool> ToolsFor(ICommandRegistry r,
                                          Func<AppState> currentState,
                                          Action<AppState> setState) =>
        r.All.Values
            .Select(c => (AITool)AIFunctionFactory.Create(
                async (JsonElement args, CancellationToken ct) =>
                {
                    var next = await r.DispatchAsync(currentState(), c.Id, args, ct);
                    setState(next);
                    return next;
                },
                name: c.Id.Replace('.', '_'),     // OpenAI tool-name regex: [A-Za-z0-9_-]
                description: c.Description ?? c.Title))
            .ToList();
}
```

> ⚠️ **OpenAI / Anthropic tool-name regex.** Tool names must match `^[A-Za-z0-9_-]{1,64}$`. Replace `.` with `_` before sending to the model, and keep a reverse map if you need to display the original id in telemetry. (`acture` shipped this exact fix in commit 8343c90 — see the project's history for the regression test.)

For MCP, the same registry powers `app.MapMcp()` or a stdio server:

```csharp
// Program.cs (MCP surface, additive)
builder.Services.AddMcpServer()
                .WithStdioServerTransport()
                .WithTools<RegistryMcpTools>();
```

`RegistryMcpTools` is a static class whose `[McpServerTool]`-tagged methods enumerate `ICommandRegistry.All` and forward to `DispatchAsync`. For HTTP MCP, swap `WithStdioServerTransport` for `WithHttpTransport`. For AOT builds, use `WithTools<T>()` and **never** `WithToolsFromAssembly()` (IL2026).

## Step 9 — Architecture tests (xUnit + CsCheck)

Tests that enforce the registry contract structurally. Catch drift in CI long before it reaches a consumer surface.

```csharp
// tests/MyApp.Tests/RegistryContractTests.cs
using FluentAssertions;          // pinned to 7.0.0 — see acture-dotnet
using MyApp.Acture;
using Xunit;

public class RegistryContractTests
{
    [Fact]
    public void Every_command_handler_implements_ICommandHandler_exactly_once()
    {
        foreach (var t in typeof(Program).Assembly.GetTypes()
                     .Where(t => t.GetCustomAttribute<CommandAttribute>() is not null))
        {
            var ifaces = t.GetInterfaces()
                .Where(i => i.IsGenericType &&
                            i.GetGenericTypeDefinition() == typeof(ICommandHandler<>))
                .ToArray();
            ifaces.Should().HaveCount(1, $"{t.FullName} must implement ICommandHandler<> exactly once");
        }
    }

    [Fact]
    public void Command_ids_are_unique()
    {
        var ids = typeof(Program).Assembly.GetTypes()
            .Select(t => t.GetCustomAttribute<CommandAttribute>())
            .OfType<CommandAttribute>()
            .Select(a => a.Id)
            .ToArray();
        ids.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void Every_params_record_round_trips_through_STJ()
    {
        // Use the registry's reflection of paramsType to fuzz JSON schema round-trip.
        // ... fed through CsCheck.Gen.<Type>().Sample(...) per Type.
    }
}
```

The architecture tests are the **structural enforcement of the metadata-not-code guardrail**. If someone adds a `Func<...> Handler` field to `CommandAttribute`, the C# attribute grammar rejects it at compile time. If someone forgets `ICommandHandler<>`, this test fails before the registry boots.

## Step 10 — What NOT to do yet

- **Don't add `ModelContextProtocol.AspNetCore`, `Semantic Kernel`, or LangChain "to be ready later".** Surface dependencies are added per surface. Pin pre-1.0 dependencies tightly (`= 1.0.x`) when you do add them.
- **Don't write a custom validation layer.** Either `FluentValidation` 12 (for non-trivial cross-field rules) or `DataAnnotations` (for validations you want to ride into the JSON Schema). Both, never neither.
- **Don't wire a palette UI from the CLI process.** WPF / WinUI / Avalonia / Blazor are separate consumer surfaces — author them as adapters that resolve `ICommandRegistry` from DI and bind `[RelayCommand]`-generated `ICommand`s to `DispatchAsync`.
- **Don't build the `When`-clause DSL.** `When` is a *name* the host evaluates; the host owns the registry of named predicates. No string DSL until a real consumer (palette gating, AI gating) actually needs it.
- **Don't enable `Microsoft.Extensions.AI`'s structured-output features in the first release.** They depend on a working schema bridge; ship Step 8's projection first, prove it under load, then enable structured output.

## Surface activation order

Once Steps 1–9 are green, add surfaces one at a time and feature-flag each with `Microsoft.FeatureManagement`. Lowest-risk first:

1. **CLI** (Step 7) — already done.
2. **MEAI tool calling** (Step 8) — `ChatClientBuilder.UseFunctionInvocation()` with the projected tool list; ~10 lines additive.
3. **HTTP** — `app.MapGet("/commands", ...)` + `app.MapPost("/commands/{id}", ...)` minimal-API pair; ~30 lines.
4. **MCP server** — `AddMcpServer().WithStdioServerTransport().WithTools<RegistryMcpTools>()`. See `acture-mcp`.
5. **Telemetry middleware** — wrap `DispatchAsync` in `ActivitySource.StartActivity(...)`; ~15 lines.
6. **Desktop palette** — WPF / WinUI / Avalonia / MAUI: `CommunityToolkit.Mvvm` `[RelayCommand]`s that delegate to `DispatchAsync`.
7. **Blazor palette** — same `ICommandRegistry`, rendered with a `<Palette />` component bound to `All.Values`.

Each surface is a separate session and a separate PR. Do not bundle them.

## Checklist before you finish

- [ ] State model designed before any `[Command]` was authored.
- [ ] `CommandAttribute` owned by the project (not pulled from a dependency).
- [ ] `CommandRegistry` has duplicate-id detection in its constructor.
- [ ] Handlers implement `ICommandHandler<TParams>` exactly once and an architecture test enforces it.
- [ ] `SchemaBridge.SchemaFor` includes a `TransformSchemaNode` delegate that lifts `[Description]` into the JSON Schema.
- [ ] `JsonSchemaExporterOptions.TreatNullObliviousAsNonNullable = true` is set.
- [ ] JSON Schema is generated once at registration time, not at dispatch time.
- [ ] CLI surface is up and dispatches at least one command end-to-end.
- [ ] No surface dependency (`ModelContextProtocol.AspNetCore`, `Semantic Kernel`, …) was added speculatively.
- [ ] No commercial-licensed library (`MediatR ≥ v13`, `Fluent Assertions ≥ v8`, `Newtonsoft.Json.Schema`, `MassTransit ≥ v9`) was added by accident.
- [ ] Tool names sent to LLMs match `^[A-Za-z0-9_-]{1,64}$` (replace `.` with `_`).

## See also

- **`acture-dotnet`** — the foundational .NET skill; AOT-vs-reflection, library licence statuses, the AIFunction convergence, the canonical attribute shape.
- **`acture-dotnet-strangler`** — the other Dimension-1 path; use that for an existing .NET codebase.
- `acture-greenfield-state-model` — the four hard constraints on the state shape; applies to .NET records identically.
- `acture-command-record-shape` — the closed-surface discipline; the .NET `CommandAttribute` is the same closed surface.
- `acture-schema-bridge` — the cross-language schema-bridge primitive; the .NET path is the `TransformSchemaNode` delegate shown in Step 4.
- `acture-mcp` — the MCP surface; .NET uses `ModelContextProtocol` 1.x and the `app.MapMcp()` shape.
- `acture-ai` — the LLM tool-calling surface; .NET uses `Microsoft.Extensions.AI`.
- `acture-hotkeys`, `acture-palette-design`, `acture-undo`, `acture-telemetry` — surface-specific design skills; the .NET implementation lives in adapter packages described in `acture-dotnet`.
- `acture-hard-donts` — the pre-merge anti-pattern checklist.
- [`docs/research/acture_research_8 -- Command Dispatch Architecture in C# : .NET — A Tooling Report for Skill-Building Agents.md`](../../docs/research/acture_research_8%20--%20Command%20Dispatch%20Architecture%20in%20C%23%20:%20.NET%20%E2%80%94%20A%20Tooling%20Report%20for%20Skill-Building%20Agents.md) — current library versions, licence statuses, ecosystem-health table, and the end-to-end sketch in §3.2.
