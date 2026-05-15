# eslint-plugin-acture-migration

## 1.1.0

### Minor Changes

- 6d803a5: Add the `acture/require-param-describe` schema-quality rule. Flags top-level fields in a `defineCommand({ params: z.object({...}) })` schema that have no `.describe(...)` in their method chain — without it, the projection to JSON Schema drops the field's `description` and every downstream consumer (MCP tool definitions, AI function-calling tool arguments, autoform / rjsf form adapters) is left without the semantic hint a model or a form-renderer needs. Conservative detection (configurable `actureModule` / `zodModule`; only fires when `params` is structurally `z.object({...})`). The package now hosts both migration-specific and schema-quality rules; the historical `-migration` suffix is kept to avoid a breaking package rename.
