---
"acture-palette-react": patch
---

Accessibility: the picker chain's text step now has an accessible name (the parameter name), and its validation error is announced (`role="alert"`, `aria-describedby`, `aria-invalid`). Adds `palette.a11y.test.tsx`, which pins the APG combobox roles, `aria-activedescendant` and the focus hand-off between the list, the picker chain and a host form.
