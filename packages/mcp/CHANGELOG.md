# acture-mcp-server

## 1.0.1

### Patch Changes

- 6d803a5: Pin the MCP protocol-spec version this package is built against (currently `2025-11-25`). New test (`spec-version.test.ts`) asserts the SDK's `LATEST_PROTOCOL_VERSION` matches the pinned expected value and that `SUPPORTED_PROTOCOL_VERSIONS` still contains the older dates we interoperate with — so an SDK upgrade that bumps the spec is caught explicitly and can be evaluated as a deliberate, semver-major refresh of `acture-mcp-server` rather than an accidental transitive-dep pickup. README documents the policy and points at the test's upgrade checklist.
