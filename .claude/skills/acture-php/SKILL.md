---
name: acture-php
description: Foundational skill for adding a command-dispatch architecture to a PHP project — greenfield or strangler-fig. Maps acture's three primitives (state model, command registry, schema bridge) to the modern PHP stack (cuyz/valinor + symfony/messenger + #[Command] attribute + spiral/json-schema-generator + opis/json-schema), surfaces the framework choice (vanilla / Symfony / Laravel), and routes to the right deeper skill (`acture-php-greenfield` or `acture-php-strangler`). Triggers on "PHP command dispatch", "command bus in PHP", "Symfony Messenger registry", "Laravel command palette", "expose PHP service to MCP", "PHP MCP server", "wrap PHP service as a command", "acture in PHP", "Symfony command palette", "Tactician replacement", "Prooph replacement".
---

# acture php — command dispatch for PHP projects

Most "command bus" tooling in the PHP world (Tactician, Prooph, Messenger, Broadway, Laravel's job bus) solves *one* of the journal's three primitives — handler dispatch — and is **metadata-poor**. A bus routes a message by class. The journal's registry routes by `id` and carries `{title, params schema, when, category, icon, hotkey, description}` *next to* the dispatch primitive so a palette, an LLM tool list, an MCP server, a CLI, and a test runner can all read from one source.

This skill is the PHP entry point. It maps the three primitives to the language, surfaces the two trade-offs every PHP project faces (framework + agent-written vs package-reuse), and hands off to the path skill (greenfield or strangler-fig).

> Load `acture-architecture-primer` first if you have not — the three primitives and the eight consumer surfaces are the conceptual baseline this skill specializes for PHP. Load `acture-hard-donts` before merging anything.

The companion research note lives at [`docs/research/acture_research_7 -- PHP Tooling for a Command-Dispatch Architecture- A Reference Stack and Migration Guide.md`](../../docs/research/acture_research_7%20--%20PHP%20Tooling%20for%20a%20Command-Dispatch%20Architecture-%20A%20Reference%20Stack%20and%20Migration%20Guide.md). When in doubt about a library choice or version, that is the source of truth.

## The one rule you cannot break

> Command metadata is **data, not code** — and that includes in PHP.

`#[Command(id, title, category, icon, hotkey, when)]` is an attribute whose arguments are scalars and const-expressions. The PHP attribute grammar enforces this structurally — do not invent a runtime DSL on top. `when` is a string predicate name resolved by the host; conditional logic that the registry would have to *interpret* belongs in the handler, not in metadata. This is the same guardrail that rejects nested registries and "command inheritance" in the TS core.

The corollary: **classic PHP buses are dispatchers, not registries.** Symfony Messenger / Laravel Bus / Tactician all route by class. They are perfectly good dispatchers — the registry is the metadata side-car you put next to them.

## The three primitives in PHP

| Primitive       | PHP shape                                                                                              | Reference library                                      |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| State model     | `final readonly class` + backed enums + typed properties; hydrated from `array`/JSON safely.           | **`cuyz/valinor`** (framework-agnostic) or `spatie/laravel-data` (Laravel idiomatic) |
| Command registry| `Map<string, CommandRecord>` built by scanning `#[Command]` attributes via Reflection; dispatch via Messenger's `MessageBus` (or hand-rolled `array<string, callable>`). | **`symfony/messenger`** + a project-owned `#[Command]` attribute |
| Schema bridge   | PHP types → JSON Schema (one library) and JSON → typed PHP (a *separate* library).                     | **`spiral/json-schema-generator`** (gen) + **`opis/json-schema`** (validate) |

`#[AsMessageHandler]` is the **dispatch** primitive. `#[Command]` is the **metadata** primitive. They sit on the same class but they are not the same concept — do not merge them.

### Stack reference (May 2026)

```
PHP             ≥ 8.3 (target 8.4)
State / DTOs    cuyz/valinor                    ^2.3   (MIT)
Schema gen      spiral/json-schema-generator    ^2.1   (MIT, ≥8.3)
Schema validate opis/json-schema                ^2.6   (Apache-2.0)
Dispatcher      symfony/messenger               ^7.3   (MIT, standalone)
CLI surface     symfony/console                 ^7.3   (MIT)
HTTP surface    psr/http-message + your router  PSR-15
MCP surface     mcp/sdk                                 (pre-1.0)
AI surface      symfony/ai-agent                        (pre-1.0)
Tests           pestphp/pest                    ^4.7   (MIT)
```

Do **not** pick `league/tactician` (dormant since 2019), `prooph/service-bus` (deprecated since December 2019), or `spatie/data-transfer-object` (abandoned — author redirects to laravel-data or valinor) for new code. The research note tracks the full ecosystem-health table.

## Two dimensions — always keep both open

For any PHP engagement, locate the task on both axes before writing code:

### Dimension 1 — greenfield vs strangler-fig

Is command dispatch designed in from the start, or wrapped around an existing PHP codebase incrementally?

- **Greenfield** → load **`acture-php-greenfield`**. State model first, registry second, surfaces last.
- **Strangler-fig** → load **`acture-php-strangler`**. Wrap existing service/controller methods as `#[Command]`-tagged handlers, feature-flag the new surface, delete the legacy branch once telemetry is green. PHP is unusually amenable to this because attributes are additive and the autoloader makes namespace discovery cheap.

The PR description / decision log should record which path the project is on; later sessions need to know.

### Dimension 2 — framework variant

PHP projects fall into three buckets, and the schema-gen / dispatcher / AI / MCP choices differ:

| Variant       | Dispatcher                                                  | State                                | AI / MCP                                                                 |
| ------------- | ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| **Vanilla**   | `symfony/messenger` standalone                              | `cuyz/valinor`                       | `mcp/sdk` directly; `symfony/ai-agent` if you accept the Symfony pull    |
| **Symfony**   | `messenger.default_bus` (auto-wired)                        | `cuyz/valinor` *or* Symfony serializer + validator (if API Platform is in) | `symfony/ai-bundle` + `symfony/mcp-bundle` (both pre-1.0, isolate behind a façade) |
| **Laravel**   | Laravel Bus (`Bus::dispatch()`) *or* pull `symfony/messenger` as a service | `spatie/laravel-data` (integrates with Laravel validation + resources) | `prism-php/prism` for LLM tool calling; `laravel/mcp` (Taylor Otwell) or `php-mcp/laravel` for MCP |

`spatie/laravel-data` does **not** emit JSON Schema. Pair it with `spiral/json-schema-generator` (or a hand-rolled emitter) for the LLM/MCP side. Its TypeScript export is not JSON Schema; do not confuse the two.

If the project is "vanilla PHP plus a router" (Slim, Mezzio, hand-rolled), treat it as the Vanilla column.

## The `#[Command]` attribute — the canonical shape

Whether the project hand-writes its registry or installs a third-party scanner, the attribute shape is the same. Project this onto whatever your codebase already does (extra fields are fine — but stay in the "data, not code" lane).

```php
#[\Attribute(\Attribute::TARGET_CLASS | \Attribute::TARGET_METHOD)]
final class Command {
    public function __construct(
        public string  $id,           // 'app.data.applyFilter' — namespaced
        public string  $title,        // 'Apply filter'
        public string  $category = 'general',
        public ?string $description = null,
        public ?string $icon = null,
        public ?string $hotkey = null, // 'mod+f' — host parses
        public ?string $when = null,   // 'app.datasetLoaded' — host evaluates
        public bool    $requiresConfirmation = false,
    ) {}
}
```

Pair with `#[AsMessageHandler]` on a single `__invoke(ParamsDto $params)` method. The DTO class is the parameter schema source of truth; the registry scan reads `__invoke`'s parameter type and generates JSON Schema from it.

```php
#[Command(id: 'app.data.applyFilter', title: 'Apply filter', category: 'data', hotkey: 'mod+f')]
final class ApplyFilterHandler {
    public function __construct(private readonly QueryEngine $engine) {}

    #[AsMessageHandler]
    public function __invoke(ApplyFilterParams $params): FilterResult {
        return $this->engine->applyFilter($params);
    }
}
```

The full registry-scan reference is in `acture-php-greenfield` §"Build the registry".

## Consumer surfaces — what's idiomatic, what isn't

| Surface                                | Idiomatic in PHP? | Notes |
| -------------------------------------- | ----------------- | ----- |
| CLI                                    | **Yes — first surface to bring up.** | Symfony Console 7.3+ invokable commands with `#[AsCommand]` + `#[Argument]` + `#[Option]`. Laravel's Artisan is Symfony Console under the hood. The cheapest surface to validate the registry contract. |
| HTTP / REST endpoint                   | Yes               | One auto-generated `POST /commands/{id}` route — Symfony controllers or Laravel routes. |
| LLM tool calling                       | Yes               | `symfony/ai-agent` (`#[AsTool]` + `#[With]`); `prism-php/prism` (Laravel); `theodo-group/llphant`; `neuron-core/neuron-ai`; `openai-php/client` for raw wiring. |
| MCP server                             | Yes — converging  | **Official**: `mcp/sdk` (modelcontextprotocol/php-sdk, announced September 5, 2025 by PHP Foundation × Symfony × Anthropic; pre-1.0). Practical: `php-mcp/server`, `laravel/mcp`. |
| Telemetry / feature flags / undo / async | **Yes — Messenger's sweet spot** | Messenger middleware: `TelemetryMiddleware`, `FeatureFlagMiddleware`, `ValidatorMiddleware`. `DelayStamp`/`TransportNamesStamp` for async. Laravel jobs + queues for the same. |
| Web command-palette UI                 | **No** (PHP renders server-side) | Expose `GET /commands` + `POST /commands/{id}` as JSON; render the palette in a JS/TS client. Livewire / Inertia / HTMX can host one ad-hoc; no shipped PHP-native component. |
| Testing                                | Yes               | `pestphp/pest` ^4.7 — architecture tests (`expect('App\Commands')->toHaveAttribute(Command::class)`) enforce the contract structurally. |

**Surface activation order** (lowest-risk first): CLI → HTTP (one endpoint) → telemetry middleware → MCP / AI exposure → palette UI. Feature-flag each surface independently. The MCP server is usually a separate process, so toggling it off is trivial.

## Round-trip gotchas (cannot survive PHP ⇄ JSON Schema automatically)

- **Intersection types** (`A&B`) — no JSON Schema equivalent.
- **PHP `mixed` / `iterable`** — lose information.
- **PHPDoc-only types** (`@var list<Foo>`, `array{a:int}`) — vanilla Reflection doesn't see them; Valinor and PHPStan do.
- **`patternProperties`, `dependentSchemas`, `if/then/else`, `unevaluatedProperties`** — no PHP generator emits these; hand-author the schema at the bridge layer.
- **`format: 'date-time'` / `format: 'uuid'`** — survive structurally, but most validators don't enforce them by default.

Keep parameter DTOs in the JSON-Schema-representable subset. Complex validation belongs in the handler, not the schema.

## What NOT to do (PHP-specific)

- **Don't put `#[Command]` on a Doctrine entity.** Commands are *intents*; entities are *state*. The metadata-not-code guardrail rejects this — the registry must not become a poor reimplementation of the ORM.
- **Don't pick Tactician or Prooph for new code.** Tactician's last release was July 2019; Prooph's official support ended December 31, 2019. Any tutorial older than 2022 is suspect.
- **Don't merge `#[AsMessageHandler]` and `#[Command]` into one attribute.** They are separate by design — one is dispatch, the other is metadata. Keeping them apart lets you swap the dispatcher without losing the registry shape.
- **Don't rely on docblock-only types without a parser that reads them.** Valinor parses generics and shaped arrays; vanilla `ReflectionParameter` does not.
- **Don't reach for `composer require mcp/sdk` or `symfony/ai-bundle` as a default move.** They are valid, but pre-1.0 — pin tightly, budget for one upgrade per quarter, isolate behind a project façade.

## See also

- **`acture-php-greenfield`** — concrete walk-through for a new project: state model → `#[Command]` + registry scanner → CLI → tests.
- **`acture-php-strangler`** — concrete walk-through for an existing PHP codebase: wrap a controller/service method, enrich metadata, feature-flag, delete the legacy branch.
- `acture-architecture-primer` — the three primitives and eight consumer surfaces; the language-agnostic baseline.
- `acture-hard-donts` — pre-merge anti-pattern checklist; applies just as much to PHP.
- `acture-command-record-shape` — the closed-surface discipline for the `CommandRecord` (translates 1:1 to the `#[Command]` attribute).
- `acture-mcp` — the MCP server surface; the PHP path is `mcp/sdk` or `laravel/mcp` instead of the TS SDK.
- `acture-ai` — LLM tool calling; the PHP path is `symfony/ai-agent` / `prism-php/prism` instead of the Vercel AI SDK.
- [`docs/research/acture_research_7 -- PHP Tooling for a Command-Dispatch Architecture- A Reference Stack and Migration Guide.md`](../../docs/research/acture_research_7%20--%20PHP%20Tooling%20for%20a%20Command-Dispatch%20Architecture-%20A%20Reference%20Stack%20and%20Migration%20Guide.md) — the canonical PHP stack reference; check it for current library versions and ecosystem-health snapshot.
