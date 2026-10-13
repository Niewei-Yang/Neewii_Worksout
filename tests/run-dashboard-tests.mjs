import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const result = await build({
  entryPoints: ['tests/dashboard.test.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  write: false,
  external: ['react', 'react-dom/server', 'recharts'],
  banner: {
    js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);",
  },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});
// The legacy constants read viewport width at import time; these are server renders.
globalThis.window = { innerWidth: 1280 };
// Keep native Node package resolution; remove the generated bundle after execution.
const temporary = await import('node:fs/promises');
const path = new URL('../.dashboard-tests.generated.mjs', import.meta.url);
await temporary.writeFile(path, result.outputFiles[0].text);
try {
  await import(path.href);
} finally {
  await temporary.unlink(path);
}
