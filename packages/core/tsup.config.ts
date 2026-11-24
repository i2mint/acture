import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/lite.ts', 'src/selection.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Share chunks in CJS too, so `acture` and `acture/lite` throw the same
  // error classes under require() (instanceof holds across entries).
  splitting: true,
  target: 'es2022',
  outDir: 'dist',
});
