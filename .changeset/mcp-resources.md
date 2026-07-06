---
"acture-mcp-server": minor
---

Add a read-side **MCP resources** projection — the state-exposure half of an
"operate my app" AI assistant (research-11 §3). Where `buildToolsList` projects
commands (actions) to MCP tools, the new `buildResourcesList` / `readResource`
project **views** (typed selectors over app state) to MCP resources, so a model
can *see* current state before it acts.

- **Pure layer (`resources.ts`, no SDK dependency):** `buildResourcesList(views, opts)`,
  `readResource(views, uri)`, `viewIdToUri`, and the `ViewSource` interface —
  mirroring the hand-written `ViewRegistry` (`list` / `read` / `onStateChanged`)
  from `docs/hand-written-view-registry.md`. Tier-filtered like tools (`internal`
  never projected); a `ViewSource` supplies the state, so acture-mcp stays
  state-library-agnostic.
- **Server glue (`createMcpServer`):** a new optional `views` option wires
  `resources/list` + `resources/read`, advertises the `resources` capability, and
  wires `resources/subscribe` liveness to the source's `onStateChanged`
  (`notifications/resources/updated`). Omit `views` for a tools-only server — the
  default is unchanged, fully backward-compatible.

Additive only; no change to the existing tools projection.
