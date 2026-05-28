---
name: acture-php-strangler
description: Concrete walk-through for adopting a command-dispatch layer in an EXISTING PHP codebase incrementally — the strangler-fig pattern applied to PHP services, controllers, and Artisan/Console commands. Covers the three phases (Wrap → Enrich → Extract), the additive `#[Command]` + `#[AsMessageHandler]` overlay on existing service methods, feature-flagged surface activation, the per-batch tempo (3–5 candidates at a time), and the deletion conditions that retire the legacy code path. Use after `acture-php` once the project has chosen the strangler-fig path against an existing PHP codebase. Triggers on "migrate PHP to command dispatch", "strangler-fig PHP", "wrap controller as command", "wrap service method as command", "incremental PHP refactor", "retire Tactician", "replace Prooph", "feature-flag command dispatch", "introduce command palette to existing PHP app".
---

# acture php strangler — incremental adoption in an existing PHP codebase

A strangler-fig engagement adds a command-dispatch layer **around** an existing PHP codebase without a big-bang rewrite. PHP is unusually amenable to this because:

- **Attributes are additive.** `#[Command]` next to an existing class never breaks the existing call sites.
- **The autoloader makes namespace discovery cheap.** A bootstrap pass scans `App\Acture\Commands` (or any namespace) for `#[Command]`-tagged classes.
- **Composer's PSR-11 container makes wiring optional.** You can run the registry pass-through in a vanilla project or behind Symfony's auto-configuration / Laravel's package discovery.
- **`#[AsMessageHandler]` does not replace your existing method.** It augments a separate handler class that *delegates* to the legacy service. Zero call-site change in phase 1.

This skill is the PHP-flavored counterpart to the `migration-*` track (`migration-plan`, `migration-scaffold`, `migration-wrap`, `migration-graduate`). The phase names mirror the TS migration track; load those skills too if your project chose the strangler-fig path on Dimension 1.

Load **`acture-php`** first — the three-primitive mapping, the stack choices, the `#[Command]` attribute, and the "metadata is data, not code" guardrail come from there.

## The one rule you cannot break

> **Phase 1 changes no existing call site.** Every legacy entry point — every controller method, every Artisan command, every service caller — continues to work unchanged. The command wrapper is an *additional* entry point, never a replacement.

This is what keeps deployment risk near zero. If Phase 1 ships and the palette/MCP/AI surface fails, you toggle the feature flag and the system behaves exactly as it did before the PR.

## The three phases

### Phase 1 — Wrap

Pick 3–5 existing service/controller methods that already represent user intents:

- `UserService::activate(int $userId): void`
- `InvoiceController::send(int $invoiceId): Response`
- `ReportRunner::generate(ReportConfig $cfg): Report`

For each candidate:

1. **Author a parameter DTO.** Mirror the existing method's argument(s). PHP 8.1+ readonly classes; backed enums where applicable. If the existing method already takes a typed object, the DTO often *is* that object — no duplication.
2. **Author the wrapping handler.** A new class in `App\Acture\Commands\{Category}\`. It carries `#[Command(id, title, …)]` for metadata and `#[AsMessageHandler]` on a single `__invoke(DtoClass): mixed` that *calls the existing service method*.
3. **Do not change the original.** `UserService::activate` keeps its signature, its tests, its callers.

```php
// src/Acture/Commands/User/ActivateUserParams.php
final readonly class ActivateUserParams {
    public function __construct(public int $userId) {}
}

// src/Acture/Commands/User/ActivateUserHandler.php
use App\Acture\Command;
use App\Services\UserService;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[Command(
    id:       'app.user.activate',
    title:    'Activate user',
    category: 'admin',
    description: 'Activate a user account (legacy delegate)',
)]
final class ActivateUserHandler {
    public function __construct(private readonly UserService $users) {}

    #[AsMessageHandler]
    public function __invoke(ActivateUserParams $p): void {
        $this->users->activate($p->userId);
    }
}
```

Phase 1's outcome: the registry, dispatcher, and one surface (CLI) work end-to-end against legacy code. The palette / MCP / AI surface can list these wrapped commands but does not have to be exposed yet. Feature-flag each surface independently.

**Tempo: 3–5 wrappers per PR.** Resist the urge to wrap twenty at once. The strangler-fig metaphor means each tendril lands on its own, with tests and a small reviewable diff.

### Phase 2 — Enrich

The `#[Command]` attribute starts thin (`id`, `title`). Metadata is added progressively as consumers appear:

