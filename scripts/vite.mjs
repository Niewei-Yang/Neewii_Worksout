import { fileURLToPath } from 'node:url';

// Limit esbuild's Go workers on Windows, where the default concurrency can
// leave transforms waiting indefinitely. Preserve an explicit user setting.
if (process.platform === 'win32') {
  process.env.GOMAXPROCS ??= '2';
}

// Run Vite's CLI after setting the limit, preserving its commands and options.
const viteCli = new URL('../../bin/vite.js', import.meta.resolve('vite'));
process.argv = [
  process.execPath,
  fileURLToPath(viteCli),
  ...process.argv.slice(2),
];
await import(viteCli.href);
