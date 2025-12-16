import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'ai/index': 'src/ai/index.ts',
    'cli': 'src/cli.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  treeshake: true,
  target: 'es2022',
  external: ['node:fs', 'node:fs/promises', 'node:path', 'node:readline'],
});
