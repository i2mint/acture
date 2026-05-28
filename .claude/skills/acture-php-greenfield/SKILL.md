---
name: acture-php-greenfield
description: Concrete, file-by-file walk-through for standing up a command-dispatch layer in a NEW PHP project. Covers the state model (cuyz/valinor DTOs + backed enums), the `#[Command]` attribute, a ~120-line attribute-scanning CommandRegistry on top of symfony/messenger, JSON Schema generation via spiral/json-schema-generator, the first CLI surface (Symfony Console 7.3 invokable commands), and Pest architecture tests that enforce the contract. Use after `acture-php` once the project has chosen the greenfield path. Triggers on "new PHP project with commands", "set up command registry in PHP from scratch", "PHP greenfield acture", "Symfony Messenger registry from scratch", "Laravel command registry from scratch", "first PHP command".
---

# acture php greenfield — bootstrapping a new PHP project

A greenfield PHP engagement designs command dispatch in from the start. This skill is the concrete walk-through. It assumes:

- You read **`acture-php`** first — the three-primitive mapping, the framework variants, the canonical `#[Command]` attribute, and the "don't merge `#[Command]` with `#[AsMessageHandler]`" guardrail come from there.
- The project chose the greenfield path on Dimension 1. (For an existing codebase, load **`acture-php-strangler`** instead.)
- PHP ≥ 8.3 (target 8.4 — `symfony/messenger` 8.x requires it).

The sequence below is **State model → Registry primitive → First command → CLI surface → Test contract**. It mirrors `acture-greenfield-bootstrap`'s TS walk-through, projected onto PHP idiom.

## Step 0 — Composer dependencies

The vanilla / framework-agnostic core (Symfony and Laravel adapt — see `acture-php` for the variants):

```bash
composer require \
  cuyz/valinor:^2.3 \
  symfony/messenger:^7.3 \
  symfony/console:^7.3 \
  spiral/json-schema-generator:^2.1 \
  opis/json-schema:^2.6
composer require --dev pestphp/pest:^4.7
```

If the project is Laravel: skip `symfony/messenger` (use the Laravel bus) and swap `cuyz/valinor` for `spatie/laravel-data` if you want Laravel validation rules + resources in the DTO class. Keep `spiral/json-schema-generator` either way — `laravel-data`'s TypeScript export is not JSON Schema. If the project is Symfony with API Platform already in, prefer `api-platform/json-schema` over `spiral/json-schema-generator`.

Do not add `mcp/sdk` or `symfony/ai-bundle` yet. They are surface dependencies — add them per surface in Step 5+.

## Step 1 — Design the state model

Before any command exists, decide what state exists. The state model is **owned by the project**, not by any library. The state-model constraints from `acture-greenfield-state-model` apply identically: deterministic id generation, schema-described, separable into slices.

PHP 8.1+ gives you most of it for free:

```php
// src/Domain/Filter/FilterState.php
namespace App\Domain\Filter;

enum Operator: string {
    case Eq       = 'eq';
    case Gt       = 'gt';
    case Lt       = 'lt';
    case Contains = 'contains';
}

final readonly class FilterState {
    public function __construct(
        public string                $field,
        public Operator              $op,
        public string|int|float      $value,
    ) {}
}
```

Two PHP-specific notes:

- **`readonly` is constructor-only-writable.** Treat it as the immutability you'd get from a TS `Readonly<T>`. State updates produce a new instance, not a mutated one.
- **Backed enums are first-class** in JSON Schema generation — Valinor and spiral/json-schema-generator both emit them as `enum`.

The state model is *not* an attribute target. Do not put `#[Command]` on `FilterState`. Commands are intents; entities/values are state — see `acture-hard-donts` and `acture-php`'s "What NOT to do".

## Step 2 — Author the `#[Command]` attribute (project-owned)

This is the metadata primitive. Keep it in the project, not in a dependency. Twelve lines:

```php
// src/Acture/Command.php
namespace App\Acture;

#[\Attribute(\Attribute::TARGET_CLASS)]
final class Command {
    public function __construct(
        public string  $id,
        public string  $title,
        public string  $category    = 'general',
        public ?string $description = null,
        public ?string $icon        = null,
        public ?string $hotkey      = null,
        public ?string $when        = null,
        public bool    $requiresConfirmation = false,
    ) {}
}
```

