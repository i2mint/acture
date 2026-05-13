# State-Management Substrate Trade-offs for the Acture Command-Dispatch Architecture

*Author: Thor Whalen — May 12, 2026*

**File saved**: `research_findings_prompt_3.md` (Google Drive ID `1jrpiDZSZSfDnxIpZsHb1w-k-6K0yv3ub`)

---

## TL;DR

- **Ship a thin three-method `StateAdapter<S>` interface** (`getState`, `setState(updater)`, `subscribe(listener)`) plus an **optional `PatchCapableAdapter` sub-interface** for the future undo subsystem. This is sufficient to satisfy acture's four substrate constraints for every mainstream library while keeping the load-bearing decision Eric Elliott identifies — *pure reducer over plain data* — at the acture command layer, not in the adapter [1].
- **Phase 1 reference adapters**: `acture/state-zustand` (with the official `zustand/middleware/immer`) and `acture/state-redux` (Redux Toolkit). They cover the dominant share of React install base, are trivial to adapt, and natively meet all four constraints. **Phase 2**: Jotai and Valtio (pmndrs family). **Leave to users**: MobX, Effector, XState.
- **Be agnostic, but document a happy path.** Ship the interface as the SSOT and ship the zustand+immer adapter as the *documented default* — agnostic at the type-system boundary, opinionated in the tutorial.

## Executive Summary

Acture aims to keep its state-management substrate replaceable so that an AI coding agent installing it can wire up whatever store the user's codebase already uses (or wants to use). The question, then, is not *which library is best* but *what is the minimum interface that lets multiple libraries plug in cleanly without compromising acture's four hard constraints*: Immer-style patches for a future undo subsystem, a `subscribe`-shaped observable for `commandsChanged` broadcasts, statically-typed slices that AI tool descriptions can reference, and JSON-serializable state snapshots for replay-based testing.

The research surveys seven candidate libraries — zustand, Redux Toolkit, Jotai, MobX, Valtio, Effector, and XState — across those four axes plus boilerplate cost, and finds that all seven can satisfy a small three-method interface (`getState` / `setState(updater)` / `subscribe(listener)`) callable outside React. The only constraint that does *not* generalize is patches: Redux Toolkit and zustand (with its official Immer middleware) produce them effectively for free, while Jotai, Effector and XState do not produce patches in a tree-shaped way at all. The recommendation is therefore to make patches an **optional capability** exposed via a discriminated `PatchCapableAdapter` sub-interface, with `produceWithPatches` invoked inside the command's own `exec` as the fallback recipe documented by N.P. Bee [14].

Concretely: ship two reference adapters (zustand and Redux Toolkit) in Phase 1, defer the rest, and document the zustand+immer adapter as the agent's default scaffolding choice. This is the open-closed/plugin posture acture wants — agnostic at the public type boundary, opinionated only in the recommended-defaults documentation. Five real-world case studies (Excalidraw, tldraw, kbar, RTK at large, mobx-state-tree undo) reinforce that the command/action registry — not the store — is the architecturally load-bearing decision.

## Key Findings

