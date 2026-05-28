# PHP Tooling for a Command-Dispatch Architecture: A Reference Stack and Migration Guide

*Author: Thor Whalen — May 27, 2026*

## TL;DR

- **Yes, PHP can implement the three-primitive command-dispatch architecture cleanly** — but the right stack today is **cuyz/valinor** (state model + typed parameter hydration), **Symfony Messenger** (command registry/bus) plus a thin metadata layer of PHP 8 attributes, and **api-platform/json-schema** or **spiral/json-schema-generator** for the JSON-Schema bridge. Wire LLM/MCP surfaces through the official **mcp/sdk** (PHP Foundation × Symfony × Anthropic) and **symfony/ai-agent**, both pre-1.0 but production-shaped.
- **Classic PHP command-buses (Tactician, Prooph, Broadway) are not a direct fit.** They are dispatch-focused and metadata-poor; Tactician (last release July 2019) and Prooph (officially deprecated, support ended December 31, 2019) are dormant, and even Symfony Messenger needs an attribute side-channel to host the journal's metadata (title, category, icon, hotkey, parameter schema, `when` predicate).
- **Strangler-fig migration is straightforward in PHP**: existing service/controller methods become Messenger messages via `#[AsMessageHandler]`; HTTP routes and Artisan/Console commands stay live behind feature flags while the registry is enriched with `#[Command]` and `#[Param]` attributes and then exposed as MCP and AI tools from the *same* definition.

## Key Findings

1. **The journal's three primitives map non-trivially.** PHP 8.1+ gives you readonly classes, native enums, and constructor property promotion — enough to make a state model and parameter DTOs feel idiomatic. But PHP has no native JSON-Schema; you must pick a generator (attributes/reflection → JSON Schema) and a separate validator (JSON → checked PHP). These are two libraries, not one.
2. **Command bus ≠ command registry.** PHP's bus tradition (Tactician/Messenger/Broadway/Prooph) treats a "command" as a message routed by *class*; the journal treats a command as a *record* (id, title, params schema, handler, `when`, category, icon, hotkey). PHP's class-as-routing-key is more rigid than the journal's `id`-as-routing-key, but Messenger's `HandlersLocator` + `#[AsMessageHandler]` can be wrapped to bridge the two.
3. **MCP is real in PHP, and consolidating.** Three independent SDKs existed in 2025 (`php-mcp/server`, `logiscape/mcp-sdk-php`, plus assorted experiments). On **September 5, 2025**, the **PHP Foundation, Symfony, and Anthropic** announced an *official* `mcp/sdk` (`modelcontextprotocol/php-sdk`) — per the PHP Foundation blog ("Announcing the Official PHP SDK for MCP") and the MCP official blog ("Today, we are announcing that Symfony teamed up with The PHP Foundation, and Anthropic to launch the official MCP SDK"). It was seeded from `php-mcp/server` and the PHP-LLM initiative, and is now the recommended path for new projects.
4. **JSON Schema fidelity is a real constraint.** PHP DTO libraries can express *most* of what JSON Schema needs, but not all: `oneOf`/`anyOf` unions, `$ref` graph, `pattern`, `format`, `additionalProperties: false`, and conditional schemas (`if`/`then`/`else`) do not round-trip cleanly through any single library. The pragmatic stack uses generators that emit a deliberate *subset* of Draft-07/2020-12.
5. **PHP 8 attributes are the right metadata mechanism.** They are pure data, read via Reflection, framework-agnostic, and statically analyzable. The journal's guardrails — "metadata is data, not code", flat registry, beware inner-platform effect — translate directly: `#[Command(id: …, title: …, when: …)]` on a method, `#[Param(…)]` on each argument, registry built by scanning. Build-time codegen (e.g. `php-collective/dto`) is available if reflection overhead matters.
6. **Some surfaces are first-class in PHP, others aren't.** CLI (Symfony Console / Laravel Artisan), HTTP/REST, queued/async middleware, telemetry, validation, undo/redo of `{commandId, params}` sequences — all idiomatic. **Web command-palette UIs are not idiomatic** for PHP backends; expose the registry through JSON over HTTP and render the palette in a JS/TS client (Livewire/Inertia/HTMX are viable but ad-hoc).

---

## Details

### 1. Mapping the three primitives to PHP

#### 1.1 State model

The journal's "state model" is a typed, schema-described single source of truth. In PHP 8.1+ the *language* gives you most of it for free:

```php
final readonly class FilterState {
    public function __construct(
        public string $field,
        public Operator $op,           // backed enum
        public string|int|float $value,
    ) {}
}

enum Operator: string {
    case Eq = 'eq'; case Gt = 'gt'; case Lt = 'lt'; case Contains = 'contains';
}
```

What you still need a library for: (a) hydrating untyped input (JSON, $_POST, array) *safely* into these objects, (b) producing rich validation errors, (c) round-tripping back to JSON. Recommendations:

