# Command-Dispatch Patterns Across Linear, Notion, Obsidian, Slack, and Raycast

**A convergent-evidence audit for the wrapex `CommandRecord` design**

*Thor Whalen — May 2026*

> **Downloadable artifact**: The full report is also saved as a Markdown file in Google Drive — filename `command-dispatch-five-product-audit.md`, file ID `1MKvwJltS8SdMQC7ihL7x1eiCKRI8fOrN`, MIME type `text/markdown`.

---

## 1. Executive verdict

**The wrapex `CommandRecord` shape (`id`, `title`, `handler`, `parameters/schema`, `context/when`, `category`, `icon`) is a faithful representation of the industry convergence — but it is missing one field that is genuinely convergent across the five products audited here: a first-class `hotkey` / `keybinding` slot.** Every product I looked at registers commands as records keyed by a stable string `id` and a human-readable `title`/`name`; every product attaches a `handler` (either an in-process function or, in Slack's case, an HTTP webhook URL); every product that supports arguments collects them via a typed parameter list; and every product that has shipped an AI surface in 2024–2025 (Linear, Notion, Raycast, and Slack's "AI Apps") has built that surface by translating its existing command/action records into MCP tools or function-calling schemas. So the *core spine* of `CommandRecord` is ratified by industry practice [1, 2, 3, 47, 50, 51].

Two fields are weaker. `category` is present in four of five (Raycast, Slack-via-grouping, Linear-via-internal-grouping, Obsidian) but not central — it shows up more as a discovery/filter aid than as a semantic field. `icon` is similar: Raycast and Linear treat it as a first-class command property, but Obsidian and Notion treat it as plugin-level only, and Slack inherits it from the parent app. The `when`/`context` predicate is convergent in *concept* but wildly divergent in *form*: VS Code uses a DSL of expressions [10], Obsidian uses an imperative `checkCallback` boolean function, Raycast uses runtime mode flags (`view` / `no-view` / `menu-bar`), and Slack/Linear/Notion offload context entirely to the server.

**The convergent field wrapex is missing**: **`hotkey` / `keybinding`** as a first-class command property. Obsidian's `Command.hotkeys` is an array of `{modifiers, key}` objects [54]; Raycast's `package.json` accepts a per-command `hotkey: { modifiers, key }` suggestion that the user can override [55]; VS Code's `keybindings` contribution is one of the canonical contribution points [2]; and `kbar` (a popular React `cmdk` library copying Linear's pattern) treats `shortcut` as a top-level action property [19]. If wrapex's `CommandRecord` does *not* carry a `hotkey` field, the convergence claim against the five products is partially falsified for that one field. I would also flag that **none** of these systems treat `category` and `icon` as core; the article should not over-claim convergence on those two.

---

## 2. Per-product audit

### 2.1 Linear

#### (1) Shape of the public command record

Linear has **two** surfaces worth treating separately, and only one of them is a "command record" in the wrapex sense.

The first surface — the in-app Cmd+K command menu — is **not part of the public API**. Linear's developer documentation [56] exposes a GraphQL API and webhooks for data manipulation, plus an OAuth flow for third-party apps, but does *not* expose any way to register a new entry in the Cmd+K menu. The Cmd+K menu is implemented internally; the popular open-source `kbar` library [19] is explicitly modeled on it ("With macOS's Spotlight and Linear's command + k experience in mind, kbar aims to be a simple abstraction"), and the canonical action shape that the community has reverse-engineered from Linear's behavior looks like:

```ts
// kbar Action, modeled on Linear's Cmd+K (community reverse-engineering, not Linear API)
type Action = {
  id: string;
  name: string;
  shortcut?: string[];          // e.g. ["c"] or ["g","i"]
  keywords?: string;
  section?: string;             // category grouping
  icon?: ReactNode;
  perform?: () => void;
  parent?: string;              // nested actions
};
```

The second surface — the public extension boundary — is the **Linear MCP server** at `https://mcp.linear.app/mcp`, which is a Streamable-HTTP MCP endpoint with OAuth 2.1 and dynamic client registration [57]. Each tool exposed follows the MCP `Tool` shape [5]:

```ts
// MCP tool shape; Linear exposes tools like create-issue, update-issue, list-issues
type Tool = {
  name: string;
  description: string;
  inputSchema: JSONSchema;       // JSON Schema for arguments
};
```

#### (2) Registry exposure tier

**Closed for the in-app palette; open via OAuth for the MCP/GraphQL surface.** Linear gives third parties no way to add an entry to the in-app Cmd+K menu. The public extension story is "register an OAuth app, hit the GraphQL API, optionally expose your own MCP server" [58, 57]. There is no sandbox concept analogous to Figma plugins [3] or VS Code extensions [11] because there is no third-party code running in Linear's client. Linear's Agents feature [57] lets verified AI agents (Claude, Cursor, Codex, etc.) act through Linear's MCP server, but the agent code runs *elsewhere*.

#### (3) Parameterized commands

Inside the app, Linear's Cmd+K palette uses an **inline nested-picker** pattern — `Cmd+K → "Change status"` opens a sub-picker of statuses without leaving the palette. This is the "nested actions" pattern that kbar [19] codifies. Externally, on the MCP boundary, arguments are collected by the AI client (Claude, Cursor, etc.) according to each tool's JSON Schema; Linear's server validates and executes server-side [57]. The wrapex/Raycast `arguments` analogy [47] does not apply natively in the palette UI.