Resist the temptation to add a `handler:` field. The handler is the class itself — the registry resolves it through Reflection. Adding a `handler:` argument would let two sources of truth disagree.

## Step 3 — Build the `CommandRegistry`

A flat `Map<string, CommandRecord>`, populated by scanning `#[Command]` attributes. ~120 lines, project-owned. The scanner reads the DTO from `__invoke`'s parameter type and generates JSON Schema from it once at registration time.

```php
// src/Acture/CommandRecord.php
namespace App\Acture;

final readonly class CommandRecord {
    public function __construct(
        public string      $id,
        public string      $title,
        public string      $category,
        public ?string     $description,
        public ?string     $hotkey,
        public ?string     $when,
        public bool        $requiresConfirmation,
        public string      $handlerClass,
        public string      $paramsClass,
        public array       $paramsSchema,   // JSON Schema (associative array)
    ) {}
}
```

```php
// src/Acture/CommandRegistry.php
namespace App\Acture;

use Spiral\JsonSchemaGenerator\Generator as SchemaGenerator;

final class CommandRegistry {
    /** @var array<string, CommandRecord> */
    private array $byId = [];

    public function __construct(private readonly SchemaGenerator $schema = new SchemaGenerator()) {}

    public function register(string $handlerClass): void {
        $ref = new \ReflectionClass($handlerClass);
        $cmd = ($ref->getAttributes(Command::class)[0] ?? null)?->newInstance()
            ?? throw new \LogicException("$handlerClass missing #[Command]");

        if (!$ref->hasMethod('__invoke')) {
            throw new \LogicException("$handlerClass needs an __invoke method");
        }
        $invoke = $ref->getMethod('__invoke');
        $params = $invoke->getParameters();
        if (count($params) !== 1) {
            throw new \LogicException("$handlerClass::__invoke must take exactly one DTO parameter");
        }
        $type = $params[0]->getType();
        if (!$type instanceof \ReflectionNamedType || $type->isBuiltin()) {
            throw new \LogicException("$handlerClass::__invoke parameter must be a typed DTO class");
        }
        $paramsClass = $type->getName();

        if (isset($this->byId[$cmd->id])) {
            throw new \LogicException("Duplicate command id: {$cmd->id}");
        }

        $this->byId[$cmd->id] = new CommandRecord(
            id:                   $cmd->id,
            title:                $cmd->title,
            category:             $cmd->category,
            description:          $cmd->description,
            hotkey:               $cmd->hotkey,
            when:                 $cmd->when,
            requiresConfirmation: $cmd->requiresConfirmation,
            handlerClass:         $handlerClass,
            paramsClass:          $paramsClass,
            paramsSchema:         json_decode($this->schema->generate($paramsClass), true),
        );
    }

    public function get(string $id): CommandRecord {
        return $this->byId[$id] ?? throw new \OutOfBoundsException("Unknown command: $id");
    }

    /** @return array<string, CommandRecord> */
    public function all(): array { return $this->byId; }

    public function has(string $id): bool { return isset($this->byId[$id]); }
}
```

Three structural choices worth calling out:

- **Duplicate-id detection is one line.** Enforce it from the first command — silent shadowing is the #1 way a flat registry decays into chaos.
- **The handler is required to be `__invoke`-single-DTO.** This is the same contract that lets architecture tests (Step 6) catch drift in CI.
- **The JSON Schema is generated once at register time**, not on every dispatch. Schema generation costs ~10–50 µs per DTO via reflection; the registry is the cache.

## Step 4 — Wire dispatch through Symfony Messenger

`#[AsMessageHandler]` lives on `__invoke`; Messenger's `HandlersLocator` auto-routes by parameter type. The registry sits *next to* the bus and routes by id.

```php
// src/Acture/Dispatcher.php
namespace App\Acture;

use Symfony\Component\Messenger\MessageBusInterface;
use CuyZ\Valinor\Mapper\TreeMapper;
use CuyZ\Valinor\Mapper\Source\Source;

final class Dispatcher {
    public function __construct(
        private readonly CommandRegistry     $registry,
        private readonly MessageBusInterface $bus,
        private readonly TreeMapper          $mapper,
    ) {}

    public function dispatch(string $id, array $rawParams): mixed {
        $rec = $this->registry->get($id);
        $params = $this->mapper->map($rec->paramsClass, Source::array($rawParams));
        $envelope = $this->bus->dispatch($params);
        // For sync handlers, HandledStamp carries the return value.
        $stamp = $envelope->last(\Symfony\Component\Messenger\Stamp\HandledStamp::class);
        return $stamp?->getResult();
    }
}
```