| Library | Role | Verdict |
|---|---|---|
| **cuyz/valinor** (2.3.2, MIT, PHP 8.2–8.5) | Framework-agnostic mapper from raw input → strongly typed value objects; honors PHPStan/Psalm shapes (`non-empty-string`, `int<10,100>`, `list<T>`, generics). | **First choice for the state model and parameter DTOs.** Dependency-free, immutable-by-default, no inheritance required. **10,630,054 total installs** per Packagist. |
| **spatie/laravel-data** (4.20.1, MIT, PHP 8.1+) | Laravel-idiomatic Data objects: hydration, validation, transformation, TypeScript export. | Use only inside a Laravel app where you want Laravel validation rules and resource transformers in one class. Couples you to `illuminate/*`. |
| **symfony/serializer + symfony/validator** | Workhorse hydration/validation; deeply integrated with the Symfony container. | Choose if you are already all-in on Symfony and want to share normalizers with HTTP. The DerEuroMark "DTOs at the Speed of Plain PHP" benchmark reports **symfony/serializer at 106K standalone DTO hydrations/s** (vs build-time codegen which is far faster). |
| **spatie/data-transfer-object** | Legacy DTO library. | **Abandoned** — Packagist shows the "abandoned and no longer maintained" flag, with the author (Brent Roose) recommending spatie/laravel-data or cuyz/valinor on the Spatie blog ("Deprecating spatie/data-transfer-object"). |
| **webmozart/assert** | Tiny assertion library. | Use *inside* DTO constructors for invariants the type system can't express. Not a replacement for the above. |

#### 1.2 Command registry

The classic PHP "command bus" tradition is mature but **metadata-poor**: the bus takes a message *object* and dispatches it by class. The journal needs a `Map<string, CommandRecord>` where `CommandRecord` carries `{id, title, handler, paramsSchema, when, category, icon, hotkey}`.

| Library | Latest | Maintenance | Fit |
|---|---|---|---|
| **symfony/messenger** | 8.0.9 (2026-04-30), MIT, PHP 8.4+ | Active, official | **Best dispatcher.** Bus + envelope + stamps + middleware + sync/async transports + `#[AsMessageHandler]`. *Doesn't* carry palette-style metadata — add it via a sibling `#[Command]` attribute. |
| **league/tactician** | 2.0-rc1 (2019-07-28), MIT, PHP 7.2+ | **Dormant** (no release in 6+ years) | Historically significant; do not pick for new code in 2026. |
| **Laravel bus/jobs** | Ships with Laravel | Active | Idiomatic inside Laravel: dispatch jobs with `Bus::dispatch()`, chain/batch, queue with Horizon. Same metadata gap as Messenger. |
| **prooph/service-bus** | v6.4 (2019) | **Officially deprecated** (project-wide support ended December 31, 2019) | Skip. A community fork `maksimovic/service-bus` exists for PHP 8.x. |
| **broadway/broadway** | 2.5.0 (2023-04-14), MIT, PHP 7.2+ | Low activity; no release in 2+ years | Only relevant if you specifically want CQRS + event sourcing in a legacy stack. |

**The architectural insight**: classic buses solve *one* of the journal's needs (handler routing); the *other* needs (introspection, palette listing, `when` predicates, hotkey conflicts, MCP tool emission) sit *next to* the bus, not inside it. Treat Messenger as the executor and build a tiny `CommandRegistry` class on top of it whose source of truth is `#[Command]` attributes.

#### 1.3 Schema bridge

This is the *hardest* primitive in PHP because there is no canonical "PHP type → JSON Schema" path in the language or standard library. Two responsibilities split:

**(a) PHP → JSON Schema (generation):**

| Library | Latest | Approach | Notes |
|---|---|---|---|
| **spiral/json-schema-generator** | v2.1.0 (2025-08-22), MIT, PHP 8.3+ | `#[Field]` attribute + Reflection on DTO classes; emits JSON Schema for use as **LLM structured output**. | Cleanest match for the journal's intent. Handles union types via `oneOf`, enums via `enum`, `array<T>` via PHPDoc. Small (~114★) but focused. |
| **api-platform/json-schema** | v4.2.20 stable / v4.3.0-beta.2 (2026-03-06), MIT, PHP 8.2+ | Builds JSON Schema (and OpenAPI) from API-Platform resources via Symfony PropertyInfo/TypeInfo. | Excellent if you're already on API Platform; otherwise heavy (pulls 6+ Symfony components). 3M+ installs. |
| **dunglas/php-to-json-schema** | Old | PropertyInfo-driven, setter-based. | Niche; superseded by api-platform/json-schema. |
| **php-mcp/server (built-in)** | n/a | Auto-infers JSON Schema for tool parameters from PHP type hints, docblocks, and `#[Schema]` attribute. Precedence: `#[Schema(definition: …)]` > parameter `#[Schema]` > method `#[Schema]` > type+docblock. | If you adopt php-mcp/server (or the official `mcp/sdk` derived from it) this comes for free for MCP tools. |

**(b) JSON Schema → validation (input checking):**