#### (4) AI / MCP integration

Linear was an early adopter of MCP. The announcement post in May 2025 [59] introduces a hosted MCP server with "tools available for finding, creating, and updating objects in Linear like issues, projects, and comments — with more functionality on the way." The docs page [57] lists not only tools but also MCP **resources** (`linear://viewer`, `linear://organization`, `linear://teams`, `linear://projects`, `linear://issue/{id}`, etc.) and **prompts** (`summarize-project-status`, `draft-project-update`, `triage-issue`) — this is the first product in the audit that uses all three MCP primitives rather than just tools. The bridge from "command" to "tool" is conceptual rather than mechanical: Linear is exposing the same business operations that the Cmd+K palette would dispatch, but the implementations are separate (GraphQL mutations behind both).

#### (5) Command ID naming conventions

Tool names on the MCP server use **flat kebab-case** (`create_issue`, `list_issues`, `update_issue`) [60]. MCP resources use a **scheme:URI** form (`linear://team/{id}`) — this is the closest thing in the audit to reverse-DNS, and it is canonical MCP, not Linear-specific. GraphQL operation names use **camelCase** (`issueCreate`, `issueUpdate`).

#### (6) Failure modes (conservative sources)

Linear's *public* engineering writing is sparse on Cmd+K post-mortems. The one piece worth citing is the Medium post "Invisible details" by Andreas Eldh [61], which discusses contextual menus rather than the palette per se, and admits that the older "Cmd+K → search for keyboard shortcut → execute" loop was slow enough to be worth replacing with right-click menus. No deprecated APIs, since none were ever public. The genuine risk of the architecture — "the in-app palette is not extensible" — is a deliberate product decision, not a bug. (Note: I was unable to locate a Linear engineering blog post analogous to Superhuman's [51] discussing the palette's design history; if one exists internally or on Linear's changelog pages, the failure-modes section for Linear is correspondingly thinner.)

---

### 2.2 Notion

#### (1) Shape of the public command record

**Notion does not expose a command record.** The public Notion API [62] is a REST API for content (pages, databases, blocks, users, comments) and a webhook system; it does *not* expose the slash-command surface that users see when they type `/` in a page. Notion's official help docs describe slash commands [63] as a closed feature set — `/quote`, `/callout`, `/turnbullet`, `/comment`, `/duplicate`, `/red`, `/turn`, etc. — that ship with the product. The CKEditor 5 community request thread [64] (where a competing editor's maintainers explicitly took Notion as the design target for their own slash-command feature) confirms the absence of public extension docs as of 2025: Notion has no third-party slash-command registry.

What Notion *does* expose, for completeness, is the **Connection** ("integration") shape [62]:

```ts
// Notion Connection capabilities (from developers.notion.com)
type ConnectionCapabilities = {
  read_content: boolean;
  update_content: boolean;
  insert_content: boolean;
  read_comments: boolean;
  insert_comments: boolean;
  read_user_info_with_email: boolean;
  read_user_info_without_email: boolean;
};
```

This is not a command record; it is a permission record. The "handler" is implicit: the integration calls the REST API.

#### (2) Registry exposure tier

**Not exposed.** Slash commands are first-party only. Connections are *gated* — internal connections are immediately usable in the workspace where they're created; public connections must pass Notion's security review before listing on the Marketplace [62]. There is no sandbox; the extension code runs on the developer's own servers and authenticates via OAuth.

#### (3) Parameterized commands

Not applicable to third parties. For the first-party slash commands, the UI is the well-known inline picker (`/q...` filters to `/quote`, `/quotation`, etc.). Some commands take inline arguments (`/red` colors the current block), but there is no documented schema or third-party way to declare one.

#### (4) AI / MCP integration

Notion ships an MCP server [62] (linked from the developer docs landing page: "Connect your Notion workspace to AI tools like ChatGPT, Claude, and Cursor"). Like Linear, the bridge is not "command → tool" but "REST API → tool"; the tools wrap the same primitives the public REST API exposes (page CRUD, database queries, block manipulation). Notion AI itself, as it appears inside the editor, is undocumented from a developer perspective — there is no public API to register an "Ask Notion AI" tool that operates over a third-party data source from within the slash menu.

#### (5) Command ID naming conventions

For the slash commands the user sees, IDs are **flat, mnemonic, lowercase** (`/quote`, `/callout`, `/turnbullet`, `/web`, `/duplicate`, `/red`, `/comment`) [63]. The leading `/` is the trigger character; the rest is a single token, with `turn`-prefixed commands (`/turnbullet`, `/turnheading2`) acting as a soft namespace for "convert block to". The REST API uses standard `noun.action` REST paths, not relevant here.

#### (6) Failure modes (conservative sources)

I can't point to a Notion engineering blog post discussing slash-command regrets — the surface is closed, so there is nothing to deprecate publicly. The conservative observation is that Notion's *content* model has been redesigned at the API level (the 2025 "data sources" model added data sources as a layer between databases and properties [62]) without affecting the slash menu, which suggests the team has deliberately kept the slash menu decoupled from the public API — exactly the opposite of what wrapex assumes.

