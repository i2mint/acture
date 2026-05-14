---
name: acture-migration-package
description: Load context on `acture-migration` (Phase 3) — its four-function API per research-4 §A.6 (wrapMutation, actureMiddleware, chooseImplementation, shadowCompare), why divertHandler was dropped, the codemod scope deferred to v1.1, and the migration-track skills (migration-diagnose, migration-plan, migration-scaffold, migration-wrap, migration-graduate). Use when working on the migration package, when writing or rewriting migration skills, when designing the strangler-fig adoption workflow, or when an existing-codebase agent is using acture for the first time. Triggers on "migration", "strangler fig", "wrapMutation", "divertHandler", "chooseImplementation", "shadowCompare", "actureMiddleware", "graduate", "codemods", "ast-grep", "jscodeshift", "ts-morph", "event interception", "legacy mimic".
---

# acture migration package

Loads research-4's findings on transitional APIs and codemod tooling for strangler-fig adoption.

## What ships in v1 — four functions (research-4 §A.6)

```ts
// From acture-migration

export function wrapMutation<H extends (...args: any[]) => any>(
  handler: H,
  options?: {
    id?: string;            // defaults to handler.name or auto-generated
    logTo?: Logger;         // defaults to console in dev, noop in prod
    onDispatch?: (id: string, args: Parameters<H>) => void;
  }
): H;

export const actureMiddleware: Middleware; // Redux/Zustand-compatible

export function chooseImplementation<Args extends unknown[], R>(
  pick: () => 'legacy' | 'modern',
  impls: { legacy: (...a: Args) => R; modern: (...a: Args) => R },
): (...a: Args) => R;

export function shadowCompare<Args extends unknown[], R>(
  modern: (...a: Args) => R,
  legacy: (...a: Args) => R,
  options?: { compare?: (a: R, b: R) => boolean; sample?: number },
): (...a: Args) => R;
```

Four exports, all with sensible defaults, none coupling acture to a flag platform.

## Why `divertHandler` was dropped

The original wrapex sketch had `divertHandler(commandId, { legacy, modern, predicate })`. Research-4 §A.5 rejected it for three reasons:

1. **It re-implements feature flags poorly.** Users who care about predicate-based routing already have LaunchDarkly, Statsig, Unleash, or `@vercel/flags`. Coupling acture to a homegrown flag concept makes it worse for those users.
2. **The name is awkward.** "Divert" is nginx vocabulary. In React the established idiom is `chooseImplementation` / `pickHandler`.
3. **The predicate signature couples runtime to user-provided sync code.** What if predicate is async (almost always in real apps)?

`chooseImplementation` is the thin replacement — 5 lines, composes with any flag SDK the user already has.

## What `wrapMutation` does

The load-bearing primitive. The right abstraction for "I have an `onClick` handler I'd like to register without rewriting it." Closest precedent: Backstage's `convertLegacyAppRoot` shim.

```ts
// Before — existing handler
const onSave = () => store.save();

// After — wrapped without changing call site
const onSave = wrapMutation(() => store.save());
// or with explicit ID:
const onSave = wrapMutation(handleSave, { id: 'app.project.save' });
```

**Naming rename (research-4 §A.5):** the parameter is just `handler`, not `legacyHandler`. "Legacy" is a value judgment about code the user wrote yesterday. From acture's perspective there is just `handler`. The fact that it's being wrapped IS the migration signal.

## What `actureMiddleware` does

The store-event interception middleware. Plug into Redux/Zustand store config; it intercepts dispatched actions and routes them through acture's command registry (when registered) so all consumers (palette, AI, MCP, tests) see the same dispatch.

**Critical scope distinction (research-4 §A.5):** This is *store-event* interception. DOM-event interception (intercepting React synthetic events globally) is a HARDER problem (event delegation, portals, shadow DOM) and is **deferred to v1.1**. Don't try to do both in v1.

## What `chooseImplementation` does

5-line legacy/modern router. Composes with any feature-flag SDK.

```ts
const submit = chooseImplementation(
  () => flags.use('new-checkout') ? 'modern' : 'legacy',
  { legacy: oldSubmit, modern: newSubmit },
);
```