- **Adding a palette** → fill in `category`, `icon`, `hotkey`.
- **Adding LLM/MCP exposure** → fill in `description` (LLM-readable rationale, not just a UI label).
- **Adding context-aware availability** → fill in `when`.
- **Adding confirmation prompts for destructive operations** → set `requiresConfirmation: true`.

The rule of three from the journal applies: do not add a field to `#[Command]` until three concrete commands need it. When the 6th command repeats the same ad-hoc metadata structure, that is the trigger to formalize the field.

The PHP attribute grammar enforces the "data, not code" guardrail structurally — you cannot pass a closure or runtime expression as an attribute argument. Take the win; do not invent a runtime DSL on top.

### Phase 3 — Extract

Route the existing controllers, Artisan/Console commands, and HTTP entry points through the registry instead of touching the service directly. Branch-by-abstraction:

```php
// app/Http/Controllers/UserController.php (existing)
public function activate(Request $r, Dispatcher $dispatch): Response {
    if (FeatureFlag::on('command_dispatch.user.activate')) {
        $dispatch->dispatch('app.user.activate', $r->only(['userId']));
    } else {
        $this->users->activate($r->integer('userId'));  // legacy path
    }
    return new Response('', 204);
}
```

Two things are happening here, simultaneously:

1. The new path is **on** for some traffic (per the flag).
2. The legacy path is **still alive** for the rest, including rollback if telemetry shows a regression.

After the legacy branch has been silent in telemetry for ≥ 2 weeks, delete it. That deletion is **Phase 3 graduation** — see `migration-graduate` for the TS counterpart; the PHP shape is identical.

```php
// app/Http/Controllers/UserController.php (after graduation)
public function activate(Request $r, Dispatcher $dispatch): Response {
    $dispatch->dispatch('app.user.activate', $r->only(['userId']));
    return new Response('', 204);
}
```

The handler is now the canonical implementation. The `UserService::activate` method may stay (still a useful internal abstraction) or be inlined into the handler — that is a separate refactoring decision and unrelated to acture's contract.

## Surface activation order

Lowest-risk first. Each surface is a separate PR, feature-flagged independently.

1. **CLI** (Symfony Console 7.3 / Artisan) — `bin/console app:run app.user.activate '{"userId":42}'`. Validates the registry contract; no production traffic risk.
2. **Telemetry middleware** — Symfony Messenger middleware logs every envelope before any user-facing surface is on. Builds the data set that justifies turning the next flag on.
3. **HTTP** — one `POST /commands/{id}` route + `GET /commands` (registry listing). Feature-flag at the route level.
4. **MCP server** — separate process; toggle the process on/off rather than a code flag.
5. **LLM tool calling** — `symfony/ai-agent` (`#[AsTool]` + `#[With]`) or `prism-php/prism` (Laravel). Pin pre-1.0 dependencies tightly.
6. **Palette UI** — only if a JS/TS client exists. PHP does not render command palettes server-side; expose JSON and render in the client.

The MCP server being a separate process is a Phase-1 superpower: you can stand up MCP exposure of the wrapped commands without touching the existing PHP application's runtime at all. The host app sees zero risk.

## Migration thresholds

Per the research note's heuristics — calibrate per project:

- **Stay in Phase 1 (wrap)** until ≥ 5 commands are working end-to-end with at least one surface (usually CLI).
- **Move to Phase 2 (enrich)** when the 6th command repeats the same ad-hoc metadata three times — rule-of-three trigger to formalize a field on `#[Command]`.
- **Move to Phase 3 (extract)** when you have ≥ 10 commands, ≥ 2 surfaces, and the legacy controller paths have been silent in telemetry for ≥ 2 weeks.
- **Reconsider Messenger entirely** if your application is genuinely a request/response monolith with no async, no telemetry, and < 20 commands — at that point a `array<string, callable>` registry on top of plain PSR-11 is enough. Don't pay the Messenger tax for nothing.

## Per-batch checklist (use for every wrap PR)

- [ ] The PR wraps **3–5** candidates, not more.
- [ ] Each candidate's original signature is unchanged.
- [ ] Each candidate has a Pest test that dispatches via the registry and asserts the same state mutation the legacy call site would have produced.
- [ ] Each candidate's `#[Command]` carries `id` (namespaced) and `title`. Other metadata is fine to defer.
- [ ] The registry detects duplicate ids (one line in `CommandRegistry::register`).
- [ ] No existing controller, service, or test was modified in the wrap PR. (Phase 3 PRs are separate.)
- [ ] `composer require` did not pull in Tactician, Prooph, or `spatie/data-transfer-object`.