1. **The interface can be small.** All seven candidate libraries already expose, or can trivially expose, a `subscribe(listener) → unsubscribe` shape callable outside React. The only constraint that *cannot* be satisfied uniformly is Immer-style patches; therefore patches must be an **optional capability**, not a base requirement.
2. **Patches are a near-given for two libraries and require an adapter for the rest.** Redux Toolkit uses Immer internally for every `createSlice` reducer [2][3]; zustand offers an officially-maintained `zustand/middleware/immer` that wraps `set` with `produce` [4]. Valtio operates on Proxies and has no native Immer patches, but its `subscribe` callback exposes a list of operations resembling JSON Patch. MobX has `intercept`/`observe` and `onPatch` (via mobx-state-tree) [5][6]. Jotai, Effector and XState do not produce patches and would need wrapping with `produceWithPatches` inside their writer functions.
3. **kbar's coupling is a cautionary tale.** kbar requires wrapping the entire React tree in `<KBarProvider actions={...}>` [7] — its state is React-context-coupled. This is a *dependency-injection use of context*, not a state-store [8], and acture deliberately rejects it because: (a) commands must be invocable from non-React code (LLM tool calls, keyboard daemons, MCP servers); (b) tests should not need a React renderer; (c) the registry must outlive any Provider's lifetime.
4. **CQRS-style separation is overkill for acture.** Martin Fowler explicitly warns that "for most systems CQRS adds risky complexity" [9]. Acture's commands are write-side intent objects, but reads can be plain selectors over the same store. Do not split read/write into separate models; the SSOT schema in §2.1 of the architecture already covers both.
5. **Real-world editors converge on similar patterns but use very different substrates.** Excalidraw built a bespoke `ActionManager` over plain React state because Recoil wasn't open-source at the time [10][11]; tldraw built their own signals library (Signia / `@tldraw/state`) for performance [12][13]. The lesson is *the command/action layer is the SSOT, not the store*. Acture's design is correct; the store is replaceable.

## Details

### 1. Glossary for the Python reader

Before diving in, a few frontend terms used throughout:

- **Hook**: a function (by convention prefixed `use…`) callable only inside a React component, which lets the component subscribe to external state and re-render when it changes.
- **Provider**: a React component that wraps part of the tree and exposes a value via React's context mechanism. Conceptually a scoped DI container.
- **Proxy**: ES2015 `Proxy` object — intercepts property reads/writes on a target object. Valtio and MobX use proxies to make `obj.x = 1` reactive.
- **Snapshot**: an immutable, plain-object copy of the current state at a moment in time. Critical for JSON-serializable test replay.
- **Selector**: a pure function `(state) => slice` used to read part of a store with memoization.

### 2. The four substrate constraints, re-stated

1. **Patches for undo (post-v1).** Per N.P. Bee's "Command-based undo for JS apps" — the recipe acture will eventually adopt — each command's `exec` produces a `[nextState, patches, inversePatches]` triple via `produceWithPatches`, and `undo` calls `applyPatches(state, inversePatches)` [14][15]. The substrate must therefore allow a command writer to run a reducer-shaped function `(draft) => void` and receive Immer patches back, *or* allow acture to wrap the substrate's setter in `produceWithPatches`.
2. **`commandsChanged` observables.** When commands are registered or unregistered, the registry must broadcast to non-React listeners (command palettes, MCP transport adapters, keyboard binders). The substrate's subscribe primitive must therefore be (a) callable outside React, (b) of shape `(listener) => unsubscribe`, (c) not require a Provider.
3. **Typed slices for AI tool descriptions.** An LLM tool description such as `addTodo(text: string)` must be derivable from the schema. The substrate must let acture express "this command reads slice X, writes slice Y" using TypeScript types alone — i.e., the slice type must be a *first-class TS type*, not a runtime-only thing.
4. **JSON-serializable snapshots for replay.** A test that records `[cmd1, cmd2, cmd3]` and asserts a final state needs `JSON.stringify(getState())` to round-trip. This rules out storing class instances with methods or Maps/Sets without explicit reviver logic. Plain-object reducers pass trivially.

### 3. Library-by-library assessment

#### zustand (pmndrs/zustand)
- **Patches**: ⚠️ Via official `zustand/middleware/immer` [4]. Patches recorded by wrapping `set` in `produceWithPatches`. Acture would ship the recipe once.
- **Typed slices**: ✅ Single `S` interface; selectors typed `(s: S) => T` [16].
- **Subscribe**: ✅ `store.subscribe(listener)` returns unsubscribe; works in vanilla JS via `zustand/vanilla` [16][17]. Best-in-class.
- **JSON-serializable**: ✅ Plain-object convention.
- **Boilerplate**: ✅ "Use the hook anywhere, no providers are needed" [16].