---

### 2.3 Obsidian

This is the richest public command-registration surface of the five.

#### (1) Shape of the public command record

The canonical `Command` interface, from the official `obsidian.d.ts` and the developer docs [52, 53]:

```ts
interface Command {
  id: string;                  // unique within plugin; prefixed with pluginId at registration
  name: string;                // human-readable
  icon?: string;               // optional Lucide icon id (string)
  mobileOnly?: boolean;
  repeatable?: boolean;        // whether holding the hotkey re-fires
  callback?: () => any;        // simple handler
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => any;
  editorCheckCallback?:
    (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo)
      => boolean | void;
  hotkeys?: Hotkey[];          // [{ modifiers: ("Mod"|"Shift"|"Alt"|"Ctrl"|"Meta")[], key: string }]
}
```

Concrete registration example, from the official Plugin docs [53]:

```ts
this.addCommand({
  id: "print-greeting-to-console",
  name: "Print greeting to console",
  callback: () => { console.log("Hey, you!"); },
});

// conditional command
this.addCommand({
  id: "example-command",
  name: "Example command",
  checkCallback: (checking: boolean) => {
    const value = getRequiredValue();
    if (value) {
      if (!checking) doCommand(value);
      return true;
    }
    return false;
  },
});
```

Note what's there: `id`, `name`, `icon`, four callback variants, `hotkeys`, `repeatable`, `mobileOnly`. Note what's *not* there: no `category`, no `parameters` schema, no machine-readable `when` clause. The four-callback design is Obsidian's solution to the `when`/context problem, and it is fundamentally different from VS Code's [10] declarative `when` strings — Obsidian uses an imperative two-phase boolean function (`checkCallback(checking=true)` means "should this command be visible/enabled right now?"; `checkCallback(checking=false)` means "actually run it").

#### (2) Registry exposure tier

**Open community marketplace, no runtime sandbox.** Obsidian plugins are Electron-bundled JavaScript that loads via `require('obsidian')` and has full Node.js access (this is why `manifest.json` has an `isDesktopOnly` flag). The Community Plugins directory is a curated GitHub-PR-based listing — anyone can submit, the Obsidian team reviews, but once installed, plugins run with the user's full machine privileges. This is the **least sandboxed** model in the audit, and explicitly so: Obsidian users are warned that plugins can read/write any file the user can.

#### (3) Parameterized commands

**No first-class parameter system.** A plugin that needs arguments either (a) opens a Modal/`FuzzySuggestModal`/`SuggestModal` after the command fires, (b) uses the command palette only as a launcher and then prompts via its own UI, or (c) reads the active editor selection as implicit input. There is no equivalent of Raycast's manifest-declared `arguments` [47]. The community plugin "Commander" [65] adds shortcut buttons but does not solve the parameter-collection problem.

#### (4) AI / MCP integration

**No first-party AI/MCP bridge.** Obsidian itself ships no "ask AI over my commands" feature. Several community plugins implement MCP clients/servers, but none are blessed and none are publicized as a command-record-to-tool translation layer. This is a meaningful gap relative to Raycast and Linear.

#### (5) Command ID naming conventions

IDs are **namespaced by plugin**: at registration, Obsidian prefixes the plugin's manifest `id` to the command's local `id`, producing a final ID like `tag-search:open-tag-search`. The canonical form is **kebab-case-segments-separated-by-colons** [53]. Core commands look the same (`editor:toggle-bold`, `workspace:split-vertical`). This is structurally identical to VS Code's namespaced contribution-point IDs [2], just with `:` instead of `.`.

#### (6) Failure modes (conservative sources)

The official developer docs [53] include a guidance section that effectively warns against a design pitfall: "If your command needs access to the editor, you can also use the `editorCallback`... Editor commands only appear in the Command Palette when there's an active editor available." The implication, made explicit on the Obsidian forum [66] in a "Commands, editorCallback, other editors" thread, is that `editorCallback` only works against `MarkdownView` — plugins that wanted to operate on Kanban boards or Canvas views had to fall back to `callback` and probe the workspace. The four-callback split (`callback` / `checkCallback` / `editorCallback` / `editorCheckCallback`) is itself an admission that a single callback shape was insufficient; the Obsidian team grew the type by inheritance rather than by adding a declarative `when` field. The conservative reading is: **Obsidian's design works, but it has scarred over its own "context predicate" problem with API surface area instead of solving it with a DSL**.

---

### 2.4 Slack

Slack is the outlier and deserves a sharp framing up front: **Slack's "commands" are not in-app dispatch; they are HTTP requests Slack sends to your server in response to a user typing `/command text` in a message composer.** The command record is a *route declaration*, not a function reference. This is structurally different from the other four products and from wrapex.

#### (1) Shape of the public command record

From the App Manifest reference [67], a `slash_commands` entry:

```json
{
  "slash_commands": [
    {
      "command": "/z",
      "description": "You see a mailbox in the field.",
      "should_escape": false,
      "usage_hint": "/zork open mailbox",
      "url": "https://example.com/slack/slash/please"
    }
  ]
}
```