Valinor hydrates and validates `$rawParams` against the typed DTO. The errors-as-data contract is preserved: a `MappingError` from Valinor surfaces as a structured failure, not a generic 500. Wrap the dispatch in a try/catch at your surface boundary (CLI, HTTP, MCP) and project errors to whatever the surface expects.

## Step 5 — Author the first command

One file per command. The handler class is the unit of registration:

```php
// src/Acture/Commands/Filter/ApplyFilterParams.php
namespace App\Acture\Commands\Filter;

use App\Domain\Filter\Operator;
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
```

```php
// src/Acture/Commands/Filter/ApplyFilterHandler.php
namespace App\Acture\Commands\Filter;

use App\Acture\Command;
use App\Services\QueryEngine;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[Command(
    id:       'app.data.applyFilter',
    title:    'Apply filter',
    category: 'data',
    hotkey:   'mod+f',
    description: 'Filter the active dataset by a column condition',
)]
final class ApplyFilterHandler {
    public function __construct(private readonly QueryEngine $engine) {}

    #[AsMessageHandler]
    public function __invoke(ApplyFilterParams $params): FilterResult {
        return $this->engine->applyFilter($params);
    }
}
```

Registration happens once at boot. In a Symfony app, `registerAttributeForAutoconfiguration` makes every `#[Command]`-tagged service automatically known to the registry. In a vanilla app, a small bootstrap pass iterates configured namespaces:

```php
foreach (\App\Util\classesInNamespace('App\\Acture\\Commands') as $class) {
    if ((new \ReflectionClass($class))->getAttributes(\App\Acture\Command::class)) {
        $registry->register($class);
    }
}
```

(`classesInNamespace` is project-owned utility code — typically a Composer classmap walk.)

## Step 6 — Bring up the CLI surface first

CLI is the cheapest surface to validate the registry contract — no HTTP, no MCP, no schema-form rendering. Symfony Console 7.3+ invokable commands wire to the dispatcher with one adapter per console command, or one generic console-command that delegates by id:

```php
// src/Cli/RunCommandCli.php
namespace App\Cli;

use App\Acture\Dispatcher;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(name: 'app:run', description: 'Dispatch a registered command by id')]
final class RunCommandCli {
    public function __construct(private readonly Dispatcher $dispatch) {}

    public function __invoke(
        SymfonyStyle $io,
        string $id,
        string $params = '{}',
    ): int {
        try {
            $result = $this->dispatch->dispatch($id, json_decode($params, true) ?? []);
            $io->success(json_encode($result, JSON_PRETTY_PRINT));
            return 0;
        } catch (\Throwable $e) {
            $io->error($e->getMessage());
            return 1;
        }
    }
}
```

`bin/console app:run app.data.applyFilter '{"field":"age","op":"gt","value":25}'` — the registry has shipped end-to-end. Everything afterwards (HTTP endpoint, MCP server, AI agent) is "another adapter calling `$this->dispatch->dispatch(...)`".

The Laravel equivalent: an Artisan command (Artisan is Symfony Console under the hood). Same shape.

## Step 7 — Architecture tests (Pest)

A Pest architecture test enforces the contract structurally. Every `#[Command]`-tagged class is checked for exactly one `__invoke` with a single typed DTO parameter, and every command id is unique. This catches drift in CI long before it reaches a consumer surface.

```php
// tests/Architecture/CommandsTest.php
use App\Acture\Command;

test('every #[Command] handler has exactly one __invoke with a typed DTO param')
    ->expect('App\Acture\Commands')
    ->toHaveAttribute(Command::class)
    ->and(fn (string $class) => (new ReflectionClass($class))->getMethod('__invoke')->getNumberOfParameters())
    ->toEqual(1);

test('command ids are unique', function () {
    $registry = app(\App\Acture\CommandRegistry::class);
    $ids = array_keys($registry->all());
    expect($ids)->toEqualCanonicalizing(array_unique($ids));
});

test('every command params DTO round-trips through Valinor', function () {
    $registry = app(\App\Acture\CommandRegistry::class);
    foreach ($registry->all() as $rec) {
        expect(class_exists($rec->paramsClass))->toBeTrue();
        expect($rec->paramsSchema)->toHaveKey('properties');
    }
});
```