#### Redux Toolkit (reduxjs/redux-toolkit)
- **Patches**: ✅ Immer is *built in*: every `createSlice` reducer runs through Immer [2][3][18]. Patch capture requires swapping the internal `produce` for `produceWithPatches`.
- **Typed slices**: ✅ `createSlice` literally produces a "slice" with `selectSlice` and typed selectors [3]. The strongest typed-slices story.
- **Subscribe**: ✅ `store.subscribe(listener)` is the original Redux primitive; no Provider needed for subscription [19].
- **JSON-serializable**: ✅ Required-by-convention plain-object tree.
- **Boilerplate**: ⚠️ Heavier than zustand but predictable.

#### Jotai (pmndrs/jotai)
- **Patches**: ❌ Atoms are independent cells [20]. No single tree to patch.
- **Typed slices**: ⚠️ Per-atom typing; a "slice" is a manually-curated bundle.
- **Subscribe**: ⚠️ Outside-React requires `createStore()` + `store.sub`. Maintainer: atoms "can't access … values outside of react lifecycle without using hooks" without explicit effort [21][22].
- **JSON-serializable**: ⚠️ Snapshot is atom-by-atom, not one tree.
- **Boilerplate**: ✅ Provider-optional global store.

#### MobX (mobxjs/mobx)
- **Patches**: ⚠️ `intercept`/`observe` are explicitly documented anti-patterns [5]. mobx-state-tree adds `onPatch` (RFC 6902) [6] but MST is a separate library.
- **Typed slices**: ✅ Classes-as-TS-types.
- **Subscribe**: ⚠️ `autorun`/`reaction` are derivation-shaped but return disposers [23].
- **JSON-serializable**: ❌ Class instances with methods; round-trip needs revivers. Worst of the seven.
- **Boilerplate**: ⚠️ `makeObservable` annotations; actions enforced.

#### Valtio (pmndrs/valtio)
- **Patches**: ⚠️ Proxy mutations ≠ Immer patches; translatable.
- **Typed slices**: ✅ Plain TS object typing.
- **Subscribe**: ✅ `subscribe(state, cb)`, `subscribeKey` [24][25].
- **JSON-serializable**: ⚠️ `snapshot()` is plain *but preserves prototypes* if classes used [26].
- **Boilerplate**: ✅ Minimal; no provider [27]. Known proxy gotchas [28].

#### Effector (effector/effector)
- **Patches**: ❌ No patch model; reducers return whole values [29][30].
- **Typed slices**: ✅ Strong TS inference; `Store<T>`.
- **Subscribe**: ✅ `watch` + full `Observable` interface [32].
- **JSON-serializable**: ✅ Plain values; "no decorators, no need to use classes or proxies" [29].
- **Boilerplate**: ⚠️ Different paradigm — events + stores + sample/guard.

#### XState (statelyai/xstate)
- **Patches**: ❌ Analog is the *event log*, not patches. Better for some use cases but not interchangeable with Immer.
- **Typed slices**: ⚠️ `context` is typed but wrapped in a machine [33].
- **Subscribe**: ✅ `actor.subscribe(observer)`; RxJS-compatible `Observable` [33][34].
- **JSON-serializable**: ✅ `actor.getPersistedSnapshot()` is built for this [33].
- **Boilerplate**: ⚠️ A whole paradigm; overkill as a generic substrate.

### 4. Comparison table

