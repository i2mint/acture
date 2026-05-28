---
name: acture-dotnet-strangler
description: Concrete walk-through for adopting a command-dispatch layer in an EXISTING C# / .NET codebase incrementally — the strangler-fig pattern applied to .NET services, ASP.NET controllers, MediatR handlers, and Worker services. Covers the three phases (Wrap → Enrich → Extract), the additive `[Command]` overlay on existing service methods, feature-flagged surface activation via `Microsoft.FeatureManagement`, the per-batch tempo (3–5 candidates at a time), the YARP + `Microsoft.AspNetCore.SystemWebAdapters` HTTP-level migration for ASP.NET Framework → ASP.NET Core, the MediatR escape path (when an existing project's licence status forces the move), and the deletion conditions that retire the legacy code path. Use after `acture-dotnet` once the project has chosen the strangler-fig path. Triggers on "migrate .NET to command dispatch", "strangler-fig C#", "wrap controller as command", "wrap service method as command", "escape MediatR", "MediatR licence change response", "ASP.NET Framework to ASP.NET Core acture", "YARP migration with command dispatch", "introduce command palette to existing C# app", "MEAI tools for an existing .NET service".
---

# acture .NET strangler — incremental adoption in an existing C# / .NET codebase

A strangler-fig engagement adds a command-dispatch layer **around** an existing .NET codebase without a big-bang rewrite. .NET is unusually amenable to this because:

- **Attributes are additive.** `[Command]` next to an existing class never breaks the existing call sites.
- **`IServiceCollection` makes wiring optional and cheap.** A registration pass scans `Assembly.GetExecutingAssembly()` (or any configured assembly) for `[Command]`-tagged classes; existing DI registrations are untouched.
- **`Microsoft.FeatureManagement` flags the new surface, not the registry.** Each surface (CLI, HTTP, MCP, AI, palette) is independently gated; the registry knows nothing about flags.
- **YARP + `Microsoft.AspNetCore.SystemWebAdapters` cover the ASP.NET Framework → ASP.NET Core case.** A new ASP.NET Core 10 host wraps the legacy app and routes per-endpoint as you migrate. Both are MIT, MS-maintained.
- **`McpClientTool` inherits from `AIFunction`.** Standing up MCP for the new wrapped commands does not require a separate adapter — the same projection feeds both surfaces.

This skill is the .NET-flavored counterpart to the `migration-*` track (`migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`). The phase names mirror the TS migration track; load those skills too if your project chose the strangler-fig path on Dimension 1.

Load **`acture-dotnet`** first — the three-primitive mapping, the AOT-vs-reflection axis, the `[Command]` attribute, the licence shifts (MediatR, FluentAssertions, MassTransit, Newtonsoft.Json.Schema), and the "metadata is data, not code" guardrail come from there.

## The one rule you cannot break

> **Phase 1 changes no existing call site.** Every legacy entry point — every controller action, every Worker service, every MediatR `Send`, every direct service caller — continues to work unchanged. The command wrapper is an *additional* entry point, never a replacement.

This is what keeps deployment risk near zero. If Phase 1 ships and a new surface (palette / MCP / AI) misbehaves, you toggle the feature flag and the system behaves exactly as it did before the PR.

## The three phases

### Phase 1 — Wrap

Pick 3–5 existing service / controller / handler methods that already represent user intents:

- `UserService.ActivateAsync(int userId, CancellationToken ct): Task`
- `InvoiceController.SendAsync(int invoiceId, CancellationToken ct): Task<IActionResult>`
- `ReportRunner.GenerateAsync(ReportConfig cfg, CancellationToken ct): Task<Report>`
- `IRequestHandler<ApplyFilter, FilterResult>.Handle(...)` (an existing MediatR handler)

For each candidate:

1. **Author a parameter record.** Mirror the existing method's argument(s) as a `sealed record` with `required` members. If the existing method already takes a typed request object (especially a MediatR request), the record often *is* that type — no duplication.
2. **Author the wrapping handler.** A new class in `MyApp.Acture.Commands.{Category}.`, implementing `ICommandHandler<TParams>`. It carries `[Command(Id = "...", Title = "...")]` for metadata, and its `HandleAsync` method *calls the existing service method* (or `IMediator.Send`).
3. **Do not change the original.** `UserService.ActivateAsync` keeps its signature, its tests, its callers.