Fields: `command` (the leading-slash string, max 32 chars, including `/`), `description`, `url` (the HTTPS request URL Slack POSTs to), `usage_hint` (free-text help string shown after the command name as user types), `should_escape` (whether `@user`/`#channel` mentions in `text` get encoded). Maximum **5 slash commands per app** [68]. When invoked, Slack POSTs an `application/x-www-form-urlencoded` body with `command`, `text` (everything after the first space), `user_id`, `channel_id`, `team_id`, `response_url` (a follow-up webhook), `trigger_id`, and others [69].

Slack has also been adding two adjacent surfaces in 2023–2025: **functions** (in the same manifest, with `input_parameters`/`output_parameters` declared as JSON-Schema-style typed properties) and **assistant_view** (the AI Apps surface, with `suggested_prompts`) [67]:

```json
{
  "functions": {
    "a_callback_id": {
      "title": "A Callback ID",
      "description": "...",
      "input_parameters": {
        "properties": {
          "user_id": {
            "type": "string", "title": "User",
            "description": "Message recipient", "is_required": true
          }
        },
        "required": ["user_id"]
      },
      "output_parameters": { /* same shape */ }
    }
  },
  "features": {
    "assistant_view": {
      "assistant_description": "What does your assistant do?",
      "suggested_prompts": [{ "title": "User help", "message": "How do I use this awesome app?" }]
    }
  }
}
```

Functions are typed building blocks for Workflow Builder; they have a schema but they are *not* user-typed slash commands. Slash commands have no native parameter schema beyond a single free-text `text` field.

#### (2) Registry exposure tier

**Open marketplace with platform-level review.** Apps go through Slack's App Directory review for public distribution. There is no in-Slack sandbox — your code runs on your server; Slack mediates via HTTPS, request-signing (HMAC with signing secret), and OAuth scopes. The relevant scope is `commands` [67].

#### (3) Parameterized commands

**The weakest of the five.** Slack passes the entire post-command string as one opaque `text` field [69]. Anything you want to "parse" out of it, you parse yourself on your server. The recommended pattern for any nontrivial input is **slash command → open a modal/view via `views.open`** using the `trigger_id` to collect structured fields [70]. This is a two-step UI dance, not a declarative parameter list. Raycast's `arguments` field [47] has no equivalent here.

#### (4) AI / MCP integration

Slack's AI surface is the **Assistant** (formerly "Slack AI Apps"), declared via `assistant_view` in the manifest with `suggested_prompts`, plus events like `assistant_thread_started` and scopes like `assistant:write` [67]. Slack also has a documented Agents/AI Apps concept where the app responds to natural-language messages with structured replies. There is **no first-party "translate my slash commands into tool definitions for an LLM" feature**; the slash command and the Assistant are two different entry points to the same app. If you want LLM-driven dispatch of your slash commands, you implement it yourself — e.g., your Assistant handler interprets the user's message, decides which internal slash-command handler to invoke, and posts back. The community pattern is to use Vercel AI SDK [6] inside the Bolt handler [71].

#### (5) Command ID naming conventions

**Flat with leading slash, not namespaced.** Slack's documentation is explicit and unusual: "Slash commands are **not namespaced**. This means multiple commands may occupy the same name. If this happens and a user tries to invoke the command, Slack will always invoke the one that was installed most recently" [69]. So `/todo` from app A is overwritten by `/todo` from app B when B is installed second. This is by far the most fragile naming convention in the audit; Slack's own docs recommend "Naming it after your service is often a good idea" as the mitigation [69].

#### (6) Failure modes (conservative sources)

- The non-namespacing of slash commands is acknowledged in Slack's own docs [69] as a known limitation: "It's an important thing to consider, especially if you're planning to distribute your app."
- The 5-command-per-app cap [67] is a hard limit that has forced apps with broader surface to use **shortcuts** (a different manifest section) or **App Home** as overflow.
- Slash commands cannot be invoked from message threads except for built-in ones [69]; this is a long-standing constraint that has shaped how apps surface functionality.
- The deprecated **verification token** mechanism has been replaced by signing-secret-based HMAC [72]; Slack explicitly recommends migrating off the older token approach.
- More broadly, the **Deno Slack SDK / next-generation platform** (the "Workflow Builder + functions" path with `input_parameters`/`output_parameters`) is Slack's bet that *typed functions* should subsume slash commands for new development. The slash command remains supported but is no longer where new investment is going.

---

### 2.5 Raycast

Raycast has the cleanest, most wrapex-shaped command record of the five.

#### (1) Shape of the public command record

From the official `Manifest` documentation [73, 47]:

```json
{
  "name": "my-extension",
  "title": "My Extension",
  "description": "...",
  "icon": "icon.png",
  "author": "thomas",
  "categories": ["Fun", "Communication"],
  "license": "MIT",
  "commands": [
    {
      "name": "index",
      "title": "Send Love",
      "subtitle": "Communication",
      "description": "A command to send love to each other",
      "icon": "icon.png",
      "mode": "view",
      "keywords": ["love", "send"],
      "interval": "10m",
      "disabledByDefault": false,
      "preferences": [ /* per-command preferences */ ],
      "arguments": [
        { "name": "recipient", "placeholder": "Name", "type": "text", "required": true }
      ]
    }
  ]
}
```