| Library | (a) Patches | (b) Typed slices | (c) Subscribe | (d) JSON-serializable | (e) Boilerplate |
|---|---|---|---|---|---|
| **zustand** | ⚠️ Via `zustand/middleware/immer` + `produceWithPatches` [4][16] | ✅ Single `S`; typed selectors [16] | ✅ Native; vanilla-compatible; no provider [16][17] | ✅ Plain-object convention | ✅ "No providers needed" [16] |
| **Redux Toolkit** | ✅ Immer built in; patch listener available [2][3] | ✅ `createSlice` is the model [3] | ✅ Original Redux `store.subscribe` [19] | ✅ Plain-object reducer convention | ⚠️ Heavier ceremony; `<Provider>` for hooks |
| **Jotai** | ❌ No tree to patch [20] | ⚠️ Per-atom; slice = curated bundle | ⚠️ `createStore().sub`, but not the happy path [21][22] | ⚠️ Atom-by-atom snapshot | ✅ Provider-optional |
| **MobX** | ⚠️ `intercept`/`observe` are anti-patterns [5]; MST has `onPatch` [6] | ✅ Classes-as-types | ⚠️ `autorun`/`reaction` (derivation-shaped) [23] | ❌ Class instances with methods | ⚠️ `makeObservable` ceremony |
| **Valtio** | ⚠️ Proxy mutation list, translatable | ✅ Plain TS objects | ✅ `subscribe`/`subscribeKey` [24][25] | ⚠️ Plain *unless* classes used [26] | ✅ Minimal; no provider [27] |
| **Effector** | ❌ No patches [29] | ✅ Strong TS inference | ✅ Full `Observable` interface [32] | ✅ Plain; no classes/proxies [29] | ⚠️ Paradigm shift |
| **XState** | ❌ Event log, not patches | ⚠️ Typed but wrapped | ✅ `actor.subscribe`; RxJS-compatible [33][34] | ✅ `getPersistedSnapshot` [33] | ⚠️ Whole paradigm |

### 5. The minimum interface — proposed

```typescript
export interface StateAdapter<S> {
  getState(): S;
  setState(updater: (state: S) => S | void): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

export interface PatchCapableAdapter<S> extends StateAdapter<S> {
  readonly supportsPatches: true;
  setStateWithPatches(
    recipe: (draft: S) => void
  ): { patches: Patch[]; inversePatches: Patch[] };
  applyPatches(patches: Patch[]): void;
}

export interface SelectableAdapter<S> extends StateAdapter<S> {
  select<T>(
    selector: (s: S) => T,
    listener: (current: T, previous: T) => void,
    equalityFn?: (a: T, b: T) => boolean
  ): () => void;
}

export function isPatchCapable<S>(a: StateAdapter<S>): a is PatchCapableAdapter<S> {
  return (a as Partial<PatchCapableAdapter<S>>).supportsPatches === true;
}
```

**Why this shape:**

- **`setState(updater)` accepts a function returning `S | void`.** This dual form is the *exact* signature zustand's `set` uses [16] and the form RTK's `createSlice` reducers use under Immer's hood [3]. A library that returns a new object satisfies it; a library running under Immer where the reducer mutates a draft and returns `void` also satisfies it.
- **`subscribe(listener)` is sync and outside-React-callable.** This is the load-bearing contract for `commandsChanged`. Six of seven libraries provide it natively; the Jotai adapter builds it from `createStore().sub`.
- **Patches are optional.** Per N.P. Bee's recipe [14], undo can be implemented *by the command*, not the store: `produceWithPatches` is called *inside* the command's `exec`. The `PatchCapableAdapter` extension exists only when the substrate already produces patches natively (RTK, MST, Valtio-translated).
- **A discriminated capability flag** (`supportsPatches: true`) keeps runtime checks cheap and avoids the trap of structural typing being too permissive.
- **`SelectableAdapter` is a *third* optional capability** because zustand has `subscribeWithSelector` middleware and emulating it is 10 lines of memoization.

**Is the 3-method default sufficient?** Yes — with the patch capability as an extension. It satisfies all four constraints.

**Too thin?** Only if you expect adapters to handle persistence, devtools, or async effects. Those belong to command middleware, not the substrate.

**Too thick?** Mildly — the `previous: S` listener parameter is convenient but optional. RTK doesn't pass it; zustand does. Recommendation: keep it, default to `undefined` for adapters that don't track it.

### 6. Ordered recommendation — which adapters to ship

**Phase 1 (ship in v1):**

1. **`acture/state-zustand`** — strongest fit. The adapter is ~15 lines because zustand's native `getState`/`setState`/`subscribe` *is* the proposed interface [16]. `zustand/vanilla` gives first-class support for non-React surfaces (MCP, CLI, keyboard daemons) [17].
2. **`acture/state-redux`** — strongest fit for legacy/enterprise codebases. RTK already runs Immer internally and `createSlice` is the *exemplar* of typed slices [3].

