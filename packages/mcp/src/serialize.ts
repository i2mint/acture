/**
 * Wire-safe JSON serialization for MCP content.
 *
 * Both the write side (tool results, `tools.ts`) and the read side
 * (resource contents + the getState tool, `resources.ts`) serialize
 * **app-supplied** values (typed `unknown`) whose JSON-serializability
 * acture cannot guarantee. A raw `JSON.stringify` has two failure modes
 * that break the errors-as-data boundary these modules promise:
 *
 *   1. It **throws** on a `BigInt`, a circular reference, or a value with a
 *      throwing `toJSON` — the exception then escapes the pure function and,
 *      with no try/catch at the SDK handler, the model receives a JSON-RPC
 *      protocol error instead of an `isError` tool result.
 *   2. It **returns `undefined`** (not a string) for `undefined` and for
 *      function values — so `content: [{ type: 'text', text: undefined }]`
 *      is emitted, a malformed MCP content field (its `text` is required to
 *      be a string; the property drops on the wire).
 *
 * {@link safeStringify} closes both holes: it never throws and always
 * returns a string. Callers decide whether a serialization failure should
 * surface as `isError` (the write/getState side) or simply as the resource
 * body (the read side, which has no error channel).
 */

/** Outcome of {@link safeStringify}: the JSON text (always a string) plus
 *  whether serialization failed and `text` is the fallback error payload. */
export interface SafeStringifyResult {
  text: string;
  error: boolean;
}

/**
 * `JSON.stringify(value, null, 2)` that never throws and always yields a
 * string. `undefined` / function values (which `JSON.stringify` renders as
 * `undefined`) serialize as `"null"`. On a serialization failure — a
 * `BigInt`, a circular reference, or a throwing `toJSON` — returns a
 * structured `unserializable_state` payload with `error: true`, so the
 * caller can keep its errors-as-data boundary intact.
 */
export function safeStringify(value: unknown): SafeStringifyResult {
  try {
    const text = JSON.stringify(value, null, 2);
    // JSON.stringify(undefined) === undefined; a function serializes the same
    // way. Coerce to the JSON null literal so `text` is always a string.
    return { text: text === undefined ? 'null' : text, error: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      text: JSON.stringify({
        code: 'unserializable_state',
        message: `value is not JSON-serializable: ${message}`,
      }),
      error: true,
    };
  }
}