| Library | Latest | Drafts | Notes |
|---|---|---|---|
| **opis/json-schema** | 2.6.0 (2025-10-17), Apache-2.0, PHP 7.4+ | 2020-12, 2019-09, draft-07, draft-06 | **Most spec-complete** modern validator. Used internally by the official `mcp/sdk` (which requires `opis/json-schema: ^2.4`). Rich error formatting, custom filters, slot/pragma extensions. |
| **justinrainbow/json-schema** | 6.8.2 (2026-05-05), MIT, PHP 7.2+ | draft-3 through draft-7 (no 2019-09/2020-12) | Battle-tested (3.6k★), widely embedded; supports `CHECK_MODE_COERCE_TYPES` for HTTP-style string→int casts. |
| **swaggest/php-json-schema** | v0.12.43 (2024-12-22), MIT, PHP 7.1+ | draft-7, draft-6, draft-4 | Has a hybrid "PHP class === schema" model via `ClassStructure`, useful if you want one source of truth in code. Lightly maintained. |

**Round-tripping gotchas** — PHP-side features that **do not** survive a clean PHP-class ⇄ JSON-Schema round trip:
- **Intersection types** (`A&B`) have no JSON Schema equivalent.
- **`$ref` cycles** through generators that inline by default.
- **`format: 'date-time'` / `format: 'uuid'`** survive structurally but most validators don't enforce them by default.
- **`patternProperties`, `dependentSchemas`, `if/then/else`, `unevaluatedProperties`** are emitted by no PHP generator; you'd hand-write them.
- **PHP's `mixed` and `iterable`** lose information when serialized.

### 2. Mapping the consumer surfaces to PHP

| Surface | Idiomatic in PHP? | Tooling |
|---|---|---|
| LLM tool calling | **Yes** | `symfony/ai-agent` (`#[AsTool]` + `#[With(...)]` attributes auto-generate JSON Schema and validate); `prism-php/prism` (Laravel-flavored, very active, **2,373★** per Packagist, v0.100.1 released 2026-03-20); `theodo-group/llphant` (Symfony + Laravel agnostic, `FunctionBuilder::buildFunctionInfo()`); `neuron-core/neuron-ai` (v3, May 2026, full agent framework); `openai-php/client` (raw, 5.7k★) for direct tool-call wiring. |
| MCP server | **Yes — converging** | **Official: `mcp/sdk`** (modelcontextprotocol/php-sdk, PHP Foundation × Symfony × Anthropic, announced September 5, 2025; experimental pre-1.0; existing code MIT, new code Apache-2.0). Practical: `php-mcp/server` (3.x, MIT, PHP 8.1+, the SDK was seeded from this); `php-mcp/laravel` for Laravel; `laravel/mcp` (Taylor Otwell, v0.5.x); `logiscape/mcp-sdk-php` (v1.7.1, MIT, 100% MCP conformance). |
| CLI as first-class | **Yes** | `symfony/console` with new (Symfony 7.3) **invokable commands** + `#[AsCommand]` + `#[Argument]` + `#[Option]` + `#[Ask]` attributes — directly parallels the parameterized-command-palette contract. `laravel/artisan` extends Symfony Console. |
| HTTP/REST endpoint | **Yes** | Symfony controllers or Laravel routes; the same `CommandRecord` becomes one auto-generated `POST /commands/{id}` route. |
| Web command palette UI | **No** (PHP renders server-side) | Expose `GET /commands` and `POST /commands/{id}` as JSON; render the palette in a JS/TS client. Livewire / Inertia / HTMX can host a palette UI but no shipped PHP-native component exists. |
| Testing typed state + dispatch | **Yes** | `pestphp/pest` v4.7 (PHP 8.3+, 11.4k★) — Higher-Order Expectations, datasets-as-property-based-tests, parallel runner, architecture tests (`expect('App\\Commands')->toHaveAttribute(Command::class)`). `PHPUnit` 11 is the default fallback. `eris` for proper property-based testing (low adoption but works). |
| Undo/redo + macro replay | **Yes — by construction** | Commands as immutable `{commandId, params}` records serialize trivially (JSON). Store a stack; replay via the same dispatcher. Reversibility requires you to author an `inverse(params, prevState)` method — there's no library for it. |
| Extension/plugin APIs | **Yes** | The registry IS the extension surface. Auto-discover `#[Command]`-annotated classes in registered namespaces (Symfony auto-configuration / Laravel package discovery). |
| Middleware (telemetry, flags, validation, queued/async) | **Yes — Messenger's sweet spot** | Symfony Messenger middleware: `doctrine_transaction`, `doctrine_ping_connection`, custom `TelemetryMiddleware`, `FeatureFlagMiddleware`, `ValidatorMiddleware`. `DelayStamp`, `TransportNamesStamp` for async; `ErrorDetailsStamp` for retries. Laravel jobs + queues for the same. |

### 3. The "Real" Reference Stack

#### 3.1 Greenfield, framework-agnostic core

```
PHP             ≥ 8.3 (target 8.4)
State / DTOs    cuyz/valinor                    ^2.3   (MIT, ~8.2–8.5)
Schema gen      spiral/json-schema-generator    ^2.1   (MIT, ≥8.3)
Schema validate opis/json-schema                ^2.6   (Apache-2.0)
Dispatcher      symfony/messenger               ^7.3   (MIT)  — standalone
CLI surface     symfony/console                 ^7.3   (MIT)
HTTP surface    psr/http-message + your router  PSR-15
MCP surface     mcp/sdk (modelcontextprotocol/php-sdk) — pre-1.0
AI surface      symfony/ai-agent                — pre-1.0
Tests           pestphp/pest                    ^4.7   (MIT)
```