Field-by-field this looks like wrapex's `CommandRecord` plus a few extras: `mode` (a runtime-context flag, one of `view` / `no-view` / `menu-bar`) substitutes for VS Code-style `when` predicates [10]; `interval` enables background refresh; `preferences` is per-command configuration (textfield, password, checkbox, dropdown, appPicker); `arguments` is the inline-palette-parameter mechanism that wrapex should treat as canonical baseline [47].

For **AI extensions**, the manifest grows an `ai` block and the extension exports `tool` entry points typed with JSDoc-described inputs [74]:

```ts
import { Tool } from "@raycast/api";

type Input = {
  /** The first name of the user to greet */
  name: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Are you sure you want to greet ${input.name}?`,
});

/** Greet the user with a friendly message */
export default function tool(input: Input) {
  return `Hello, ${input.name}!`;
}
```

#### (2) Registry exposure tier

**Open Store with first-party review, no team-only middle tier.** Extensions are TypeScript/React projects bundled via the `ray` CLI [75] and published to the Raycast Store. Raycast also supports **private extensions for teams** as a separate tier [73]. The runtime is documented in detail in the Raycast engineering blog [75]: extensions are esbuild-bundled JS, loaded dynamically into a long-running Node process, with their React trees reconciled to native AppKit components by a custom renderer. This is closer to VS Code's extension host [11] than to Obsidian's "load arbitrary JS into the app".

#### (3) Parameterized commands

**The reference design.** Raycast's `arguments` array on a command, referenced as the wrapex baseline [47], declares typed inputs that are collected from the Root Search bar *before* the command opens:

```json
"arguments": [
  { "name": "Name Space", "placeholder": "default", "type": "text" }
]
```

Argument `type` is one of `text`, `password`, or `dropdown` (with `data` for the option list). Marking `required: true` makes Raycast block command launch until the value is provided. The values are passed to the command as a strongly-typed `LaunchProps<{ arguments: Arguments.MyCommand }>` prop, where `Arguments.MyCommand` is autogenerated from the manifest into `raycast-env.d.ts` [76]. This is exactly the wrapex pattern.

For AI tools, the parameter system *changes shape*: tool inputs are TypeScript types with JSDoc descriptions, which Raycast's runtime converts into JSON Schema for the LLM [74]. This is the same trick the Vercel AI SDK uses with Zod [6, 16].

#### (4) AI / MCP integration

Raycast has the most developed AI bridge of the five. Three layers:

1. **AI Extensions** [74]: every extension can export `tool` functions; the AI surface (`@-mention` an extension in AI Chat) discovers them and routes LLM tool calls to them. Tools can declare a `confirmation` export for human-in-the-loop steps. The `ai.evals` block in `package.json` lets developers ship integration tests against the LLM (`callsTool`, `includes`, `matches`, `meetsCriteria`).

2. **First-party MCP client** [77, 78]: as of Raycast 1.98.0, Raycast ships a "Manage MCP Servers" command, a meta-registry for discovery, and `mcp-config.json` parsing that mirrors Claude Desktop's format. MCP servers and AI Extensions are treated symmetrically — both are `@-mentioned` from AI Chat or Quick AI.

3. **AI Commands**: user-defined prompt templates that can reference `@-mentioned` extensions/MCP servers as tool sources.

In Raycast's model, the **command record and the tool record are deliberately separate** (commands appear in Root Search, tools don't), but they coexist in the same `package.json` and the same extension folder. This is the cleanest answer in the audit to "how does a command-dispatch system bridge to LLM tool calls".

#### (5) Command ID naming conventions

**Namespaced as `extensionAuthor/extensionName/commandName`**, but in practice referenced as `commandName` within an extension. The `name` field in a command is the file-system name (`index`, `create`, `list`) that maps to `src/<name>.{ts,tsx}` [79]. Workaround for orgs that require npm-style namespaced package names (`@foo/bar`): Raycast accepts a special `@workaround/` prefix [80]. Tool names follow the same flat-kebab convention as Linear's MCP (`create-comment`, `get-todos`).

#### (6) Failure modes (conservative sources)

The official Raycast Changelog [76] documents an instructive sequence of API tightenings:

- **OAuth from background commands deprecated**: "API methods for OAuth request creation now throw an error when used from a background command" — a real safety guardrail added after the fact.
- **DatePicker controlled/uncontrolled warnings**: "Added warnings when specifying a value without onChange or when changing a Form item from controlled to uncontrolled." Indicates that the React-style declarative API leaked subtle bugs into extensions.
- **Menu-bar commands were a Beta** before stabilizing, with explicit caveats about lifecycle ("they are not long-lived processes... Raycast loads them into memory on demand, executes their code and then tries to unload them at the next convenient time") [81].
- **The `mode` field grew over time**: initially `view` and `no-view`; `menu-bar` arrived later as a Beta; `tool` is the most recent addition for AI Extensions [76]. This is convergent evidence that a fixed enum of "command modes" is a design that *needs to grow* with the product.
- **Source maps for production errors** [76]: an explicit admission that production stack traces were previously unusable, fixed by enabling source maps.

The Raycast engineering blog also candidly notes [75]: "at first we thought there should only be a single command per installable bundle or package. We had no idea people would push the platform and build uber-extensions such as GitLab or Supernova. So it took us a while to arrive at the conceptual model of having an 'extension' that exposes one or more 'commands'." This is a direct admission that the **one-command-per-extension vs. many-commands-per-extension** axis was a real design mistake the team had to walk back.

---

## 3. Convergence matrix

Y = present and first-class. P = partial / present but not in the canonical command record. N = absent or not applicable. *Italic* notes clarify form.

| Field / Concept                | Linear (in-app) | Linear (MCP) | Notion (slash) | Notion (API) | Obsidian | Slack | Raycast |
|--------------------------------|:---------------:|:------------:|:--------------:|:------------:|:--------:|:-----:|:-------:|
| **id** (stable identifier)     | Y *(internal)*  | Y            | Y *(internal)* | N/A          | Y        | Y *(=`/command` string)* | Y *(`name`)* |
| **title / name** (human label) | Y               | Y *(via desc)* | Y            | N/A          | Y        | Y *(`description`)* | Y |
| **handler** (function or URL)  | Y               | Y *(server fn)* | Y *(closed)* | N/A          | Y *(callback)* | Y *(`url` webhook)* | Y *(default export)* |
| **parameters schema**          | N               | Y *(JSON Schema)* | N         | N/A          | N        | P *(only `functions` block; slash text is opaque)* | Y *(`arguments`)* |
| **when / context predicate**   | N *(server)*    | N            | N              | N/A          | Y *(`checkCallback`)* | N *(server)* | P *(`mode` enum)* |
| **category**                   | P *(internal grouping)* | N    | P *(turn-, etc.)* | N/A       | N        | N     | Y *(`categories`)* |
| **icon**                       | Y               | N            | P *(per command)* | N/A       | Y *(string Lucide id)* | P *(app-level)* | Y |
| **hotkey / keybinding**        | Y *(internal)*  | N            | P *(default Cmd-shortcuts)* | N/A | Y *(`hotkeys`)* | N | Y *(`hotkey` suggestion)* |
| **keywords / aliases**         | Y *(palette)*   | N            | N              | N/A          | N        | N     | Y |
| **subtitle / description**     | Y               | Y            | N              | N/A          | N        | Y     | Y |
| **AI / tool exposure**         | Y *(MCP server)* | Y           | Y *(Notion MCP)* | Y           | N *(first-party)* | P *(Assistant, but disjoint from slash commands)* | Y *(AI Extensions + MCP client)* |
| **Third-party command registry** | N             | Y *(MCP)*    | N              | Y *(REST)*   | Y *(plugins)* | Y *(slash_commands)* | Y *(extensions)* |
| **Sandbox boundary**           | N/A             | OAuth + server | N/A          | OAuth + server | None *(full Node)* | HTTPS + signed | esbuild + Node host |

**Convergent fields (4+ of 5 products as a first-class command record field):**
- `id`: 5/5
- `title/name`: 5/5
- `handler`: 5/5 (where applicable — Notion's slash commands are closed, but every product that *has* a public command surface has a handler)
- `description/subtitle`: 4/5
- AI exposure as MCP/tool: 4/5 (Linear, Notion, Raycast first-party; Slack partial; Obsidian only via community)

**Partial fields (present in 2–3 products, or non-first-class):**
- `parameters schema`: 2/5 first-class (Raycast, Linear MCP); + 1 partial (Slack functions, not slash commands)
- `when/context`: 1/5 first-class (Obsidian); 1/5 partial (Raycast `mode`)
- `category`: 2/5 (Raycast, Linear partial)
- `icon`: 3/5 (Raycast, Linear, Obsidian)
- `hotkey`: 3/5 first-class (Obsidian, Raycast, Linear-internal)

**Verdict against wrapex:** the wrapex `CommandRecord` is on convergence for `id`, `title`, `handler`, `parameters/schema`, `icon`. It is *over-claiming* convergence on `category`. It is *idiosyncratic in form* on `when/context` (no two products agree on the *form*, only on the *concept*). It is **missing `hotkey`/`keybinding`** as a first-class field, which is genuinely convergent across the three products that have an in-app command palette (Obsidian, Raycast, Linear-internal).

---

## 4. Falsification notes

Honest gaps in publicly documented information, and what would have to be true for the convergence claim to be wrong, per product:

- **Linear**: The convergence claim weakens if the **internal** Cmd+K command record is structurally different from the public MCP tool record — and it almost certainly *is*, because Linear has never published the internal shape. I am inferring the internal shape from kbar [19] and from third-party Linear-like rebuilds [82]. If Linear's internal `Action` type lacked, say, an `icon` or a `keywords` field, my "Y" markings for Linear-in-app would be wrong. The MCP side is verifiable from primary docs [57]; the in-app side is not.

- **Notion**: The convergence claim is **almost falsified for Notion by construction** — Notion has no public command record at all. I include Notion in the matrix because the article needs the comparison, but Notion's row should be read as "we cannot verify any of these claims because the surface is closed." If a future reader discovers a leaked or beta Slash Command API for Notion, every "P" and "Y" in Notion's row could move. Right now the only safe claim is "Notion has not committed to a public command-dispatch interface."

- **Obsidian**: My claim that `checkCallback` is Obsidian's analogue of VS Code's `when` would be falsified if Obsidian ships a declarative `when` clause in a future API version. As of the docs snapshot I read [52, 53], no such field exists, and the four-callback split is the team's chosen idiom. Less critically, my "no parameter system" claim would be falsified if a community plugin convention has emerged that the docs don't acknowledge — possible, but not documented.

- **Slack**: The convergence claim is **structurally weak for Slack** because Slack's "command" is an HTTP route, not an in-process dispatch. If we were to be strict, Slack should not be counted in a convergence analysis of in-app command palettes at all. I include it because (a) the article explicitly asks me to, and (b) Slack's `functions` block in the manifest [67] *does* implement an in-process typed-input pattern that genuinely converges with Raycast and Obsidian — but that pattern is for Workflow Builder, not for the slash menu. The claim that "Slack converges on command-record design" is partially false; the truer claim is "Slack's Workflow Builder functions converge; Slack's slash commands are sui generis HTTP route declarations."

- **Raycast**: Strong public evidence; the falsification risk is small. The one place I am extrapolating is the claim that AI Extensions and commands "deliberately coexist in the same `package.json`" — this is a design observation, not a quoted statement. If the Raycast team publishes a future post saying "we regret combining commands and tools in one manifest and will split them," that would falsify my framing.

---

## 5. Recommendations for wrapex

Given the audit, four concrete recommendations and one anti-pattern:

1. **Add `hotkey` as a first-class field on `CommandRecord`.** Three of five products (Obsidian, Raycast, Linear-internal) carry it natively, and the open-source community libraries that codify the Linear-style palette (`kbar` [19], `cmdk` [18]) all do too. The shape that converges is `{ modifiers: Modifier[]; key: string }`, with a clarifying note that this is a *suggestion* the user can override (this matches both Obsidian [54] and Raycast [55]). Threshold for moving forward: if more than one wrapex consumer asks how to bind a shortcut, add it; don't wait for a fourth.

2. **Don't elevate `category` and `icon`.** They are nice-to-have discovery aids in two products (Raycast, Linear) but absent or merely cosmetic in the other three. Make them optional, document them as "for palette UI rendering only, not part of dispatch semantics." Threshold to elevate: if the project ever builds a palette UI that genuinely benefits from icons, promote them at that point.

3. **Pick a `when`/`context` model and don't grow callbacks like Obsidian did.** Obsidian's four-callback split is a cautionary tale [52, 66]: starting with one callback, then adding `checkCallback`, then `editorCallback`, then `editorCheckCallback` produced four variants where one declarative DSL would have done the job. VS Code's `when` clauses [10] are not perfect, but they are *one field*, parseable, testable, and serializable. If wrapex is going to support context predicates at all, do it once with a small expression language (or with a single `enabled?: (ctx) => boolean` field), not with a callback-variant explosion.

4. **For the AI bridge, mirror Raycast's separation, not Slack's collapse.** Raycast keeps `commands` (Root Search entry points) and `tools` (LLM entry points) as siblings in the same manifest with separate type signatures [73, 74]. Slack tried to retrofit AI onto the slash-command surface with `assistant_view` and ended up with two parallel surfaces that don't share parameter schemas [67]. The Raycast pattern is cleaner and matches what the wrapex article's §2 sketches: a `CommandRecord` for the human-driven path, and a Zod-schema-validated tool record derived from the same source for the LLM path.

5. **Don't try to be Notion.** Closed slash-command surfaces optimize for product polish at the cost of every extensibility property an audit like this measures. If wrapex's value proposition is "extensible command dispatch," Notion is an anti-example, not a model.

**Benchmarks that would change these recommendations:**
- If Notion ships a public slash-command extension API, re-audit; the `category` argument may strengthen.
- If Slack deprecates slash commands in favor of Workflow Builder functions, drop slash commands from convergence calculations.
- If three or more products converge on a *declarative* `when` DSL within 12 months, reconsider recommendation 3.

---

## 6. Caveats

- The audit is biased toward what is **publicly documented**. Linear's in-app palette and Notion's slash menu are both substantial command-dispatch systems whose internals I had to infer from secondary evidence (kbar [19], CKEditor 5 issue threads [64]). A team member of either company would correctly object to specific "Y" or "N" markings.
- The audit is **a snapshot of May 2026**. Slack's next-generation platform (Deno SDK, `functions`/`workflows`) and Raycast's AI Extensions are both moving targets. Within twelve months either could be deprecated or expanded.
- The Slack row in the matrix should be read with caution: Slack's "commands" are categorically different from the others. I included Slack as the task requested, but a strict reading of "command-dispatch pattern" would exclude HTTP-webhook slash commands from convergence analysis entirely.
- I rely on the Obsidian `Command` interface from the marcusolsson community mirror [52] and on official quotes [53]; the primary `obsidian.d.ts` file in the obsidianmd/obsidian-api GitHub repository was inaccessible during this research turn, so the exact field list could differ in the latest API revision (the mirror tracks closely but is not the source of truth).
- "Convergence" in this report means "the same concept appears in 4+ of 5 products in some form." It does **not** mean "the products agree on the type signature." On `when`/context in particular, the *concept* is universal but the *form* is wildly divergent, and the convergence claim should be read accordingly.
- I was unable to find an engineering-blog post from Linear specifically about the Cmd+K menu's design history; the closest public reflection is Andreas Eldh's "Invisible details" piece [61] on contextual menus, which touches the palette only obliquely. If such a post exists internally or on Linear's careers/changelog pages and I missed it, the failure-modes section for Linear is thinner than it should be.

---

## References

[1] [VS Code Extension API — Commands](https://code.visualstudio.com/api/extension-guides/command).
[2] [VS Code Extension API — Contribution Points](https://code.visualstudio.com/api/references/contribution-points).
[3] Wallace E. [How we built the Figma plugin system. Figma Engineering Blog, 2019](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/).
[5] [Model Context Protocol — Tools concept](https://modelcontextprotocol.io/docs/concepts/tools).
[6] [Vercel AI SDK — Tool foundations](https://sdk.vercel.ai/docs/foundations/tools).
[10] [VS Code — When-clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts).
[11] [VS Code — Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy).
[16] [Vercel AI SDK — `zodSchema` reference](https://sdk.vercel.ai/docs/reference/ai-sdk-core/zod-schema).
[18] [cmdk — Command menu for React](https://cmdk.paco.me/).
[19] [kbar — Command palette for React (GitHub)](https://github.com/timc1/kbar).
[47] [Raycast Extension API — Manifest: command arguments](https://developers.raycast.com/information/manifest).
[50] Solomon S. [Designing command palettes, 2024](https://www.smashingmagazine.com/2024/02/designing-command-palettes/).
[51] Boucher T. [How to build a remarkable command palette — Superhuman Engineering Blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/).
[52] Olsson M. [Obsidian Plugin Developer Docs — `Command` interface (community mirror)](https://marcusolsson.github.io/obsidian-plugin-docs/reference/typescript/interfaces/Command).
[53] [Obsidian Developer Docs — Commands](https://docs.obsidian.md/Plugins/User+interface/Commands).
[54] [Obsidian Plugin Developer Docs — `Command.hotkeys`](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/commands).
[55] [Raycast Extension API — Command hotkey suggestion](https://developers.raycast.com/information/manifest).
[56] [Linear Developers — Getting started (GraphQL)](https://linear.app/developers/graphql).
[57] [Linear Docs — MCP server](https://linear.app/docs/mcp).
[58] [Linear Docs — API and Webhooks](https://linear.app/docs/api-and-webhooks).
[59] [Linear Changelog — MCP server (2025-05-01)](https://linear.app/changelog/2025-05-01-mcp).
[60] [tacticlaunch/mcp-linear — Linear MCP server (community implementation)](https://github.com/tacticlaunch/mcp-linear).
[61] Eldh A. [Invisible details. Linear Engineering on Medium](https://medium.com/linear-app/invisible-details-2ca718b41a44).
[62] [Notion Developers — Documentation home](https://developers.notion.com/).
[63] [Notion Help — Using slash commands](https://www.notion.com/help/guides/using-slash-commands).
[64] [CKEditor 5 — Issue #5714: Slash commands (cites Notion as design target)](https://github.com/ckeditor/ckeditor5/issues/5714).
[65] [phibr0/obsidian-commander — Commander plugin (GitHub)](https://github.com/phibr0/obsidian-commander).
[66] [Obsidian Forum — Commands, editorCallback, other editors (thread)](https://forum.obsidian.md/t/commands-editorcallback-other-editors/73318).
[67] [Slack Developer Docs — App manifest reference](https://docs.slack.dev/reference/app-manifest/).
[68] [Slack — App manifests concept page](https://api.slack.com/concepts/manifests).
[69] [Slack Developer Docs — Implementing slash commands](https://api.slack.com/interactivity/slash-commands).
[70] [Slack — Capturing data with a Slash Command and Dialog](https://api.slack.com/best-practices/blueprints/slash-command-and-dialogs).
[71] [Vercel Academy — Slash commands tutorial with AI SDK](https://vercel.com/academy/slack-agents/slash-commands).
[72] [Slack Developer Docs — Developer FAQ (signing-secret vs verification token)](https://api.slack.com/faq).
[73] [Raycast API — Manifest](https://developers.raycast.com/information/manifest).
[74] [Raycast API — Learn Core Concepts of AI Extensions](https://developers.raycast.com/ai/learn-core-concepts-of-ai-extensions).
[75] [Raycast Blog — How the Raycast API and extensions work](https://www.raycast.com/blog/how-raycast-api-extensions-work).
[76] [Raycast API — Changelog](https://developers.raycast.com/misc/changelog).
[77] [Raycast Manual — Model Context Protocol](https://manual.raycast.com/ai/model-context-protocol).
[78] [Raycast Changelog — v1.98.0 (MCP integration)](https://www.raycast.com/changelog/1-98-0).
[79] [Raycast API — File Structure](https://developers.raycast.com/information/file-structure).
[80] [Raycast API — Changelog (workaround namespace)](https://developers.raycast.com/misc/changelog).
[81] [Raycast API — Menu Bar Commands](https://developers.raycast.com/api-reference/menu-bar-commands).
[82] [LogRocket Blog — React command palette with Tailwind and Headless UI (Linear-style clone)](https://blog.logrocket.com/react-command-palette-tailwind-css-headless-ui/).