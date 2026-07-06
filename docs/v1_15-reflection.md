# v1.15 reflection — acture-mcp read side (MCP resources projection)

**Increment:** extend `acture-mcp-server` with a read-side **MCP resources**
projection — the state-exposure half of an "operate my app" AI assistant. First of
the v1.14-deferred package accelerators, pulled forward on a named need
(`reelee-web` + research-11).

## The decision: extend, don't invent

research-11 §3 framed the read side as an industry-wide gap acture is placed to
close. The design question was *where* the read-side code lives. Options weighed:

1. A new `ViewRegistry` **primitive in core** — rejected: core is deliberately
   minimal (registry + schema bridge + state-adapter interface); adding a primitive
   expands the guarded closed surface without a proven second consumer.
2. A **new package** (`acture-views`) — rejected for now: an npm publish and a new
   public surface for a primitive that, per the dev-tool-first precedent, is a
   ~60-line pattern a project can own (`docs/hand-written-view-registry.md`).
3. **Extend the already-published `acture-mcp-server`** (chosen) — additive `minor`,
   no new package, no core change. This mirrors the exact precedent set by macros
   (stayed a hand-written pattern) vs `acture-e2e-playwright` (only the *tool-bound*
   piece earned a package). The **tool-bound** piece here is the MCP projection; the
   `ViewRegistry` primitive stays the pattern.

So `acture-mcp-server` consumes a `ViewSource` the app supplies (the `list` / `read`
/ `onStateChanged` subset of the hand-written `ViewRegistry`) and never touches the
state library — symmetric to how the tools projection consumes a `Registry`.

## What shipped

- **Pure layer (`resources.ts`, zero SDK dependency):** `ViewSource` /
  `ResourceView` / `McpResourceDescriptor`, `buildResourcesList(views, opts)`,
  `readResource(views, uri)`, `viewIdToUri`. Tier-filtered (`internal` never
  projected); `application/json` resources at `app://state/<id>`.
- **Server glue (`server.ts`):** `createMcpServer(registry, { views, resourceUriPrefix? })`
  wires `resources/list` + `resources/read` + `resources/subscribe`, advertises the
  `resources` capability, and fires `notifications/resources/updated` for subscribed
  URIs from `views.onStateChanged`. `views` omitted → tools-only, unchanged.
- **8 new tests** (`resources.test.ts`); typecheck + build + full package test green.

## Design notes / gotchas

- **The two-layer discipline held.** `resources.ts` imports nothing from the MCP
  SDK. The one place the SDK leaked into the pure result type — the `resources/read`
  handler's return must satisfy the SDK's broad `ServerResult` union (one member
  requires a `task` field) — was resolved by an **upcast to `ReadResourceResult` in
  `server.ts`** (the glue layer), not by importing SDK types into `resources.ts`.
- **Internal-view enforcement lives in the `ViewSource`, not the adapter** — its
  `read` returns `undefined` for internal/secret, exactly as core's `dispatch`
  enforces `@internal` on the write side. acture-mcp trusts that boundary (hard-don't
  #3: translate, don't decide). Tests document this contract.
- **`exactOptionalPropertyTypes` is on** — options objects are built by conditionally
  assigning keys (never passing `key: undefined`), matching the existing `tools.ts`
  pattern.

## Still deferred (each awaits its own named need)

- The **`getState` tool** hedge for tools-only MCP hosts (companion to resources;
  research-11 §3.2 "ship both").
- The **keymap-customization helper** in `acture-hotkeys` (the second v1.14 accelerator).
- Whether **`sideEffect` / `requiresConfirmation`** become `CommandRecord` fields
  (closed-surface change) vs the current middleware+convention.
- Resource **`list_changed`** (views are treated as a static set registered at
  startup; only per-URI `updated` is wired).

## Housekeeping

Issue **#34** (MCP tool-name contract) was verified stale — names are sanitized on
`main` via the #24 fix (`tools.ts` `projectCommand` → `commandIdToToolName`), and
`callTool` accepts both the dotted id and the sanitized wire name — and closed with
evidence before this work, since it sat in the file the resources projection extends.