The architecture test is the **structural enforcement of the metadata-not-code guardrail**. If someone adds a `closure: callable` field to `#[Command]`, this test still passes — but the next time they reach for the field at registry-scan time, it will fail because attributes can only hold scalars/const-exprs. The PHP language enforces the guardrail; the test enforces the registry's contract on top.

## Step 8 — What NOT to do yet

- **Don't add `mcp/sdk` or `symfony/ai-bundle` to `composer.json` "to be ready later".** They are surface dependencies, added per surface, pinned tightly to a minor — they are all pre-1.0 as of May 2026.
- **Don't author a JSON Schema validator at this stage.** The dispatch path validates via Valinor (type-driven, much richer errors). `opis/json-schema` is for surfaces that accept *raw JSON* without going through PHP types — typically an MCP server adapter — and is added later.
- **Don't wire a palette UI.** PHP doesn't render command palettes server-side; that is a JS/TS surface that lives in a separate client (or a Livewire/Inertia/HTMX layer in your existing frontend). See `acture-palette-design` for the design and `acture-php` for the PHP-specific guidance to expose `GET /commands` + `POST /commands/{id}` as JSON instead.
- **Don't build the `when`-clause DSL.** `$cmd->when` is a *name* the host evaluates; the host owns the registry of named predicates. No string DSL until a real consumer (palette, AI gating) actually needs it. YAGNI applied softly.

## Surface activation order

Once Steps 1–7 are green, add surfaces one at a time and feature-flag each. Lowest-risk first:

1. **CLI** (Step 6) — already done.
2. **HTTP** — one `POST /commands/{id}` route + a `GET /commands` route returning the registry as JSON. ~30 lines.
3. **Telemetry middleware** — Symfony Messenger middleware logs every envelope; ~20 lines.
4. **MCP server** — iterate the registry, register each `CommandRecord` as an MCP tool via `mcp/sdk`. See `acture-mcp` for the cross-language pattern; the PHP specifics are in `acture-php`.
5. **LLM tool calling** — same iteration, `symfony/ai-agent` (`#[AsTool]` + `#[With]`) or `prism-php/prism` (Laravel).
6. **Palette UI** — only if a JS/TS client exists; not a PHP-rendered surface.

Each surface is a separate session and a separate PR. Do not bundle them.

## Checklist before you finish

- [ ] State model designed before any `#[Command]` was authored.
- [ ] `#[Command]` attribute owned by the project (not pulled from a dependency).
- [ ] `CommandRegistry` has duplicate-id detection.
- [ ] The handler contract is `__invoke(DtoClass): mixed` and the architecture test enforces it.
- [ ] JSON Schema is generated at register time, not at dispatch time.
- [ ] CLI surface is up and dispatches at least one command end-to-end.
- [ ] No surface dependency (`mcp/sdk`, `symfony/ai-bundle`, …) was added speculatively.
- [ ] `composer require` did not include Tactician, Prooph, or `spatie/data-transfer-object`.

## See also

- **`acture-php`** — the foundational PHP skill; framework variants, the canonical attribute shape, what NOT to do.
- **`acture-php-strangler`** — the other Dimension-1 path; use that for an existing PHP codebase.
- `acture-greenfield-state-model` — the four hard constraints on the state shape; applies to PHP DTOs identically.
- `acture-command-record-shape` — the closed-surface discipline; the PHP `Command` attribute is the same closed surface.
- `acture-mcp` — the MCP surface; PHP uses `mcp/sdk` (or `laravel/mcp`) instead of the TS SDK.
- `acture-ai` — the LLM tool-calling surface; PHP uses `symfony/ai-agent` or `prism-php/prism`.
- `acture-hard-donts` — the pre-merge anti-pattern checklist.
- [`docs/research/acture_research_7 -- PHP Tooling for a Command-Dispatch Architecture- A Reference Stack and Migration Guide.md`](../../docs/research/acture_research_7%20--%20PHP%20Tooling%20for%20a%20Command-Dispatch%20Architecture-%20A%20Reference%20Stack%20and%20Migration%20Guide.md) — current library versions and the full ecosystem-health table.
