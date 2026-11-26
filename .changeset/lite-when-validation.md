---
"acture": patch
---

`acture/lite`: a `when` that is not a function, a string (with `evaluateWhen`) or omitted (`null`, `false`, `0`, `{}`, `new String(...)`) is refused at `register` time with `RegistrationError`, as the full registry refuses it, instead of being treated as always available.
