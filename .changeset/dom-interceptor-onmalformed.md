---
'acture-migration': minor
---

`createDomInterceptor` accepts an optional `onMalformedAttribute(raw, element, error)` callback that fires when `data-acture-params` (or the configured params attribute) contains JSON that fails to parse. The interceptor still swallows the parse error and dispatches with `params = undefined` — the hook only exists to make the swallow **observable** for debugging. An `onMalformedAttribute` that itself throws is caught defensively, same rule as the registry's listener-error path.

No default-behavior change; existing call sites are unaffected. Closes the v1.13 audit follow-up on `dom-interceptor.ts:185`.