**Phase 2 (community or v1.x):**

3. **`acture/state-jotai`** — defer until a user asks; requires non-trivial atoms ↔ tree bridge.
4. **`acture/state-valtio`** — defer; proxy-to-patch translation is real work.

**Leave to users:**

5. **MobX** — JSON-serializability gap is per-app.
6. **Effector** — paradigm mismatch; provide an integration recipe instead.
7. **XState** — users modeling apps as machines don't need acture's registry, they need a thin discovery surface.

### 7. Case studies

**Case 1 — Excalidraw: rolled their own.** Excalidraw uses a custom `ActionManager` (`register({ name, perform: state => ... })` with `renderAction('someAction')` dispatch), backed by plain React state, without Redux [10][11]. Christopher Chedeau told egghead.io they wanted Recoil but it wasn't OSS, so they "started building tooling with pure React and JavaScript" [11]. The `App` constructor instantiates `Library`, `ActionManager`, `Scene`, then `Store(this)` and `History(this.store)` [10]. **Lesson:** the `ActionManager` is initialized inside a React component, making it hard to use outside React. **Acture must not repeat this mistake** — the registry must be constructible outside React.

**Case 2 — tldraw: built Signia.** tldraw built Signia (now `@tldraw/state`) [12][13][35] because existing libraries couldn't lazy-cache derived collections. **Lesson:** an acture adapter on top of Signia's `atom`/`react` primitives is ~20 lines — the proposed `StateAdapter` shape supports niche substrates cleanly.

**Case 3 — kbar: the coupling acture rejects.** kbar requires `<KBarProvider actions={...}>` to wrap the React tree [7]. The testdouble.com argument [8]: React Context suits *injecting* a stateful container, not *being* one. **Lesson:** keep the registry as a plain object/Map outside React; React hooks are a thin observation layer.

**Case 4 — Redux Toolkit at large: boilerplate is the regret.** DEV-community discussions frame the win as "drastically reduces boilerplate" [36]. The recurring complaint is ceremony — *which is exactly the gap acture's command registry fills*.

**Case 5 — mobx-state-tree with `onPatch`.** While raw MobX warns against `intercept`/`observe` [5], MST's `onPatch` emits RFC 6902 JSON Patches [6]. **Lesson:** acture should standardize on JSON-Patch shape for its `Patch` type — Immer's patches [14][15] and MST's both align, making cross-substrate interop trivial.

### 8. Agnostic vs. opinionated — concrete recommendation

**Argument for staying agnostic:**
- Elliott: "The command pattern, event sourcing, and Redux are all different architectures" but accomplish the same goal — the substrate is interchangeable [1].
- Fowler: CQRS adds risky complexity in most contexts [9]; baking in one library is the same trap.
- The seven libraries differ in *paradigm* but converge on a *minimal subscribe/get/set surface*.

**Argument for some opinionation:**
- Most greenfield React apps are zustand-based or RTK-based.
- A documented happy-path adapter doubles as the exemplar.
- Immer-using substrates make the undo patch story "free".

**Resolution — "reference adapter as happy path":**

1. **Ship `StateAdapter<S>` and `PatchCapableAdapter<S>` as the public types.** Open-closed.
2. **Ship `acture/state-zustand` as the documented default.** README quickstart, tutorials, example app all use it. The AI agent's default scaffolding for a brand-new project uses it.
3. **Ship `acture/state-redux` as the second first-party adapter.** When the agent detects RTK in `package.json`, it picks this one.
4. **For any other library**, the agent generates an adapter from a template using the §3 matrix.

## Recommendations

**Stage 1 — Lock the interface (this week).**
- Define `StateAdapter<S>`, `PatchCapableAdapter<S>`, `SelectableAdapter<S>`, and `isPatchCapable` as shown in §5.
- Define `Patch` as an alias compatible with Immer's `Patch` (so RFC 6902 patches from MST and `produceWithPatches` are interchangeable).
- Write a 1-page "Authoring an acture state adapter" guide using zustand as the worked example.