#### 3.2 Minimal end-to-end sketch: one parameterized command

```php
// 1) The parameter DTO — your "param schema" lives here, in PHP types.
use Spiral\JsonSchemaGenerator\Attribute\Field;

final readonly class ApplyFilterParams {
    public function __construct(
        #[Field(title: 'Field', description: 'The column to filter on')]
        public string $field,

        #[Field(title: 'Operator')]
        public Operator $op,

        #[Field(title: 'Value', description: 'Value to compare against')]
        public string|int|float $value,
    ) {}
}

// 2) The Command attribute — pure data, the metadata-not-code guardrail.
#[\Attribute(\Attribute::TARGET_CLASS | \Attribute::TARGET_METHOD)]
final class Command {
    public function __construct(
        public string $id,           // 'filter.apply'
        public string $title,        // 'Apply filter'
        public string $category = 'data',
        public ?string $icon = null,
        public ?string $hotkey = null,
        public ?string $when = null, // 'hasSelection'
    ) {}
}

// 3) The handler — Messenger discovers it; the registry indexes it by id.
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[Command(id: 'filter.apply', title: 'Apply filter', category: 'data', hotkey: 'mod+f')]
final class ApplyFilterHandler {
    public function __construct(private readonly QueryEngine $engine) {}

    #[AsMessageHandler]
    public function __invoke(ApplyFilterParams $params): FilterResult {
        return $this->engine->applyFilter($params);
    }
}

// 4) The registry — one scan, attribute-driven, flat.
final class CommandRegistry {
    /** @var array<string, CommandRecord> */
    private array $byId = [];

    public function register(string $handlerClass): void {
        $ref = new \ReflectionClass($handlerClass);
        $cmd = ($ref->getAttributes(Command::class)[0] ?? null)?->newInstance()
            ?? throw new \LogicException("$handlerClass missing #[Command]");
        $invoke = $ref->getMethod('__invoke');
        $paramClass = $invoke->getParameters()[0]->getType()->getName();

        $this->byId[$cmd->id] = new CommandRecord(
            id: $cmd->id,
            title: $cmd->title,
            category: $cmd->category,
            hotkey: $cmd->hotkey,
            when: $cmd->when,
            paramsClass: $paramClass,
            paramsSchema: (new \Spiral\JsonSchemaGenerator\Generator())->generate($paramClass),
            handler: $handlerClass,
        );
    }
    public function all(): array { return $this->byId; }
    public function get(string $id): CommandRecord { return $this->byId[$id]; }
}

// 5) Dispatch through Messenger middleware.
use Symfony\Component\Messenger\MessageBus;

$dispatch = function (string $id, array $rawParams) use ($registry, $bus, $mapper) {
    $rec = $registry->get($id);
    // Valinor hydrates+validates rawParams against the typed DTO
    $params = $mapper->map($rec->paramsClass, Source::array($rawParams));
    return $bus->dispatch($params);  // Messenger envelope; middleware kicks in
};

// 6) Expose as an MCP tool — from the SAME registry.
// Using the official mcp/sdk (or php-mcp/server) attribute-discovery is one path;
// for a programmatic, registry-driven approach:
$server = \PhpMcp\Server\Server::builder()
    ->setServerInfo('my-app', '1.0.0');
foreach ($registry->all() as $rec) {
    $server->addTool(
        handler: fn(array $input) => $dispatch($rec->id, $input),
        name: $rec->id,
        description: $rec->title,
        inputSchema: $rec->paramsSchema,
    );
}
$server->build()->listen(new \PhpMcp\Server\Transports\StdioServerTransport());

// 7) Expose as an LLM tool with symfony/ai — same registry, same schema.
//    AsTool + With attributes auto-generate; OR build Tool descriptors from
//    $registry->all() and pass them to your Agent's Toolbox.
```

The crucial property: **the JSON Schema for `ApplyFilterParams` is generated once, and is the contract every surface speaks** (CLI argument parsing, HTTP body validation, MCP tool input, LLM function tool input, palette form).

#### 3.3 Symfony variant
- Dispatcher: `messenger.default_bus` from `symfony/messenger`.
- Container auto-wires handlers via `#[AsMessageHandler]`.
- Schema generation: prefer `api-platform/json-schema` if API Platform is in the project; otherwise `spiral/json-schema-generator`.
- AI/MCP: `symfony/ai-bundle` + `symfony/mcp-bundle` (depends on `mcp/sdk ^0.5`).
- CLI: `symfony/console` 7.3+ invokable commands with `#[AsCommand]`.

#### 3.4 Laravel variant
- Dispatcher: Laravel job bus (`Bus::dispatch()`), or pull in `symfony/messenger` as a service.
- State: `spatie/laravel-data` (instead of Valinor) to get Laravel validation rules + resource transformers in one class. Note: laravel-data does not emit Draft-2020-12 JSON Schema directly; combine with `spiral/json-schema-generator` for the LLM/MCP side.
- AI: `prism-php/prism` (`^0.100`).
- MCP: `laravel/mcp` (Taylor Otwell, v0.5.1+) or `php-mcp/laravel`.
- CLI: Artisan, which is Symfony Console under the hood.

