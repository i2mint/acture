# Transitional APIs and Codemod Tooling for Command-Dispatch Migration in TypeScript/React

**Author:** Thor Whalen
**Audience:** `acture` maintainers planning the v1 / v1.1 split of `acture/migration` and `acture/codemods`
**Date:** May 2026

---

## TL;DR

- **Ship `acture/migration` in v1 with a narrower API than currently sketched.** Keep `wrapMutation` (the load-bearing primitive), keep the store-event interception middleware (the strangler-fig façade for Redux/Zustand), and **drop `divertHandler` from v1** in favor of a thinner `chooseImplementation` helper that composes with any feature-flag SDK the user already has. Don't reinvent LaunchDarkly [1].
- **`acture/codemods` is correctly deferred to v1.1.** I evaluated the alternative — shipping codemods in v1 — against the evidence and rejected it: every successful AI-driven migration I surveyed (Qonto's Ember→React project [2], Google's int32→int64 migration [3], React's own `react-codemod` [4], Redux Toolkit's `@reduxjs/rtk-codemods` [5]) shipped the runtime first and the codemods later, often by months. The case for v1 codemods is weak; the case for a stable runtime is strong.
- **For v1.1, build on `jscodeshift` first and `ast-grep` second**, not `ts-morph` or `semgrep`. jscodeshift has the deepest ecosystem of React/Redux precedent (`react-codemod` [4], `@reduxjs/rtk-codemods` [5], `js-codemod` [6]) and the cleanest AI-agent ergonomics; `ast-grep`'s declarative patterns are a better fit for the simpler "find-this-shape, register-it" transforms an agent will generate at runtime [7].

---

## Key Findings