**Stage 2 — Ship Phase-1 adapters (2-4 weeks).**
- Build `acture/state-zustand` (target ~50 LOC including tests).
- Build `acture/state-redux` using `createSlice`.
- Add `JSON.stringify(adapter.getState())` round-trip test to the adapter test kit.

**Stage 3 — Validate with users (1-3 months).**
- Wait for first Jotai/Valtio request; don't pre-build.
- For MobX requests: ask if MST. If yes, use `onSnapshot`/`onPatch`. If raw MobX with classes, send the authoring guide.

**Benchmarks that would change the recommendation:**
- **Switch to "ship XState in Phase 1"** if >20% of early adopters are statechart-modeled (unlikely but watch).
- **Switch to "drop SelectableAdapter"** if user-land memoizers cause more re-render bugs than they fix.
- **Switch to "patches required, not optional"** if undo ships before v2 and the team commits to Immer as a hard dependency.

## Caveats

- **No web search confirmed BlockNote's specific substrate** (search budget exhausted before I could verify) — the four case studies stand, but a Phase-2 audit should add BlockNote.
- **The `subscribe` shapes vary subtly.** RTK fires with no arguments; zustand passes `(state, previous)`; Valtio's callback gets a per-mutation operations list. Adapters normalize to `(state, previous)` and document quirks.
- **Immer patches are not always minimal.** Immer docs: "Immer does not guarantee the generated set of patches will be optimal" [15]; a third-party `dendriform-immer-patch-optimiser` exists [37]. Undo correctness must not depend on minimality.
- **Immer issue #468** shows `produceWithPatches` can produce correct next-state but incorrect patches in some array edge cases [38]. The undo test suite should regress on this.
- **"Class instances and proxies fail JSON-serialization"** is a strong rule but not absolute. Valtio's `snapshot()` is plain *unless* classes were stored [26]. Safe default: prohibit non-plain values in adapter-managed state by convention; assert it with a runtime check in the test kit.
- **Leaving Effector and XState to users is a judgment call.** Both libraries can satisfy the interface; the question is whether first-party maintenance is justified by adoption. Re-evaluate in 6 months.

---

## REFERENCES