### 4. The strangler-fig migration in PHP

PHP applications are unusually amenable to strangler-fig retrofit because: (i) attributes are additive, (ii) the autoloader makes "discover this namespace" cheap, (iii) Composer's PSR-11 container makes wiring optional.

**Phase 1 — Wrap.** Pick three to five existing service or controller methods that already represent user intents (`UserService::activate()`, `InvoiceController@send`, etc.). For each:

```php
// Before: existing code stays untouched
final class UserService {
    public function activate(int $userId): void { /* unchanged */ }
}

// After: a thin command wrapper, no behavior change
#[Command(id: 'user.activate', title: 'Activate user')]
final class ActivateUserHandler {
    public function __construct(private UserService $users) {}
    #[AsMessageHandler]
    public function __invoke(ActivateUserParams $p): void {
        $this->users->activate($p->userId);
    }
}
```

**Phase 2 — Enrich.** Add metadata progressively. The `when` predicate, `icon`, `hotkey`, `category`, `description` are *additive* — nothing breaks if they're absent. Use Symfony's `registerAttributeForAutoconfiguration` (or Laravel package discovery) to make `#[Command]` services automatically known to the registry.

**Phase 3 — Extract.** Route HTTP and Artisan/Console entries through the registry instead of touching the service directly. Branch-by-abstraction:

```php
// In the existing controller:
public function activate(Request $r): Response {
    if (FeatureFlag::on('command_dispatch.user_activate')) {
        return $this->commands->dispatch('user.activate', $r->all());
    }
    $this->users->activate($r->getInt('userId'));  // legacy path
    return new Response(204);
}
```

Once telemetry shows the new path is healthy, delete the legacy branch. **Zero downtime** is preserved because: (a) handlers are added, never moved; (b) the registry is a pure read of attributes, no DB; (c) Messenger dispatches sync by default — adding `DelayStamp`/transports later is a config change, not a code change.

**Surface activation order** (lowest risk first): CLI → HTTP (single endpoint) → telemetry middleware → MCP/AI exposure → palette UI. Feature-flag each surface independently — the MCP server is usually a separate process, so toggling it off is trivial.

### 5. Metadata mechanism and guardrails

**PHP 8 attributes + Reflection is the right primitive.** They are:
- *Data*, not code — instantiated lazily by `ReflectionAttribute::newInstance()`; the journal's "metadata is data" guardrail is structurally enforced.
- Statically analyzable — PHPStan, Psalm, IDEs all index them.
- Framework-agnostic — work in plain PHP, Symfony, Laravel, Slim, Mezzio.
- Forward-compatible — `#[Command]` you write today still works on PHP 8.5.

**Build-time alternatives** (relevant if reflection cost hurts):
- `php-collective/dto` generates plain PHP classes at build time from XML/YAML/NEON config. Reported in the DerEuroMark "DTOs at the Speed of Plain PHP" benchmark as significantly faster than reflection-based libraries, which clocked **spatie/data-transfer-object at 52.8K standalone DTOs/s and symfony/serializer at 106K/s** (versus ~339K JSON documents/s for the codegen approach). Trade-off: you lose the "single source of truth in PHP types".
- Rector/PHPStan can codegen registry stubs from attributes for cold-path apps.

**Guardrail health-check:**

| Journal guardrail | PHP enforcement | Risk |
|---|---|---|
| Metadata is data, not code | ✅ Attributes are syntactically restricted to scalar/const-expr arguments. | Low. |
| Flat registry (no nested namespaces of commands) | ⚠ Up to you. `CommandRegistry::register()` collisions detection is one line. | Medium — discipline. |
| Beware inner-platform effect | ⚠ PHP's class-routing tradition tempts you to build a custom DSL on top of the bus. **Don't** — the registry is a Map, not a query language. | Medium. |
| "Rule of three" — generalize only after three concrete uses | n/a | n/a |

**Where PHP's dynamism helps**: attribute discovery is cheap; you can swap a handler without restarting (in dev). **Where it hurts**: PHPDoc-only types (`@var list<Foo>`) escape `ReflectionParameter` and require static analyzers — Valinor handles this; vanilla Reflection does not.

### 6. Ecosystem health (snapshot, May 27 2026)

