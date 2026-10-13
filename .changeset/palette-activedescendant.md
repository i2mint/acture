---
"acture-palette-react": patch
---

Accessibility: the palette (list and enum picker step) now publishes `aria-activedescendant` for the initially highlighted option (and keeps it on the highlight while filtering). cmdk 1.1.1 only published it once the highlight moved, so a screen reader did not hear the first option until the first arrow key.