[1] Elliott E. *The command pattern, event sourcing, and Redux are all different architectures, but they all accomplish a similar goal: transactional state management*. Medium, 18 May 2017. [medium.com/@_ericelliott](https://medium.com/@_ericelliott/the-command-pattern-event-sourcing-and-redux-are-all-different-architectures-but-they-all-3e36b70cbc60)

[2] Redux Toolkit team. *Usage Guide*. [redux-toolkit.js.org](https://redux-toolkit.js.org/usage/usage-guide)

[3] Redux Toolkit team. *createSlice*. [redux-toolkit.js.org/api/createSlice](https://redux-toolkit.js.org/api/createSlice)

[4] pmndrs. *zustand README — Immer middleware*. [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)

[5] MobX team. *Intercept & Observe*. [mobx.js.org/intercept-and-observe.html](https://mobx.js.org/intercept-and-observe.html)

[6] mobx-state-tree team. *Listening to observables, snapshots, patches and actions*. [mobx-state-tree.js.org/concepts/listeners](https://mobx-state-tree.js.org/concepts/listeners)

[7] Chen T. *kbar README*. [github.com/timc1/kbar](https://github.com/timc1/kbar)

[8] Brahmaroutu N. *Using React Context for dependency injection, not state management*. Test Double. [testdouble.com](https://testdouble.com/insights/react-context-for-dependency-injection-not-state-management)

[9] Fowler M. *CQRS*. martinfowler.com, 14 July 2011. [martinfowler.com/bliki/CQRS.html](https://www.martinfowler.com/bliki/CQRS.html)

[10] Karataev E. *Excalidraw state management*. DEV Community, 5 June 2021. [dev.to/karataev](https://dev.to/karataev/excalidraw-state-management-1842)

[11] Chedeau C, Hewitt J. *State Management in React with Christopher Chedeau*. egghead.io. [egghead.io](https://egghead.io/lessons/react-state-management-in-react-with-christopher-chedeau)

[12] Ruiz S, Sheldrick D. *Introducing Signia*. tldraw Substack. [tldraw.substack.com](https://tldraw.substack.com/p/introducing-signia)

[13] tldraw. *Signia — Using Signals*. [signia.tldraw.dev](https://signia.tldraw.dev/docs/using-signals)

[14] Bee NP. *Command-based undo for JS apps*. npbee.me, 2023. [npbee.me](https://www.npbee.me/posts/command-based-undo)

[15] Immer team. *Patches*. [immerjs.github.io/immer/patches](https://immerjs.github.io/immer/patches/)

[16] pmndrs. *zustand README*. [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)

[17] pmndrs. *zustand — Read/Set State Outside of Component*. [awesomedevin.github.io](https://awesomedevin.github.io/zustand-vue/en/docs/advanced/read-set-state-outside-of-component)

[18] Redux Toolkit. *createSlice and Reducers*. DeepWiki. [deepwiki.com](https://deepwiki.com/reduxjs/redux/3.2-createslice-and-reducers)

[19] Codecademy. *Redux Toolkit Cheatsheet*. [codecademy.com](https://www.codecademy.com/learn/fecp-22-redux/modules/wdcp-22-refactoring-with-redux-toolkit/cheatsheet)

[20] Jotai team. *atom — core*. [jotai.org/docs/core/atom](https://jotai.org/docs/core/atom)

[21] Jotai team. *Using store outside React*. [jotai.org](https://jotai.org/docs/guides/using-store-outside-react)

[22] Kato D. *Access state outside of react lifecycle? — Jotai Discussion #694*. [github.com/pmndrs/jotai](https://github.com/pmndrs/jotai/discussions/694)

[23] MobX team. *Running side effects with reactions*. [mobx.js.org/reactions.html](https://mobx.js.org/reactions.html)

[24] Valtio team. *valtio README*. [github.com/pmndrs/valtio](https://github.com/pmndrs/valtio)

[25] Valtio team. *snapshot*. [valtio.dev](https://valtio.dev/docs/api/advanced/snapshot)

[26] Valtio team. *snapshot — prototypes preserved*. [valtio.dev](https://valtio.dev/docs/api/advanced/snapshot)

[27] Valtio team. *Getting Started*. [valtio.dev](https://valtio.dev/docs/introduction/getting-started)

[28] Valtio team. *Some gotchas*. [valtio.dev](https://valtio.dev/docs/how-tos/some-gotchas)

[29] Effector team. *effector README*. [github.com/effector/effector](https://github.com/effector/effector)

[30] Effector team. *Store API*. [effector.dev](https://effector.dev/en/api/effector/store/)

[31] Effector team. *Usage with effector-react*. [v21.effector.dev](https://v21.effector.dev/docs/typescript/usage-with-effector-react/)

[32] Effector team. *effector type definitions — Observable interface*. [github.com/effector/effector](https://github.com/effector/effector/blob/master/packages/effector/index.d.ts)

[33] Stately. *Actors*. [stately.ai/docs/actors](https://stately.ai/docs/actors)

[34] tinytip. *XState Actors are observables*. [tinytip.co](https://tinytip.co/tips/xstate-actor-observable/)

[35] tldraw. *@tldraw/state — package*. [npmjs.com/package/@tldraw/state](https://www.npmjs.com/package/@tldraw/state)

[36] Athimoolam P. *The Power of Redux Toolkit's createSlice*. DEV Community. [dev.to](https://dev.to/padmajothi_athimoolam_23d/the-power-of-redux-toolkits-createslice-1p1k)

[37] dendriform team. *dendriform-immer-patch-optimiser*. [npmjs.com](https://www.npmjs.com/package/dendriform-immer-patch-optimiser)

[38] Pellow J. *Data integrity issue in produceWithPatches — Immer issue #468*. [github.com/immerjs/immer](https://github.com/immerjs/immer/issues/468)