| Package | Latest | Date | License | Min PHP | Stars (~) | Maintenance |
|---|---|---|---|---|---|---|
| symfony/messenger | 8.0.9 | 2026-04-30 | MIT | 8.4 | 32k¹ | **Active** |
| league/tactician | 2.0-rc1 | 2019-07-28 | MIT | 7.2 | 865 | **Dormant** |
| broadway/broadway | 2.5.0 | 2023-04-14 | MIT | 7.2 | 1,509 | Low activity |
| prooph/service-bus | 6.4 | (2019) | BSD-3 | 7.1 | 445 | **Deprecated** |
| cuyz/valinor | 2.3.2 | 2026-01-23 | MIT | 8.2 | **1,502** | **Active** (10,630,054 installs) |
| spatie/laravel-data | 4.20.1 | 2026-03-18 | MIT | 8.1 | 1,706 | **Active** |
| spatie/data-transfer-object | — | — | MIT | 8.0 | — | **Abandoned** (use laravel-data or valinor) |
| opis/json-schema | 2.6.0 | 2025-10-17 | Apache-2.0 | 7.4 | 645 | **Active** |
| justinrainbow/json-schema | 6.8.2 | 2026-05-05 | MIT | 7.2 | 3,631 | **Active** |
| swaggest/php-json-schema | 0.12.43 | 2024-12-22 | MIT | 7.1 | 486 | Light |
| spiral/json-schema-generator | 2.1.0 | 2025-08-22 | MIT | 8.3 | 114 | **Active** |
| api-platform/json-schema | 4.2.20 / 4.3.0-beta.2 | 2026-03-06 | MIT | 8.2 | 26² | **Active** |
| php-mcp/server | 3.x | 2025-08 | MIT | 8.1 | 843 | Active; partly superseded by `mcp/sdk` |
| **mcp/sdk** (modelcontextprotocol/php-sdk) | 0.5.x | 2026-04-26 | **MIT + Apache-2.0** (mixed; new code Apache-2.0) | 8.1 | 1,489 | **Active, experimental pre-1.0** |
| logiscape/mcp-sdk-php | 1.7.1 | 2026-04-23 | MIT | 8.1 | 366 | Active |
| laravel/mcp | 0.5.1 | 2025-12-18 | MIT | 8.2 | 749 | **Active**, pre-1.0 |
| symfony/ai-agent | 0.9.0 | 2026 | MIT | 8.2 | 31² | **Active, experimental** (no BC promise) |
| prism-php/prism | 0.100.1 | 2026-03-20 | MIT | 8.2 | **2,373** | **Active**, pre-1.0 |
| theodo-group/llphant | 0.11.20 | 2026-05-10 | MIT | 8.1 | 1,672 | **Active** |
| neuron-core/neuron-ai | v3 | 2026 (May) | MIT | 8.1 | 1k+ | **Active**; predecessor `inspector-apm/neuron-ai` abandoned-and-renamed |
| openai-php/client | 0.19.2 | 2026-04-19 | MIT | 8.2 | 5,771 | **Very active** |
| pestphp/pest | 4.7.0 | 2026-05-03 | MIT | 8.3 | 11,471 | **Very active** |

¹ Symfony monorepo ★; subtree split is smaller. ² Sub-split repo; the parent organization has 10k+ ★.

**License notes**:
- The official `mcp/sdk` has a **dual-license posture**: existing code that came from `php-mcp/server` remains MIT; new contributions are Apache-2.0. Verify before vendoring into a project with strict license policies.
- `opis/json-schema` is **Apache-2.0** (not MIT). Most other packages here are MIT.

---

## Recommendations

**For a brand-new project (greenfield):**
1. Start on **PHP 8.4** and standardize on the framework-agnostic core: `cuyz/valinor` + `symfony/messenger` (standalone) + `opis/json-schema` + `spiral/json-schema-generator`.
2. Author one `#[Command]` attribute and one `CommandRegistry`. Resist the temptation to inherit from any bus library's `Command` base class — keep the registry's metadata in *attributes*, not class hierarchies.
3. Add `pestphp/pest` from day one; write an architecture test asserting every `#[Command]` handler has a single `__invoke` taking a typed DTO.
4. Adopt the **official `mcp/sdk`** (`composer require mcp/sdk`) over `php-mcp/server` for new code, knowing it is pre-1.0 — pin a minor version.

**For a Symfony app:**
1. Use Messenger as both command bus and event bus (separate buses via config).
2. Generate JSON Schema with `api-platform/json-schema` if API Platform is already a dependency; otherwise `spiral/json-schema-generator`.
3. Add `symfony/ai-bundle` and `symfony/mcp-bundle` once they stabilize past 1.0. Until then, treat them as experimental and isolate behind your own façade.

**For a Laravel app:**
1. Use `spatie/laravel-data` for parameter DTOs to integrate with Laravel validation rules and resources.
2. Pair with `spiral/json-schema-generator` (or hand-rolled emission) for the LLM/MCP schema export — laravel-data's TypeScript export is not JSON Schema.
3. AI: **`prism-php/prism`** (very active, idiomatic); MCP: **`laravel/mcp`** (official; pre-1.0).

**Migration thresholds — when to escalate phases:**
- **Stay in Phase 1 (wrap)** until ≥ 5 commands are working end-to-end with one surface (usually CLI).
- **Move to Phase 2 (enrich)** when the 6th command repeats the same metadata fields three times — that's the rule-of-three trigger to add the field to the `#[Command]` attribute.
- **Move to Phase 3 (extract)** when you have ≥ 10 commands, ≥ 2 surfaces, and the legacy controller paths have been silent in telemetry for ≥ 2 weeks.
- **Reconsider Messenger entirely** if your application is genuinely a request/response monolith with no async, no telemetry, and < 20 commands — at that point a `array<string, callable>` registry on top of plain PSR-11 is enough.