```csharp
// src/Acture/Commands/User/ActivateUserParams.cs
namespace MyApp.Acture.Commands.User;
using System.ComponentModel;

public sealed record ActivateUserParams(
    [property: Description("The user id to activate")] int UserId);

// src/Acture/Commands/User/ActivateUserHandler.cs
namespace MyApp.Acture.Commands.User;
using MyApp.Services;

[Command(Id          = "app.user.activate",
         Title       = "Activate user",
         Category    = "admin",
         Description = "Activate a user account (legacy delegate).")]
public sealed class ActivateUserHandler(UserService users)
    : ICommandHandler<ActivateUserParams>
{
    public async Task<AppState> HandleAsync(AppState state,
        ActivateUserParams p, CancellationToken ct)
    {
        await users.ActivateAsync(p.UserId, ct);
        return state;          // legacy service mutates its own world; nothing to fold here yet
    }
}
```

Phase 1's outcome: the registry, dispatcher, and one surface (CLI) work end-to-end against legacy code. The palette / MCP / AI surface can list these wrapped commands but does not have to be exposed yet. Feature-flag each surface independently with `Microsoft.FeatureManagement`:

```csharp
builder.Services.AddFeatureManagement();
// later, at a surface boundary:
if (await fm.IsEnabledAsync("Surface.Palette")) app.MapGet("/commands", ...);
if (await fm.IsEnabledAsync("Surface.Mcp"))    app.MapMcp();
```

**Tempo: 3–5 wrappers per PR.** Resist the urge to wrap twenty at once. The strangler-fig metaphor means each tendril lands on its own, with tests and a small reviewable diff.

### Phase 2 — Enrich

`[Command]` starts thin (`Id`, `Title`). Metadata is added progressively as consumers appear:

- **Adding a palette** → fill in `Category`, `Icon`, `Hotkey`.
- **Adding LLM / MCP exposure** → fill in `Description` (LLM-readable rationale, **not** just a UI label) and ensure your `SchemaBridge.SchemaFor` has the `TransformSchemaNode` delegate from `acture-dotnet-greenfield` §"Step 4" — otherwise descriptions never reach the model.
- **Adding context-aware availability** → fill in `When`.
- **Adding confirmation prompts for destructive operations** → set `RequiresConfirmation = true`.

The rule of three from the journal applies: do not add a field to `CommandAttribute` until three concrete commands need it. When the 6th command repeats the same ad-hoc metadata structure, that is the trigger to formalize the field.

This phase is also when the **schema bridge gets exercised under load**. Many existing .NET DTOs use patterns `JsonSchemaExporter` cannot fully express — see `acture-dotnet` "Round-trip gotchas". Tighten the DTOs *toward the JSON-Schema-representable subset* during the enrich pass; do not change behavior, only types.

### Phase 3 — Extract

Route the existing controllers, Worker services, and Minimal API endpoints through the registry instead of touching the service directly. **Branch-by-abstraction** behind a feature flag:

```csharp
// Controllers/UserController.cs (existing)
[ApiController, Route("api/users")]
public class UserController(
    UserService legacyUsers,
    ICommandRegistry registry,
    IFeatureManager flags) : ControllerBase
{
    [HttpPost("{userId:int}/activate")]
    public async Task<IActionResult> Activate(int userId, CancellationToken ct)
    {
        if (await flags.IsEnabledAsync("CommandDispatch.User.Activate"))
        {
            var json = JsonSerializer.SerializeToElement(new { UserId = userId });
            await registry.DispatchAsync(AppState.Empty, "app.user.activate", json, ct);
        }
        else
        {
            await legacyUsers.ActivateAsync(userId, ct);
        }
        return NoContent();
    }
}
```

Two things are happening here, simultaneously:

1. The new path is **on** for some traffic (per the flag).
2. The legacy path is **still alive** for the rest, including rollback if telemetry shows a regression.

After the legacy branch has been silent in telemetry for ≥ 2 weeks, delete it. That deletion is **Phase 3 graduation** — see `migration-graduate` for the TS counterpart; the .NET shape is identical.

The handler is now the canonical implementation. The legacy `UserService.ActivateAsync` method may stay (still a useful internal abstraction) or be inlined into the handler — that is a separate refactoring decision and unrelated to acture's contract.

