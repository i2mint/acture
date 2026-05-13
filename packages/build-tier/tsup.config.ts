import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/esbuild.ts', 'src/vite.ts', 'src/ast.ts'],
  external: ['ts-morph'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  outDir: 'dist',
});