**Anti-patterns to avoid (PHP-specific):**
- Don't put `#[Command]` on a Doctrine entity. Commands are *intents*; entities are *state*. The journal's "metadata is data, not code" line specifically warns against turning the registry into a poor reimplementation of your ORM.
- Don't use Tactician for new code in 2026. Don't use Prooph for new code in 2026.
- Don't rely on docblock-only types (`@var Foo[]`) without a tool that reads them — Valinor and PHPStan do; vanilla PHP Reflection does not.

---

## Caveats

1. **The official `mcp/sdk`, `symfony/ai-agent`, and `laravel/mcp` are all pre-1.0** as of May 2026. Their public APIs *will* change. Pin them tightly and budget for one upgrade per quarter.
2. **JSON Schema fidelity is partial in every PHP library reviewed.** If your domain depends on `if/then/else`, `unevaluatedProperties`, or conditional dependencies, you will hand-author those schemas — no PHP generator emits them.
3. **PHP's Reflection cannot see generics or shaped arrays** (`list<Foo>`, `array{a: int, b: string}`) without docblock parsing. Valinor parses these via its own parser; vanilla `ReflectionParameter` does not. Plan accordingly.
4. **Symfony Messenger requires PHP 8.4** as of 8.0.x (2026-04-30). If you're on 8.2 or 8.3, use the 7.x line.
5. **Performance**: reflection-based hydration costs ~10–50 µs per object. For batch jobs processing 10k+ records per request, consider `php-collective/dto` codegen or hand-rolled `fromArray()` factories.
6. **The `mcp/sdk` mixed-licence (MIT + Apache-2.0)** posture is unusual. Legal review may be required for environments with strict SPDX requirements.
7. **Tactician**'s last release was July 2019; **Prooph** support officially ended December 2019. They appear in many older blog posts and tutorials — treat any tutorial older than 2022 as suspect.

---

## What a skill-building agent should know — prioritized

1. **The three-primitive mental model maps to: Valinor (state) → Messenger + a `#[Command]` attribute (registry) → spiral/json-schema-generator (schema bridge).** Memorize this triple.
2. **Always emit JSON Schema from PHP types, not the other way around.** PHP types are the source of truth; the schema is a *projection*.
3. **`#[AsMessageHandler]` is the dispatch primitive; `#[Command]` is the metadata primitive.** They are separate by design — don't merge them.
4. **The official PHP MCP SDK is `mcp/sdk`** (`composer require mcp/sdk`), announced September 5, 2025, by the PHP Foundation × Symfony × Anthropic collaboration. Prefer it over historical SDKs for new code, but understand `php-mcp/server` predates it and many production deployments still use it.
5. **For LLM tool calling, `symfony/ai` uses `#[AsTool]` + `#[With(...)]` attributes**; `prism-php/prism` uses fluent `Prism::text()->withTools([...])`. Both auto-generate JSON Schema from PHP type hints.
6. **CLI is the cheapest surface to bring up first**, via Symfony Console 7.3 invokable commands with `#[Argument]` and `#[Option]`. It validates the registry contract without any HTTP or MCP wiring.
7. **Symfony Messenger middleware is your telemetry/feature-flag/validation/queueing extension surface.** Each middleware sees the envelope and can stamp it.
8. **`spatie/data-transfer-object` is abandoned**; recommend `cuyz/valinor` (framework-agnostic) or `spatie/laravel-data` (Laravel).
9. **`league/tactician` (2019) and `prooph/service-bus` (deprecated 2019) are out**. `broadway/broadway` (last release 2023) is only for legacy CQRS+ES.
10. **Use Pest 4.7+ for tests** and write architecture tests that enforce the command contract (every `#[Command]` has a typed DTO param, has exactly one `__invoke`, has a unique `id`).
11. **Round-trip gotchas**: PHP intersection types, `mixed`, `iterable`, and conditional JSON Schema (`if/then/else`) do not survive automatic generation. Hand-author them at the schema layer or restrict the PHP types.
12. **Strangler-fig in PHP looks like: add `#[Command]` next to existing services → feature-flag the new surface → delete the legacy branch once telemetry is green.** No big-bang migrations.

## References

