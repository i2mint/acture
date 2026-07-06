# acture-hotkeys

## 1.0.1

### Patch Changes

- 5dc511e: Republish to fix the published peer dependency on `acture`.

  The npm-published `1.0.0` of these three consumer packages pins `acture` to
  `1.1.0` **exactly** in `peerDependencies`, so `npm install` fails (ERESOLVE)
  in any app that also has a newer `acture` (e.g. `acture@1.3.0`):

  ```
  peer acture@"1.1.0" from acture-palette-react@1.0.0
  ```

  The source on `main` already declares the correct `^1.0.0` range — it was
  simply never republished after that fix. This patch bump republishes the three
  packages so npm serves the corrected `^1.0.0` peer, and consumers can install
  them alongside any `acture@^1.x` without `--legacy-peer-deps`.

  (`acture-forms-autoform` was already republished with the correct range at
  `1.0.1`, so it is not included here.)