The runtime is acture-agnostic — flags come from wherever the user has them.

## What `shadowCompare` does

Scientist-style A/B run. Runs modern, optionally runs legacy in shadow, logs if results differ. Per research-4 §A.3.1: the default is "use new, log if differs" — opposite of `scientist.js`'s "always return old, log if differs", because acture is an adoption library, not a verification tool.

## Codemods — deferred to v1.1

Per research-4 §B.1: every successful AI-driven migration surveyed (Qonto Ember→React, Google int32→int64, react-codemod, rtk-codemods) shipped runtime FIRST, codemods LATER. RTK shipped runtime in 2019; codemods came in late 2023. Adoption was strong throughout.

**The case for v1 codemods is weak; the case for a stable runtime is strong.** Acture follows the same sequencing.

The five codemods deferred to v1.1 (per research-4 §B.5):
- `extract-onclick-to-command` (jscodeshift)
- `redux-action-to-command` (jscodeshift)
- `usestate-mutation-to-command` (jscodeshift)
- `wrap-handler-with-mutation` (ast-grep — declarative)
- `rtk-thunk-to-command` (ts-morph — needs type info)

**Trigger to pull forward into v1:** if within four weeks of v1 release the dominant GitHub issue category is "I don't want to wrap 200 handlers by hand," ship the first two codemods.

## Migration scale thresholds (research-4 §B.4)

| PR size | Best workflow | Why |
| --- | --- | --- |
| 1–200 LoC | **AI-only** (Claude Code, no codemod) | Codemod investment doesn't amortize |
| 200–2,000 LoC | **AI + targeted codemod** | One codemod for repetitive 60%; AI for 40% |
| 2,000–50,000 LoC | Qonto two-pass (AI → codemod → AI → human) | Full pipeline pays off |
| > 50,000 LoC | Codemod-dominant, AI for edges | Google int32→int64 pattern |

**Acture's typical user** — a Claude Code agent migrating a single feature — sits in the 1–2,000 LoC band. Codemods are nice-to-have, not must-have.

## The migration-track skills (Phase 3)

To be written in Phase 3 (NOT this preparation session) — they are rewrites of wrapex's 01-04 against acture's actual API:

| Skill | Purpose |
| --- | --- |
| `migration-diagnose` | Scan codebase; identify command candidates (event handlers, store actions, async thunks); produce a diagnosis report. |
| `migration-plan` | Prioritize candidates into a phased backlog. |
| `migration-scaffold` | Set up `acture/core` and `acture-state-zustand` (or redux) in the host app. |
| `migration-wrap` | Use `wrapMutation` to introduce commands without modifying existing source. |
| `migration-graduate` | Retire `wrapMutation` calls once the legacy handler is unused. |

## How Claude Code invokes these (research-4 §B.6 sketch)

For a typical migration like "adopt acture for the checkout flow":

1. Claude Code reads target files; identifies handlers and store actions.
2. Plans the migration: install `acture-migration`, scaffold registry, wrap handlers, add `actureMiddleware` to store.
3. For each wrap step: invokes `wrapMutation` in-place; runs tsc + tests; iterates if failure.
4. Final review: summary of which calls were wrapped vs. which require manual rewrite.

## What NOT to do

- **Do not ship codemods in v1.** Wait for the four-week-issue-trigger signal.
- **Do not invent a new middleware spec.** Reuse Redux middleware contract (also compatible with Zustand's `subscribeWithSelector` and Jotai's `atomWithStorage` shape).
- **Do not bundle a flag store.** Document integration with LaunchDarkly/Statsig/Unleash with 10-line examples.
- **Do not pull `divertHandler` back in** even if "it would be convenient." Three callers must demonstrate the need with concrete predicate semantics first.

## See also

- `docs/research/acture_research_4 -- Transitional APIs and Codemod Tooling ...md` — the source
- `acture-architecture-primer` — where the migration path fits among the three positioning paths
- `docs/wrapex_carryover.md` — the four wrapex examples that become Phase 3 inputs