[1] CuyZ. *Valinor: dependency-free PHP library that helps to map any input into a strongly-typed structure.* [github.com/CuyZ/Valinor](https://github.com/CuyZ/Valinor); [valinor.cuyz.io](https://valinor.cuyz.io/latest/); [packagist.org/packages/cuyz/valinor](https://packagist.org/packages/cuyz/valinor).
[2] Spatie. *laravel-data.* [spatie.be/docs/laravel-data/v4](https://spatie.be/docs/laravel-data/v4/introduction); [github.com/spatie/laravel-data](https://github.com/spatie/laravel-data).
[3] Roose, B. *Deprecating spatie/data-transfer-object.* [stitcher.io/blog/deprecating-spatie-dto](https://stitcher.io/blog/deprecating-spatie-dto).
[4] Symfony. *Messenger: Sync & Queued Message Handling.* [symfony.com/doc/current/messenger.html](https://symfony.com/doc/current/messenger.html); *The Messenger Component.* [symfony.com/doc/current/components/messenger.html](https://symfony.com/doc/current/components/messenger.html).
[5] Symfony. *New in Symfony 7.3: Invokable Commands and Input Attributes.* [symfony.com/blog/new-in-symfony-7-3-invokable-commands-and-input-attributes](https://symfony.com/blog/new-in-symfony-7-3-invokable-commands-and-input-attributes).
[6] Symfony. *Symfony AI — Agent Component.* [symfony.com/doc/current/ai/components/agent.html](https://symfony.com/doc/current/ai/components/agent.html); *Platform Component.* [symfony.com/doc/current/ai/components/platform.html](https://symfony.com/doc/current/ai/components/platform.html).
[7] Symfony. *Kicking off the Symfony AI Initiative.* [symfony.com/blog/kicking-off-the-symfony-ai-initiative](https://symfony.com/blog/kicking-off-the-symfony-ai-initiative).
[8] The League of Extraordinary Packages. *Tactician.* [tactician.thephpleague.com](https://tactician.thephpleague.com/); [github.com/thephpleague/tactician](https://github.com/thephpleague/tactician).
[9] Prooph. *prooph CQRS and Event Sourcing components for PHP.* [getprooph.org](https://getprooph.org/).
[10] Broadway. *broadway/broadway.* [github.com/broadway/broadway](https://github.com/broadway/broadway).
[11] Opis. *Opis JSON Schema.* [opis.io/json-schema](https://opis.io/json-schema/); [packagist.org/packages/opis/json-schema](https://packagist.org/packages/opis/json-schema).
[12] JsonRainbow. *JSON Schema for PHP.* [github.com/jsonrainbow/json-schema](https://github.com/jsonrainbow/json-schema).
[13] Swaggest. *php-json-schema.* [github.com/swaggest/php-json-schema](https://github.com/swaggest/php-json-schema).
[14] Spiral. *json-schema-generator.* [github.com/spiral/json-schema-generator](https://github.com/spiral/json-schema-generator); [packagist.org/packages/spiral/json-schema-generator](https://packagist.org/packages/spiral/json-schema-generator).
[15] API Platform. *JSON Schema Support.* [api-platform.com/docs/core/json-schema](https://api-platform.com/docs/core/json-schema/); [github.com/api-platform/json-schema](https://github.com/api-platform/json-schema).
[16] Model Context Protocol. *Official PHP SDK.* [github.com/modelcontextprotocol/php-sdk](https://github.com/modelcontextprotocol/php-sdk); [packagist.org/packages/mcp/sdk](https://packagist.org/packages/mcp/sdk).
[17] PHP Foundation. *Announcing the Official PHP SDK for MCP* (Sep 5, 2025). [thephp.foundation/blog/2025/09/05/php-mcp-sdk/](https://thephp.foundation/blog/2025/09/05/php-mcp-sdk/); MCP official blog. [blog.modelcontextprotocol.io](https://blog.modelcontextprotocol.io).
[18] Obikwelu, K. et al. *php-mcp/server.* [github.com/php-mcp/server](https://github.com/php-mcp/server).
[19] Logiscape. *mcp-sdk-php.* [packagist.org/packages/logiscape/mcp-sdk-php](https://packagist.org/packages/logiscape/mcp-sdk-php).
[20] Laravel. *laravel/mcp.* [packagist.org/packages/laravel/mcp](https://packagist.org/packages/laravel/mcp).
[21] Prism PHP. *prism-php/prism.* [prismphp.com](https://prismphp.com/); [github.com/prism-php/prism](https://github.com/prism-php/prism).
[22] Theodo. *LLPhant.* [github.com/LLPhant/LLPhant](https://github.com/LLPhant/LLPhant); [llphant.readthedocs.io](https://llphant.readthedocs.io/en/main/).
[23] Neuron AI. *neuron-core/neuron-ai.* [github.com/neuron-core/neuron-ai](https://github.com/neuron-core/neuron-ai); [docs.neuron-ai.dev](https://docs.neuron-ai.dev/).
[24] Maduro, N. et al. *openai-php/client.* [github.com/openai-php/client](https://github.com/openai-php/client).
[25] Pest. *pestphp/pest.* [pestphp.com](https://pestphp.com/); [github.com/pestphp/pest](https://github.com/pestphp/pest).
[26] DerEuroMark. *DTOs at the Speed of Plain PHP.* [dereuromark.de/2026/03/02/dtos-at-the-speed-of-plain-php/](https://www.dereuromark.de/2026/03/02/dtos-at-the-speed-of-plain-php/).
[27] Angelov, D. *Using custom PHP attributes for registering and configuring Symfony Messenger handlers.* [angelovdejan.me/2022/01/09/custom-php-attributes-for-symfony-messenger-handlers.html](https://angelovdejan.me/2022/01/09/custom-php-attributes-for-symfony-messenger-handlers.html).
[28] API Platform. *Schema Generator.* [api-platform.com/docs/schema-generator](https://api-platform.com/docs/schema-generator/).
[29] Symfony. *Introducing the Symfony Tui Component.* [symfony.com/blog/introducing-the-symfony-tui-component](https://symfony.com/blog/introducing-the-symfony-tui-component).