## HTTP-level migration: ASP.NET Framework → ASP.NET Core (with YARP)

When the existing codebase is ASP.NET Framework (`System.Web`) and the migration target is ASP.NET Core 10, the wrap → enrich → extract phases run **inside** a YARP-based facade:

1. **Stand up a new ASP.NET Core 10 host** that hosts both the registry (Phase 1 wrappers) and `Yarp.ReverseProxy`.
2. **YARP forwards anything-not-yet-migrated to the legacy framework app** running on the same host (different port, or behind IIS via `aspNetCoreModule`).
3. **`Microsoft.AspNetCore.SystemWebAdapters`** shims `HttpContext`, session, and forms across the boundary so legacy code keeps working in the legacy host.
4. **Per-endpoint migration to the new command registry** happens behind the proxy. The user-visible URL never changes.

```csharp
// Program.cs in the new ASP.NET Core 10 facade
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddActureCommandsFromAssembly(typeof(Program).Assembly);
builder.Services.AddFeatureManagement();
builder.Services.AddReverseProxy()
                .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
builder.Services.AddSystemWebAdapters()
                .AddRedisRemoteAppSession(o => o.RemoteAppUrl = new Uri(/* … */));
var app = builder.Build();

app.UseSystemWebAdapters();
app.MapPost("/api/users/{userId:int}/activate", async (int userId,
    ICommandRegistry r, IFeatureManager f, CancellationToken ct) =>
{
    if (!await f.IsEnabledAsync("Migrated.User.Activate"))
        return Results.NotFound();           // fall through → YARP routes to legacy
    var json = JsonSerializer.SerializeToElement(new { UserId = userId });
    await r.DispatchAsync(AppState.Empty, "app.user.activate", json, ct);
    return Results.NoContent();
});

app.MapReverseProxy();   // everything not migrated → legacy
app.Run();
```

> ⚠️ **Externalize session state (Redis) before the YARP hop.** This is the single most common surprise: ASP.NET Framework's in-process session does not survive the proxy. `SystemWebAdapters`'s `AddRedisRemoteAppSession` is the supported answer; budget for the Redis dependency in Phase 0.

## Escaping MediatR (when the new licence is the catalyst)

A non-trivial fraction of strangler-fig .NET engagements in 2026 are *triggered* by MediatR's licence shift (RPL-1.5 + commercial since 2 July 2025). The migration path is:

1. **Inventory.** `grep -rE 'IRequestHandler|IRequest|INotificationHandler|IPipelineBehavior' src/` to find all MediatR-coupled code. For each handler, decide:
   - **Re-tag as `[Command]`** if it represents a user intent.
   - **Keep as a plain service** if it was just being used as in-proc RPC (no metadata needed).
2. **Adopt one of two replacements:**
   - **`martinothamar/Mediator` 3.x** (MIT, source-gen, AOT-friendly) — if you want a MediatR-like API. The migration is mostly a namespace swap (`MediatR.IRequest` → `Mediator.IRequest`) plus a registration-pattern change.
   - **A hand-rolled `IServiceCollection`-backed registry** (the greenfield path) — if MediatR's pipeline-behavior plumbing was never being used. The hand-rolled registry is ~100 lines and matches the journal's pattern exactly.
3. **Run both in parallel during cutover.** MediatR's `IMediator` and the new registry coexist for one release. Telemetry confirms the new path is silent on errors; then `Remove-Package MediatR` ships in a follow-up PR.

The journal's pattern *does not need* MediatR's pipeline-behavior plumbing — you can replicate `IPipelineBehavior<TRequest, TResponse>` in ~60 lines of DI code if you actually use it. Most teams discover they only use the dispatch primitive and a single `LoggingBehavior`. That is a hand-rolled wrapper, not a NuGet dependency.

## Surface activation order

Lowest-risk first. Each surface is a separate PR, feature-flagged independently.