## Special cases

### Wrapping an Artisan / Symfony Console command

Existing console commands often already represent intents — `php artisan user:activate 42`. Two options:

- **Wrap-only** — author a `#[Command]` handler that delegates to the same service the Artisan command calls. The Artisan command stays. Use this when the console UX (interactive prompts, progress bars) is non-trivial.
- **Reroute** — change the Artisan command body to dispatch through the registry, removing the duplicate logic. Use this when the Artisan command is essentially `$this->service->doThing($input)`.

Both are valid. The wrap-only path is safer for Phase 1; the reroute is a Phase-3-style consolidation.

### Wrapping a controller that returns a Response

Phase 1 wraps the *mutation*, not the HTTP response. The wrapped command takes the parsed request as a DTO and returns the *result* (or `void`); the controller method composes the HTTP `Response` around it. Mixing HTTP concerns into the command handler couples the registry to the web layer — see `acture-hard-donts` (business logic in adapters, "the registry must not know about HTTP").

### Wrapping a method that throws

The legacy method's call sites likely catch specific exceptions. In the wrap layer, decide once: either re-throw (preserving the call-site contract) or convert to the acture errors-as-data shape (`Result<R>`-equivalent). Mixing the two is the recipe for confusion. The dispatcher layer is the right place to convert; the wrapped handler should be transparent about whether it throws or returns.

If you re-throw at Phase 1 (recommended), the Phase 3 controller switch to `dispatch(...)` becomes the moment to introduce error conversion at the surface — and that conversion is then consistent across all surfaces (HTTP, CLI, MCP) because they all sit downstream of the dispatcher.

### Wrapping a method that mutates a Doctrine entity

Wrap the *operation*, not the entity. `#[Command]` lives on the **handler class**, never on the Doctrine entity. The handler calls the Doctrine repository / EntityManager and the wrapped command's DTO is *not* the entity — it carries the inputs needed to find or update the entity. (`acture-hard-donts` is explicit about this: commands are intents, entities are state, they do not merge.)

## What NOT to do

- **Don't wrap "everything" up front.** The rule of three is a *protection*, not a target. Wrap what has at least one consumer asking for it.
- **Don't put the feature flag inside the registry.** Feature flags live at the *surface* (the controller, the route, the MCP server toggle). The registry stays a flat map of all known commands; surfaces decide who sees what.
- **Don't change the dispatcher contract per surface.** All surfaces call the same `Dispatcher::dispatch($id, $rawParams)`. Surface-specific behavior is in the surface adapter, not in the dispatcher.
- **Don't mass-edit the legacy code in Phase 1 PRs.** Each wrap is additive. Refactoring goes in separate, clearly-labelled PRs.
- **Don't tag with `#[Command]` *and* edit the legacy controller in the same PR.** That couples two reversibility tracks — toggling off the new surface no longer fully reverts the change.

## See also

- **`acture-php`** — the foundational PHP skill; framework variants, attribute shape, library choices.
- **`acture-php-greenfield`** — the other Dimension-1 path; use that for a new project.
- `migration-plan` — the TS-flavored planning skill; the same shape applies to PHP candidate selection.
- `migration-scaffold` — the TS-flavored scaffold skill; PHP equivalent is the `src/Acture/` setup from `acture-php-greenfield` §"Step 2/3".
- `migration-wrap` — the TS-flavored per-batch wrap skill; the PHP shape is in this skill's Phase 1 section.
- `migration-graduate` — the TS-flavored Phase 3 graduation skill; the PHP shape is identical.
- `acture-command-record-shape` — the closed-surface discipline; the PHP `Command` attribute is the same closed surface.
- `acture-hard-donts` — pre-merge anti-pattern checklist; applies just as much to PHP wraps.
- `acture-mcp` / `acture-ai` — surface-specific skills; the PHP path is `mcp/sdk` or `symfony/ai-agent` / `prism-php/prism` instead of the TS equivalents.
- [`docs/research/acture_research_7 -- PHP Tooling for a Command-Dispatch Architecture- A Reference Stack and Migration Guide.md`](../../docs/research/acture_research_7%20--%20PHP%20Tooling%20for%20a%20Command-Dispatch%20Architecture-%20A%20Reference%20Stack%20and%20Migration%20Guide.md) — §4 "The strangler-fig migration in PHP" is the long-form source for this skill.