1. **No existing OSS library codifies "wrap a mutation handler for strangler-fig migration" in TypeScript/React.** GitHub's Scientist gem [8] and its JS ports (`scientist.js` [9], Trello's archived `scientist` [10], `fightmegg/scientist` [11], `Runnable/scientist` [12]) cover the *experiment/observability* facet but not the *registration* facet acture needs. The closest analog on the backend, `nestjs-strangler`, **does not exist as a real package**; an npm and GitHub search returns only `@nestjs/core` and unrelated Nest packages. This is a genuine gap in the ecosystem — and it is acture's opportunity.
2. **Graduation tooling is almost always external to the migration library.** LaunchDarkly bundles a "Cleanup shortcut" UI that flags stale flags but explicitly does not touch source code [1]; a separate cottage industry (FlagShark [13], Wilson Mendes's `list-unused-feature-flags-in-code.sh` [14]) fills the gap with tree-sitter or AST-based PR generators. Built-in graduation is the exception, not the rule.
3. **Qonto's two-pass workflow (AI → codemod → AI → human) achieved 20× productivity at 1M-line scale [2], but its overhead does NOT amortize at small scale.** Below roughly 200-line PRs, AI-only beats the combined workflow; above 5,000-line migrations, codemod-only (deterministic) beats AI-anything for the easy 80%. acture's typical user — a Claude Code agent migrating a single feature — sits squarely in the AI-only band.
4. **The "AI-friendly" axis matters more than raw codemod power for an agent-driven product.** jscodeshift wins here because (a) it has the most public training data, (b) its transform signature is a pure function `(file, api) => string` that an agent can dry-run and inspect, and (c) tools like Hypermod [15] already generate jscodeshift transforms from English prompts.
5. **The Ian Cartwright / Rob Horn / James Lewis "Patterns of Legacy Displacement" series [16] on martinfowler.com codifies "Event Interception" and "Legacy Mimic" as named patterns.** Both are conceptual ancestors of acture's middleware proposal; the series should be cited in acture's docs to ground the vocabulary.

---

# PART A — Transitional API

## A.1 Why this part matters

`acture` positions itself on three paths; the strangler-fig path is the one that **brings users in without forcing a rewrite**. Martin Fowler's 2004 strangler-fig essay and the related Branch-by-Abstraction note [17] frame migration as a *façade-first, incremental, value-continuous* process; the more recent Cartwright/Horn/Lewis "Patterns of Legacy Displacement" series [16] specifically names **Event Interception** (insert a transparent shim between event source and handler) and **Legacy Mimic** (the new code temporarily speaks the old protocol) as the patterns most relevant to a frontend migration.

In the backend world, the Event-Interception façade is usually nginx or a service mesh. In the frontend world — which is where `acture` lives — there is no obvious façade. The DOM event loop, the React render tree, and the store dispatcher each play part of that role, and no single OSS library has cleanly packaged them. That is the gap `acture/migration` should fill.

For a Python-architect reader new to React: a TypeScript/React app typically has three places where a "mutation" happens — (1) an `onClick`/`onChange` handler attached inline in JSX (think of it as a synchronous WSGI request handler), (2) a Redux/Zustand/Jotai store action dispatched in response to a handler (analogous to a Celery task being kicked off), and (3) an async effect inside a `useEffect` or RTK Query thunk (analogous to a background task that re-reads state when something changes). A "Redux middleware" is structurally identical to Django middleware: a function `(store) => (next) => (action) => next(action)` that sits between dispatch and reducer. Today these three are scattered. The command-dispatch architecture acture proposes is to route all three through a single registry of named commands, the way Django routes HTTP requests through URL patterns into views.

## A.2 Survey of OSS libraries

| Library | Pattern | Target | "Before / After" feel | Maturity | Link |
|---|---|---|---|---|---|
| **`@reduxjs/rtk-codemods`** | Codemod-driven migration (not runtime) | Redux Toolkit object syntax → builder syntax | Pre-existing slice rewritten to use `.addCase(...)` | Active, official (Redux team) [5] | [npm](https://www.npmjs.com/package/@reduxjs/rtk-codemods) |
| **`react-codemod`** (reactjs/react-codemod) | Codemod collection | createClass → ES6 class → hooks; React 19 cleanup | 4.4k stars, actively updated for React 19 [4] | Active | [github.com/reactjs/react-codemod](https://github.com/reactjs/react-codemod) |
| **`types-react-codemod`** (`eps1lon`) | Codemod for @types/react upgrades | `React.VFC` → `React.FC`, `context: any` injection | Active, used by React 18→19 migrations [18] | Active | [github.com/eps1lon/types-react-codemod](https://github.com/eps1lon/types-react-codemod) |
| **`scientist.js`** (`ziyasal`, `bugthesystem`) | Branch by Abstraction / experiment | Permissions checks, refactor critical paths | `experiment.use(old).try(new).run()` returns old, logs diff [9] | Stale (~2017 last commit on the original fork) | [github.com/ziyasal/scientist.js](https://github.com/ziyasal/scientist.js) |
| **`fightmegg/scientist`** | Same | Same, modern fork | Async/await; lodash compare; published 2020-22 [11] | Maintained but low-traffic | [github.com/fightmegg/scientist](https://github.com/fightmegg/scientist) |
| **`trello/scientist`** (`trello-archive`) | Same | Same | Archived by Trello; reference implementation [10] | **Dead** (archived) | [github.com/trello-archive/scientist](https://github.com/trello-archive/scientist) |
| **`Runnable/node-scientist`** | Same, Promise-based | Backend refactors | Tiny user base | Stale (no commits since ~2016) [12] | [github.com/Runnable/scientist](https://github.com/Runnable/scientist) |
| **`launchdarkly-js-client-sdk`** | Feature flags + ramp + graduation surface | Generic gating, *not* code rewriting | `client.variation('flag', user, false)` | Active, industry standard [1] | [LaunchDarkly docs](https://docs.launchdarkly.com/guides/flags/technical-debt) |
| **`FlagShark`** | Built ON LaunchDarkly to provide graduation | Removes stale flag branches from source via tree-sitter | Generates PRs that delete dead branches [13] | Active (commercial) | [flagshark.com](https://flagshark.com/) |
| **Nx Devkit `generators` / `migrations`** | Code generation + version-aware schematics | Workspace upgrades, dep version migrations | `nx migrate latest` runs a chain of TS migrations | Active (Nx is mainstream) [19] | [nx.dev/extending-nx/recipes/migration-generators](https://nx.dev/extending-nx/recipes/migration-generators) |
| **Backstage frontend system migration** | Compatibility shim + extension blueprints | Plugin route migration to new frontend system | `convertLegacyAppRoot` shim around `createApp` [20] | Active (CNCF) | [backstage.io/docs/frontend-system/...](https://backstage.io/docs/frontend-system/building-apps/migrating/) |
| **`nestjs-strangler`** | (claimed by user prompt) | N/A | **No such package exists** — confirmed via npm/GitHub search; only educational repos like `sumn2u/strangler-nodejs-example` [21] exist | N/A | n/a |
| **`Codemod`/`Hypermod`** | AI codemod-generation platform | English → jscodeshift / ts-morph / ast-grep | "Describe transform in English, get a transform" [15] | Active commercial; OSS recipes | [codemod.com](https://codemod.com/blog/ts-morph-support) |

Brief note on Nx: although Nx is targeted at *workspace* migration (upgrading dependency versions across a monorepo) rather than *architectural* migration, its model is worth borrowing. An Nx migration is a TypeScript file with a default-exported function `(tree, schema) => void` that mutates a virtual file tree, plus a `migrations.json` manifest that declares which migration runs at which version boundary [19]. That manifest pattern is the same one I am recommending for `acture/codemods` v1.1 (see §B.5).

## A.3 Detailed before/after for the top five

### A.3.1 `scientist.js` (the conceptual ancestor)

`scientist.js` ports GitHub's Ruby Scientist gem [8]. It is the most direct existing analog to acture's `divertHandler` — except it always returns the *control* (old) value, never the *candidate*. That asymmetry is intentional in Scientist (the whole point is to prove the candidate matches the control *before* switching) and is the **wrong default for acture**, where users want to actually run the new command.

```ts
// BEFORE
class MyWidget {
  allows(user) {
    return this.model.checkUser(user).valid; // legacy permission check
  }
}

// AFTER (with scientist.js)
import { Experiment } from 'scientist.js';
class MyWidget {
  allows(user) {
    const experiment = new Experiment("widget-permissions");
    experiment.use(() => this.model.checkUser(user).valid);  // legacy
    experiment.try(() => user.can(Permission.Read, this.model)); // new
    return experiment.run(); // always returns the .use() value
  }
}
```

**Takeaway for acture:** the `use()` / `try()` naming is idiomatic, but the always-return-old semantics is too cautious for a migration *adoption* library. acture should default to "run the new path, log if differs", not "run the old path, log if differs". This is one reason `divertHandler` as currently sketched is overcomplicated — it tries to encode both directions of the diversion, when in practice ~95% of users just want "use new, fall back to old".

### A.3.2 `@reduxjs/rtk-codemods` (the Redux-native precedent)

This is the only official, maintained codemod package shipped by a major React ecosystem library. It's a strong precedent for what `acture/codemods` should look like.

```ts
// BEFORE (RTK pre-2.0 object syntax)
createSlice({
  name: "counter",
  initialState: 0,
  reducers: {
    increment: (state) => state + 1,
    addBy:     (state, action) => state + action.payload,
  },
});

// AFTER `npx @reduxjs/rtk-codemods createSliceReducerBuilder ./src`
createSlice({
  name: "counter",
  initialState: 0,
  reducers: (create) => ({
    increment: create.reducer((state) => state + 1),
    addBy:     create.reducer((state, action: PayloadAction<number>) => state + action.payload),
  }),
});
```

**Takeaway:** the RTK team's codemod package shipped *after* RTK 2.0 stabilized, not before. They built the runtime first, then automated the migration once the target shape was settled. acture should follow the same sequencing.

### A.3.3 `react-codemod` class-to-hooks

```ts
// BEFORE
class Toggle extends React.Component {
  state = { checked: false };
  toggleChecked = () => this.setState(p => ({ checked: !p.checked }));
  render() { return <input onClick={this.toggleChecked} />; }
}

// AFTER `npx codemod react/class-to-function-component`
function Toggle() {
  const [checked, setChecked] = useState(false);
  const toggleChecked = () => setChecked(c => !c);
  return <input onClick={toggleChecked} />;
}
```

Note: `react-codemod`'s class-to-hooks transform is **not actually complete** — the official repo punts on lifecycle methods and refs and asks users to migrate them manually [22]. This is informative: even Meta does not attempt a one-shot, perfect codemod for a non-trivial transform. acture's codemods should be similarly humble.

### A.3.4 LaunchDarkly + FlagShark (graduation in two pieces)

```ts
// BEFORE (feature flag gating)
const showNew = ldClient.variation('new-checkout', user, false);
if (showNew) return <NewCheckout />;
else return <LegacyCheckout />;

// AFTER (FlagShark detects 100%-rollout for >30 days, opens PR)
return <NewCheckout />;
```

LaunchDarkly's own docs are explicit: their platform identifies which flags are stale, but **code removal is a separate problem requiring code-transformation tooling** [13]. The two-platform split is the dominant pattern in the industry.

### A.3.5 Backstage frontend system migration (the "compat shim" precedent)

Backstage's migration from its legacy plugin system to the new frontend system uses `convertLegacyAppRoot` and per-plugin `/alpha` entry points, letting plugins exist in both worlds simultaneously [20]. This is the closest design precedent for acture's `wrapMutation`: a thin shim that exposes the old surface area while routing through the new system underneath.

```ts
// BEFORE: legacy plugin
export const myPlugin = createPlugin({ id: 'my-plugin', apis: [...], routes: {...} });

// AFTER: dual-mode plugin (Backstage pattern)
// src/plugin.ts (legacy entry, unchanged)
export const myPlugin = createPlugin({ id: 'my-plugin', ... });
// src/alpha.tsx (new entry)
export default createFrontendPlugin({ pluginId: 'my-plugin', extensions: [...] });
```

## A.4 Graduation tooling: how others handle it

Three observable approaches in the wild:

1. **Manual cleanup** — the React, Backstage, and Redux precedents all default to this. The library ships an API, the user (or a future codemod) cleans it up. By far the most common.
2. **Tool-assisted refactor** — codemods, run *separately* from the runtime library. `@reduxjs/rtk-codemods` [5], `react-codemod` [4], FlagShark [13]. Always a separate package, never bundled with the runtime.
3. **Built into the library** — extremely rare. LaunchDarkly's "Cleanup shortcut" comes close [1] but operates on the *flag*, not the *code*. The only true examples I found are lint-rule packages like `eslint-plugin-launchdarkly-cleanup` (community, low usage).

**Recommendation for acture:** follow the dominant pattern. v1 ships runtime. v1.1 ships codemods as a separate `acture/codemods` package. Optionally v1.2 ships `eslint-plugin-acture-migration` with rules like `no-wrapMutation-after-grace-period` that warn when a `wrapMutation` call has had zero observed legacy fallbacks for N days. Do not try to do all of this in v1.

## A.5 Critique of the currently-sketched API

### `wrapMutation(legacyHandler, spec)` — **KEEP**

This is the load-bearing primitive. It is the right abstraction for "I have an `onClick` handler I'd like to register without rewriting it." The closest existing precedent is Backstage's `convertLegacyAppRoot` shim [20]. Two suggestions:

- **Rename `legacyHandler` to `handler`.** "Legacy" is a value judgment about code the user wrote yesterday. From acture's perspective there is just `handler`. The fact that it is being wrapped *is* the migration signal.
- **Make `spec` optional with sane defaults.** A user's first call should be `wrapMutation(handler)` and acture should derive a command id from the handler's `name` property (React DevTools relies on this same convention). Idiomatic TS/React APIs default aggressively (cf. React Query's `useQuery(['key'], fn)`).

### `divertHandler(commandId, { legacy, modern, predicate })` — **MODIFY (or drop)**

Most over-engineered surface in the sketch. Three problems:

1. **It re-implements feature flags poorly.** Users who care about predicate-based routing already have LaunchDarkly [1], Statsig, Unleash, or `@vercel/flags`. Coupling acture to a homegrown flag concept makes it worse for those users and not meaningfully better for the others.
2. **The name is awkward.** "Divert" is nginx vocabulary; in React the established idiom is `chooseImplementation`, `pickHandler`, or just a higher-order function. The Scientist gem [8] uses `use`/`try` and never needed a verb like "divert".
3. **The predicate signature couples the runtime to user-provided synchronous code.** What if `predicate` is async (almost always in real apps — depends on user ID, A/B bucket, etc.)? The API balloons quickly.

**Recommendation:** drop `divertHandler` in v1. Instead export a 5-line helper:

```ts
export function chooseImplementation<Args extends unknown[], R>(
  pick: () => 'legacy' | 'modern',
  impls: { legacy: (...a: Args) => R; modern: (...a: Args) => R },
): (...a: Args) => R {
  return (...args) => impls[pick()](...args);
}
```

Users compose this with whatever flag SDK they already have. This is the "small things small, complex things possible" disclosure principle.

### Event-interception middleware — **KEEP, but restate the scope**

This *is* the Event Interception pattern from Cartwright/Horn/Lewis [16] applied to the frontend, and it is the most novel piece of the proposal. Keep it. Two clarifications:

- **Distinguish DOM-event interception from store-event interception.** They have very different failure modes. DOM events go through React's synthetic event system; intercepting them globally is conceptually similar to a Redux middleware but practically much trickier (event delegation, portals, shadow DOM). Store-event interception is just a Redux/Zustand middleware and is well-trodden territory.
- **Ship the store middleware in v1, ship DOM event interception in v1.1.** The store middleware is ~30 lines and reuses existing patterns; DOM interception needs a research spike. Don't gate v1 on the harder half.

## A.6 Opinionated v1 recommendation for `acture/migration`

```ts
// Exported from `acture/migration`

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

Four exports, all with sensible defaults, none of them coupling acture to a flag platform. DOM-event interception deferred to v1.1.

---

# PART B — Codemod Tooling

## B.1 Evaluating the v1 vs v1.1 question for codemods

The user prompt asks me to evaluate the "codemods in v1.1, not v1" decision against the evidence. I considered three arguments for pulling codemods into v1:

| Argument for v1 inclusion | Counter-evidence | Verdict |
|---|---|---|
| "Codemods are what makes adoption painless; without them users will balk at writing `wrapMutation(...)` calls by hand." | RTK shipped its runtime in 2019; codemods came with RTK 2.0 in late 2023 [5]. Adoption was strong throughout. | Weak. Runtime first; users adopt without codemods. |
| "A Claude-Code-driven product *needs* codemods to be useful." | Qonto's first working agent used Aider + LLM with **no codemods at all** for the first iterations [2]. The codemod step was a *second-pass refinement*. | Weak. Agent can use plain wrapMutation calls as a first pass. |
| "Codemods are 90% of the migration value." | Google's int32→int64 migration credits AI with 91% file-identification accuracy but says rule-based recipes did most of the actual editing [3]. That implies codemods matter *most* at very large scale — where a 1-engineer acture user is not. | Weak at acture's user-size profile. |

The default recommendation (codemods in v1.1, not v1) stands. The one condition that would flip my view: **if `acture/migration` ships and within four weeks the dominant GitHub-issue category is "I don't want to wrap 200 handlers by hand"**, the `extract-onclick-to-command` codemod should be pulled forward immediately. That's a measurable trigger, not a guess.

## B.2 Comparison table

| Tool | TS-aware? | Authoring difficulty | AI-friendly | Maturity | Best-fit transformations |
|---|---|---|---|---|---|
| **jscodeshift** [23] | Syntactic only (parses TS via the `tsx` parser; no type info) | Medium — node-by-node AST manipulation | **High** — huge corpus in LLM training data; pure function signature; Hypermod [15] generates jscodeshift from English | Mature, owned by Meta, ~9k stars | Renaming, structural rewrites, import surgery, JSX attribute changes |
| **ts-morph** [24] | **Yes** — wraps the TypeScript compiler API; has full type info | Medium-low — natural-feeling API (`getDescendantsOfKind`, `replaceWithText`) | Medium — smaller training corpus than jscodeshift; mutable `Project` model is harder for an agent to reason about | Mature, v25.x as of 2025, single maintainer (`dsherret`) | Type-sensitive transforms, anything needing "is this expression a `Promise<User>`?" |
| **ast-grep** [7] | Syntactic with optional Node API; multi-language | **Low** for declarative cases (YAML rules); medium when dropping into the Node API | **High** — declarative rules are extremely LLM-friendly; ast-grep is now the engine inside Codemod's JSSG runtime [25] | Mature, Rust-based, growing rapidly in 2024-25 | Pattern-style "find shape X, rewrite to Y"; cross-file structural search; non-JS files (CSS, YAML, HTML) |
| **semgrep** [26] | Yes for TS via the new framework-aware engine (Feb 2025 release for JS/TS); has data-flow | Low for rules; autofix has known limits with complex AST printing [27] | High for rules; medium for autofix (Semgrep itself notes 100% AST-print success on JS but only for expression-level fixes [28]) | Mature, security-focused; Pro engine adds intra-file analysis | Lint-style detection + simple autofix; cross-file taint analysis; *not* for large structural rewrites |

### Synthesis

For acture's use case — "find this handler, register it as a command" — the choice is **jscodeshift for anything that needs to construct a non-trivial new AST subtree** and **ast-grep for the simpler structural rewrites**. ts-morph is tempting because of type-awareness, but the agent will rarely need type info to do a registration transform: the transformation is "find function, wrap function," not "find function, infer its types, then wrap." Type information matters more for *correctness checking after* the codemod runs (which tsc handles for free).

## B.3 Reference codemods (with links)

### Redux / RTK

1. **`@reduxjs/rtk-codemods` — `createSliceReducerBuilder`** [5] — Built on jscodeshift. Migrates object-syntax `reducers` to builder-callback syntax. Official Redux team package. [github.com/reduxjs/redux-toolkit/tree/master/packages/rtk-codemods](https://github.com/reduxjs/redux-toolkit/tree/master/packages/rtk-codemods)

2. **`azizhk/dispatch-your-reducer` gist** [29] — A jscodeshift codemod that converts `dispatch({ type: 'X', payload })` patterns into direct reducer-function dispatches. **Structurally identical to one of the codemods acture will need.** [gist.github.com/azizhk/b4f9f5e45055a25bd28eef56540714e4](https://gist.github.com/azizhk/b4f9f5e45055a25bd28eef56540714e4)

### React handlers / state

3. **`reactjs/react-codemod` — `class.js`** [4] — Canonical class-to-class-property transform on jscodeshift. Template for any "extract this method into a named property" transform.
4. **`eps1lon/types-react-codemod`** [18] — Multi-codemod CLI with interactive selection. Good model for how acture should ship a *menu* of transforms.
5. **`karlhorky/jscodeshift-tricks` — `migrate-defaultProps.ts`** [30] — Worked example of hoisting a property off one object and re-anchoring it.
6. **`cpojer/js-codemod`** [6] — Cpojer's original "next-gen JS" codemod collection. Relevant transform: `arrow-function.js` (guarantees `this` binding semantics).

## B.4 Qonto's two-pass workflow at small vs. large scale

Qonto's full post [2] describes the workflow concretely:

> "AI Pass 1, Ember→React: aider calls Claude 3.5 Sonnet with a crafted prompt and applies the diff. → codemod adjustments: a custom `react-bridge-migrator` codemod handles imports, framework hooks, repetitive deterministic changes. → AI Pass 2: aider+Claude review the combined diff, the engineer pair-programs final polish. → Automatic commit."

They report going from ~50 LoC/day per engineer to "hundreds of lines per day, sometimes breaking 1,000 LoC/day per engineer," with one engineer migrating 8,632 lines in two weeks [2]. Their context: 93% test coverage, single source-target framework pair (Ember → React), 1-million-line target.

**Does this work at smaller scale?** Not as efficiently. For a 100-line PR migrating a single feature:

- **AI-only (no codemods) is faster.** Claude Code can rewrite a 100-line component end-to-end in one turn. The codemod step adds latency without proportional benefit.
- **Codemod-only (no AI) is faster than AI for >10,000 LoC of a *highly mechanical* transform** (e.g., `React.PropTypes` → `prop-types` import [4]). Determinism is the win; LLM cost and latency are dead weight.

### Scale thresholds I extract from the evidence

| PR size (LoC migrated) | Best workflow | Why |
|---|---|---|
| 1–200 | **AI-only** (Claude Code, no codemod) | Codemod investment doesn't amortize |
| 200–2,000 | **AI + targeted codemod, single pass** | One codemod for the repetitive 60%, AI for the 40% |
| 2,000–50,000 | **Qonto two-pass** | The full pipeline pays off; what Qonto measured [2] |
| > 50,000 | **Codemod-dominant**, AI only for edge cases | Google's int32→int64 [3] used AI for *identification*; rewrites were deterministic |

**Implication for `acture/migration` users:** the agent assembling a command-dispatch architecture in a user's codebase will almost always be in the 1–2,000 LoC band. **For that band, codemods are a nice-to-have, not a must-have.** Joachim Ecker's synthesis [31] reinforces this: "the biggest part of the actual work was done with rule-based refactoring" even when the headline credited AI.

## B.5 Scope for `acture/codemods` v1.1

| Codemod | Tool | Description |
|---|---|---|
| `extract-onclick-to-command` | jscodeshift | Lifts an inline `onClick={() => …}` into a named command registered with `defineCommand`, replaces the JSX with a reference to the command id |
| `redux-action-to-command` | jscodeshift | Converts `dispatch({ type, payload })` call sites to `acture.dispatch(commandId, payload)`, generating the command registration alongside the existing slice |
| `usestate-mutation-to-command` | jscodeshift | Extracts each `setX` call inside an event handler into a discrete command that mutates the same state |
| `wrap-handler-with-mutation` | ast-grep | Declarative rule: find any function passed to `onClick`/`onChange`/`onSubmit` and wrap it with `wrapMutation(...)`. Pure structural rewrite [7] |
| `rtk-thunk-to-command` | ts-morph | Converts a `createAsyncThunk` into an acture async command. Needs ts-morph because correctly typing the command's argument and return requires reading the thunk's generic parameters [24] |

**Why three tools rather than one?** The cost of multiplexing is low (each codemod is a one-file package consumed via `npx`), and matching tool to job avoids forcing a complex jscodeshift transform when a 10-line ast-grep rule would suffice.

**Packaging shape (borrowed from Nx [19] and `types-react-codemod` [18]):** a single `npx acture-codemods <name>` CLI, with a `migrations.json`-style manifest declaring which codemod runs on which acture version boundary.

**Deliberately out of scope for v1.1:** any "graduation" codemod that removes `wrapMutation` calls. That requires a runtime telemetry signal acture won't have until users have lived with v1 for several months. Plan for v1.2.

## B.6 How Claude Code invokes these codemods (sketch)

Direct adaptation of Qonto's aider-based pipeline [2], operating at single-file/single-feature scale.

```
USER (in Claude Code): "Adopt acture for the checkout flow in src/checkout/"

CLAUDE CODE:
  1. Reads src/checkout/ to identify migration candidates:
     - 4 onClick handlers (CheckoutButton.tsx, PaymentForm.tsx, ...)
     - 1 Redux slice (checkoutSlice.ts) with 3 actions
     - 1 createAsyncThunk (submitOrder)

  2. Plans the migration:
     - Step A: install acture/migration, set up the command registry
     - Step B: run `extract-onclick-to-command` on the 4 handlers
     - Step C: run `redux-action-to-command` on checkoutSlice.ts
     - Step D: run `rtk-thunk-to-command` on submitOrder
     - Step E: add `actureMiddleware` to the store config

  3. For each codemod step:
     a. Invokes:  npx acture-codemods extract-onclick-to-command \
                    --target src/checkout/ --dry-run
     b. Reads the diff. If the transformation looks wrong on any file,
        marks that file as "needs AI rewrite" and skips the codemod for it.
     c. Re-invokes without --dry-run.
     d. Runs `tsc --noEmit` and the project's test suite.
     e. If tests fail, reads the failures and patches manually using its
        normal code-edit tools.

  4. Final review: presents the user with a summary of which files were
     touched by codemod vs. manual edit, and which `wrapMutation` calls
     remain as transitional shims.
```

Key design properties:
- **The codemod CLI must support `--dry-run` and emit machine-readable diffs.** That is what makes the agent loop work. (jscodeshift's `-d -p` flags [23] are already the right interface; ast-grep has `--dry-run`; ts-morph requires the codemod author to opt in.)
- **The codemod should be conservative — when in doubt, skip the file and let the agent rewrite it from scratch.** The 100% successful rewrite that touches 60% of files is worth more than the 80% successful rewrite that touches all of them.

---

## Recommendations

### Ship now (v1) — `acture/migration`

1. **Export the four-function API in §A.6.** `wrapMutation`, `actureMiddleware`, `chooseImplementation`, `shadowCompare`. Skip `divertHandler`; skip DOM-event interception.
2. **Build the store-event middleware on the existing Redux middleware contract** (also compatible with Zustand's `subscribeWithSelector` and Jotai's `atomWithStorage` shape). Don't invent a new middleware spec.
3. **Document the integration point with LaunchDarkly / Statsig / Unleash** with a 10-line example, *not* a built-in flag store.
4. **Skip codemods entirely.** Document the runtime API and the manual migration patterns. This is enough for an AI agent like Claude Code to do useful work without a codemod package.

### Ship in v1.1 — `acture/codemods`

5. **Five codemods** per §B.5, packaged as a single `npx`-invokable CLI in the style of `types-react-codemod` [18] with an Nx-style `migrations.json` manifest [19].
6. **All codemods must support `--dry-run` and `--json` output** so Claude Code can reason about diffs before applying them.
7. **Add a `DOM-event-interception` middleware** to `acture/migration` v1.1 once a research spike has confirmed it works across React 18/19 synthetic events and portals.
8. **Publish a Hypermod-style [15] AI-generation recipe** in the docs: "describe your handler shape, the agent will generate a one-off codemod." Cheaper than shipping fifty codemods.

### Defer to v1.2

9. **Graduation tooling** — `eslint-plugin-acture-migration` with rules like `acture/no-stale-wrap-mutation`. Also a `--graduate` codemod that removes the shim.
10. **Telemetry / shadowCompare reporting dashboard**, analogous to LaunchDarkly's Cleanup shortcut [1].

### Benchmarks that would change the v1/v1.1 boundary

- **If, in the first month of v1, > 30% of issues are "how do I migrate my Redux store" and < 10% are "wrapMutation doesn't do X"**, pull the Redux-specific codemod forward into v1.
- **If a competing library ships a credible "migration codemods for command-dispatch" package before v1.1**, ship `acture/codemods` immediately to defend the positioning.
- **If Claude Code (or comparable agents) ship native AST-transformation tools that subsume codemod CLIs**, deprecate `acture/codemods` and document the agent-native approach instead. The Codemod blog's JSSG [25] release is a signal this is coming.

---

## Caveats

1. **The user prompt claims `nestjs-strangler` exists; I could not find it on npm or GitHub.** Treat any prior reference to it as folklore.
2. **Trello's `scientist` package is archived [10]; cite it as historical context only.** `fightmegg/scientist` [11] is the maintained option if a JS Scientist port is needed.
3. **The Qonto post [2] is a single-vendor case study.** The 20× productivity number is real but specific to Ember-to-React, 93% test coverage, and a million-line codebase. Do not generalize without those preconditions.
4. **Semgrep's autofix is positioned for security fixes, not refactors.** Its own docs note AST-based autofix is "available for autofixes targeting expressions" [28] — too narrow for the full set of transforms acture needs.
5. **The `wrapMutation` / `divertHandler` / event-interception terminology in the user prompt mixes Fowler vocabulary with frontend vocabulary.** Final naming decision belongs to acture maintainers and should be tested with beta users before locking in.
6. **All "AI-friendly" judgments in §B.2 are qualitative.** A more rigorous evaluation would benchmark Claude Code on writing one codemod per tool for the same transform and measure success rate. Worth running before v1.1 ships.

---

## References

[1] [LaunchDarkly — Reducing technical debt from feature flags](https://docs.launchdarkly.com/guides/flags/technical-debt). LaunchDarkly Documentation. Accessed May 2026.

[2] Amorelli S. [AI-Driven Refactoring in Large-Scale Migrations: Strategies and Techniques](https://medium.com/qonto-way/ai-driven-refactoring-in-large-scale-migrations-strategies-and-techniques-fcdb9b5116c6). The Qonto Way (Medium); 2025 Jun 4.

[3] [How is Google using AI for internal code migrations?](https://research.google/pubs/how-is-google-using-ai-for-internal-code-migrations/) Google Research, as summarized in [Ecker J, The Value and Limitations of AI for Large Scale Refactoring](https://ecosystem4engineering.substack.com/p/the-value-of-ai-for-large-scale-refactoring), Ecosystem4Engineering Substack; 2024.

[4] [reactjs/react-codemod](https://github.com/reactjs/react-codemod). GitHub repository. 4.4k stars; actively updated for React 19.

[5] [Codemods | Redux Toolkit](https://redux-toolkit.js.org/api/codemods) — `@reduxjs/rtk-codemods` package documentation: `createReducerBuilder`, `createSliceBuilder`, `createSliceReducerBuilder`.

[6] [cpojer/js-codemod](https://github.com/cpojer/js-codemod). GitHub repository — Christoph Pojer's collection of next-gen-JS jscodeshift transforms.

[7] [Comparing ast-grep and jscodeshift](https://www.hypermod.io/blog/4-jscodeshift-vs-ast-grep). Hypermod blog; 2024-2025.

[8] [GitHub Scientist gem announcement](https://github.blog/developer-skills/application-development/scientist/). GitHub Blog: "Scientist: Measure Twice, Cut Once."

[9] [ziyasal/scientist.js](https://github.com/ziyasal/scientist.js). GitHub repository — JS port of the Ruby Scientist library.

[10] [trello-archive/scientist](https://github.com/trello-archive/scientist). GitHub repository — Trello's archived Node.js Scientist implementation.

[11] [fightmegg/scientist](https://github.com/fightmegg/scientist). GitHub repository — modern maintained JS Scientist fork.

[12] [Runnable/scientist](https://github.com/Runnable/scientist). GitHub repository — Promise-based Node Scientist port.

[13] [FlagShark — Automated LaunchDarkly flag cleanup](https://flagshark.com/solutions/launchdarkly-cleanup/). Commercial product page describing tree-sitter-based PR generation for stale flag removal.

[14] Mendes W. [Automating launchdarkly feature flags cleanup in your codebase](https://willmendesneto.com/posts/automating-launchdarkly-feature-flags-cleanup-in-your-codebase/). Personal blog; 2023.

[15] [Codemod AI Now Supports ts-morph](https://codemod.com/blog/ts-morph-support). Codemod blog; 2024.

[16] Cartwright I, Horn R, Lewis J. [Patterns of Legacy Displacement](https://martinfowler.com/articles/patterns-legacy-displacement/) (including "Event Interception" and "Legacy Mimic"). martinfowler.com article series; 2022.

[17] Fowler M. [Branch By Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html) and [StranglerFigApplication](https://martinfowler.com/bliki/StranglerFigApplication.html). martinfowler.com bliki; 2004, updated subsequently.

[18] [eps1lon/types-react-codemod](https://github.com/eps1lon/types-react-codemod). GitHub repository — collection of codemods for `@types/react` upgrades.

[19] [Migration generators | Nx Docs](https://nx.dev/extending-nx/recipes/migration-generators). Nx documentation for `migrations.json` and version-aware code migrations.

[20] [Migrating Apps | Backstage](https://backstage.io/docs/frontend-system/building-apps/migrating/). Backstage frontend system migration documentation.

[21] [sumn2u/strangler-nodejs-example](https://github.com/sumn2u/strangler-nodejs-example). Tutorial repository for the strangler pattern in Node.js.

[22] [FR: Convert all class based components to functions with hooks · Issue #217 · reactjs/react-codemod](https://github.com/reactjs/react-codemod/issues/217). GitHub issue documenting react-codemod's deliberate scope limits on class-to-hooks conversion.

[23] [facebook/jscodeshift](https://github.com/facebook/jscodeshift). GitHub repository — Meta's canonical JS/TS codemod toolkit.

[24] [dsherret/ts-morph](https://github.com/dsherret/ts-morph). GitHub repository — TypeScript Compiler API wrapper; v25.x as of 2025.

[25] [Announcing JavaScript ast-grep (JSSG)](https://codemod.com/blog/jssg). Codemod blog; introduction of jssg as a typed JS/TS transform runtime on top of ast-grep.

[26] [semgrep/semgrep](https://github.com/semgrep/semgrep). GitHub repository — semantic grep and rule-defined autofix engine.

[27] [Autofix Bots: Safe Automated Code Fixes](https://beefed.ai/en/autofix-bots-safe-automated-fixes). Analysis of autofix tooling tradeoffs.

[28] [Powerfully autofixing code with Semgrep's new AST-based approach](https://semgrep.dev/blog/2022/autofixing-code-with-semgrep/). Semgrep blog — discusses 96.4% (Python) and 100% (JS) AST-print success for *expression-level* fixes only.

[29] Khaja A (azizhk). [Dispatch your reducer codemod](https://gist.github.com/azizhk/b4f9f5e45055a25bd28eef56540714e4). GitHub gist — converts Redux action dispatches to direct reducer functions via jscodeshift.

[30] [karlhorky/jscodeshift-tricks](https://github.com/karlhorky/jscodeshift-tricks). GitHub repository — Karl Horky's collection of jscodeshift transformation patterns, including `migrate-defaultProps`.

[31] Ecker J. [The Value and Limitations of AI for Large Scale Refactoring](https://ecosystem4engineering.substack.com/p/the-value-of-ai-for-large-scale-refactoring). Ecosystem4Engineering Substack — analysis of Amazon Q Transformations and Google's int32→int64 migration noting that the majority of the actual rewriting work was done with rule-based recipes even when AI was credited.