1. **CLI** (`System.CommandLine` 2.0) — `dotnet run -- app.user.activate --params '{"UserId":42}'`. Validates the registry contract; no production traffic risk.
2. **Telemetry middleware** — wrap `ICommandRegistry.DispatchAsync` in an `ActivitySource.StartActivity("command.dispatch")` decorator. Builds the data set that justifies turning the next flag on.
3. **HTTP** — one `POST /commands/{id}` route + `GET /commands` (registry listing) on the new ASP.NET Core 10 facade. Feature-flag at the route level.
4. **MCP server** — separate process (stdio) or HTTP endpoint via `app.MapMcp()`. Toggle the process / route rather than a code flag.
5. **LLM tool calling** — `Microsoft.Extensions.AI` 10.6+ via `ChatClientBuilder.UseFunctionInvocation()`. Pin pre-1.0 dependencies tightly.
6. **Desktop palette** — WPF / WinUI / Avalonia / MAUI: `CommunityToolkit.Mvvm` `[RelayCommand]`s delegating to `DispatchAsync`. (If your existing app *is* a WPF app, this is often the first user-visible win — Ctrl+Shift+P searching the wrapped commands.)
7. **Blazor palette** — same `ICommandRegistry`, rendered with a `<Palette />` component bound to `All.Values`.

The MCP server being a separate process is a Phase-1 superpower: you can stand up MCP exposure of the wrapped commands without touching the existing .NET application's runtime at all. The host app sees zero risk.

## Migration thresholds

Calibrate per project:

- **Stay in Phase 1 (wrap)** until ≥ 5 commands are working end-to-end with at least one surface (usually CLI).
- **Move to Phase 2 (enrich)** when the 6th command repeats the same ad-hoc metadata three times — rule-of-three trigger to formalize a field on `CommandAttribute`.
- **Move to Phase 3 (extract)** when you have ≥ 10 commands, ≥ 2 surfaces, and the legacy controller paths have been silent in telemetry for ≥ 2 weeks.
- **Stop the migration** if your application is genuinely a request/response monolith with no async, no telemetry needs, and < 20 commands. At that point a plain `IServiceCollection.AddSingleton<ICommandRegistry>(...)` plus a hand-rolled flat dictionary is enough. Don't pay any further migration tax for nothing.

## Per-batch checklist (use for every wrap PR)

- [ ] The PR wraps **3–5** candidates, not more.
- [ ] Each candidate's original signature is unchanged.
- [ ] Each candidate has an xUnit test that dispatches via `ICommandRegistry.DispatchAsync` and asserts the same outcome the legacy call site would have produced.
- [ ] Each candidate's `[Command]` carries `Id` (namespaced) and `Title`. Other metadata is fine to defer.
- [ ] The registry detects duplicate ids (the constructor check from `acture-dotnet-greenfield` §"Step 5").
- [ ] Tool names sent to LLMs match `^[A-Za-z0-9_-]{1,64}$` (replace `.` with `_`) — applies the moment the AI surface is on.
- [ ] No existing controller, service, or test was modified in the wrap PR. (Phase 3 PRs are separate.)
- [ ] No newly-commercial library was added (`MediatR ≥ v13`, `Fluent Assertions ≥ v8`, `Newtonsoft.Json.Schema`, `MassTransit ≥ v9`). Pin existing references explicitly if you must keep them.
- [ ] `SchemaBridge.SchemaFor`'s `TransformSchemaNode` delegate is exercised by at least one new command with `[Description]`-tagged params (so the AI surface picks up descriptions).

## Special cases

### Wrapping an existing MediatR handler

The existing `IRequest<TResponse>` *is* often a suitable params record once you make it a `sealed record` with `required` members. Two options:

- **Wrap-only.** Author a new `ICommandHandler<TParams>` class that delegates to `IMediator.Send`. The MediatR handler stays untouched. Cheapest Phase-1 move.
- **Re-tag.** Mark the existing handler with `[Command]` and have it implement *both* `MediatR.IRequestHandler<...>` and `ICommandHandler<...>`. Risky — keeps two registration paths alive and complicates Phase 3 extraction.

Default to wrap-only in Phase 1. Re-tagging is a Phase-3 consolidation.

### Wrapping a controller action

Phase 1 wraps the *mutation*, not the HTTP response. The wrapped command takes the parsed request as a params record and returns `Task<AppState>` (or `void`-equivalent); the controller composes the HTTP `IActionResult` around it. Mixing HTTP concerns into the command handler couples the registry to ASP.NET Core — see `acture-hard-donts` ("business logic in adapters", "the registry must not know about HTTP").

### Wrapping a method that throws

