# acture-forms-autoform

## 1.0.1

### Patch Changes

- 070a32d: `<AutoForm />` fails soft when `command.params` bypassed the `ZodType<unknown>` type via a cast (i.e. the value isn't actually a Zod schema). Previously the form would crash with `safeParse is not a function` on submit; now it passes the raw values through to `onSubmit`, letting the dispatcher's own `params.safeParse(...)` produce the canonical error envelope.

  Also tidies the inline `as unknown as { safeParse: ... }` cast that the v1.13 audit flagged on `auto-form.tsx:32`. The duck-typed Zod handling is preserved (the package supports both Zod v3 and v4 shapes by reading `_def`/`def`).