Existing .NET code uses exceptions liberally. In the wrap layer, decide once: either re-throw (preserving the call-site contract) or convert to an errors-as-data shape (a `Result<T>` record). Mixing the two is the recipe for confusion. **The dispatcher layer is the right place to convert**; the wrapped handler should be transparent about whether it throws or returns. If you re-throw at Phase 1, the Phase 3 controller switch to `DispatchAsync(...)` becomes the moment to introduce error conversion at the surface — and that conversion is then consistent across all surfaces (HTTP, CLI, MCP) because they all sit downstream of the dispatcher.

### Wrapping a method that mutates an EF Core entity

Wrap the *operation*, not the entity. `[Command]` lives on the **handler class**, never on the EF Core entity. The handler calls the `DbContext` / repository and the wrapped command's params record is *not* the entity — it carries the inputs needed to find or update the entity. (`acture-hard-donts` is explicit about this: commands are intents, entities are state; they do not merge.)

### Wrapping a Worker service / hosted service

`IHostedService.ExecuteAsync` does not need wrapping; it is not a user intent. What *is* a user intent is the individual operation the worker performs (e.g., "run the nightly reconciliation"). Wrap that operation as a `[Command]` and have the worker dispatch via `ICommandRegistry`. The worker becomes a *scheduler* over the registry — same shape as a cron job hitting `/commands/{id}`.

## What NOT to do

- **Don't wrap "everything" up front.** The rule of three is a *protection*, not a target. Wrap what has at least one consumer asking for it.
- **Don't put the feature flag inside the registry.** Feature flags live at the *surface* (the controller, the route, the MCP server toggle). The registry stays a flat map of all known commands; surfaces decide who sees what.
- **Don't change the dispatcher contract per surface.** All surfaces call the same `ICommandRegistry.DispatchAsync(state, id, json, ct)`. Surface-specific behavior is in the surface adapter, not in the dispatcher.
- **Don't mass-edit the legacy code in Phase 1 PRs.** Each wrap is additive. Refactoring goes in separate, clearly-labelled PRs.
- **Don't tag with `[Command]` *and* edit the legacy controller in the same PR.** That couples two reversibility tracks — toggling off the new surface no longer fully reverts the change.
- **Don't take the YARP migration as an opportunity to "tidy" the legacy app.** Each migrated endpoint is a separate PR; the legacy app changes only when the route is fully extracted.
- **Don't ship `WithToolsFromAssembly()` once the app is targeting AOT.** It uses reflection (IL2026). Use `WithTools<T>()` and source generation for the AOT cutover.
- **Don't keep MediatR alive past Phase 3 graduation if you started the migration to escape its licence.** A removed-package commit is a precondition for a clean migration outcome.

## See also

- **`acture-dotnet`** — the foundational .NET skill; AOT-vs-reflection axis, library licence statuses, the AIFunction convergence, the canonical attribute shape, the YARP migration pattern.
- **`acture-dotnet-greenfield`** — the other Dimension-1 path; use that for a new project. (Many strangler-fig PRs reference its `SchemaBridge` and `CommandRegistry` code as the canonical implementation.)
- `migration-plan` — the TS-flavored planning skill; the same shape applies to .NET candidate selection.
- `migration-scaffold` — the TS-flavored scaffold skill; the .NET equivalent is the `src/Acture/` setup from `acture-dotnet-greenfield` §"Steps 2–5".
- `migration-wrap` — the TS-flavored per-batch wrap skill; the .NET shape is in this skill's Phase 1 section.
- `migration-graduate` — the TS-flavored Phase 3 graduation skill; the .NET shape is identical.
- `acture-command-record-shape` — the closed-surface discipline; the .NET `CommandAttribute` is the same closed surface.
- `acture-hard-donts` — pre-merge anti-pattern checklist; applies just as much to .NET wraps.
- `acture-mcp` / `acture-ai` — surface-specific skills; the .NET path is `ModelContextProtocol` 1.x and `Microsoft.Extensions.AI` 10.6+ instead of the TS equivalents.
- [`docs/research/acture_research_8 -- Command Dispatch Architecture in C# : .NET — A Tooling Report for Skill-Building Agents.md`](../../docs/research/acture_research_8%20--%20Command%20Dispatch%20Architecture%20in%20C%23%20:%20.NET%20%E2%80%94%20A%20Tooling%20Report%20for%20Skill-Building%20Agents.md) — §4 "The Strangler Fig Migration in C#" is the long-form source for this skill.
