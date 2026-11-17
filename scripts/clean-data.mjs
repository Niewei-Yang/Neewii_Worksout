import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const fixedPaths = [
  'run_page/data.db',
  'run_page/data.db-wal',
  'run_page/data.db-shm',
  'run_page/data.db-journal',
  'src/static/activities.json',
  'imported.json',
  'synced_activity.json',
  'public/data/activity-timelines',
  'public/data/pace-preview.json',
  '.cache/activity-timeline-worker.json',
  'strava_missing_report.md',
];
const outputFolders = [
  'activities',
  'GPX_OUT',
  'TCX_OUT',
  'FIT_OUT',
  'Workouts',
  'PNG_OUT',
];
const generatedSvg =
  /^(?:github|grid|mol|github_\d{4}|year_\d{4}|mol_[a-z_]+)\.svg$/;
const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 80">
  <title>No activity data</title>
  <text x="20" y="45" fill="#888" font-family="sans-serif" font-size="16">No activity data yet</text>
</svg>
`;

// Check every existing path component before moving anything. Never follow a
// junction/symlink into another checkout or outside the selected project.
function inside(root, name) {
  const target = resolve(root, name);
  const local = relative(root, target);
  if (
    !local ||
    local === '..' ||
    local.startsWith(`..${sep}`) ||
    isAbsolute(local)
  )
    throw new Error(`Data path is outside the project: ${name}`);
  let current = root;
  for (const part of local.split(sep)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(`Refusing a symlink or junction: ${name}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

export function cleanData(
  rootDirectory = projectRoot,
  { dryRun = false } = {}
) {
  const root = realpathSync(rootDirectory);
  const candidates = [...fixedPaths];
  for (const folder of outputFolders) {
    const path = inside(root, folder);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path)) {
      if (name !== '.gitkeep' && name !== 'README.md')
        candidates.push(`${folder}/${name}`);
    }
  }
  const assets = inside(root, 'assets');
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (generatedSvg.test(name)) candidates.push(`assets/${name}`);
    }
  }
  const paths = candidates.filter((name) => existsSync(inside(root, name)));
  const replacements = {
    'src/static/activities.json': '[]\n',
    'imported.json': '[]\n',
    'public/data/activity-timelines/index.json':
      '{"version":1,"activities":{}}\n',
    'assets/github.svg': emptySvg,
    'assets/grid.svg': emptySvg,
    'assets/mol.svg': emptySvg,
  };
  for (const name of Object.keys(replacements)) inside(root, name);
  inside(root, '.local-backups');
  if (dryRun)
    return { paths, replacements: Object.keys(replacements), backup: null };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = inside(root, `.local-backups/data-${stamp}-${randomUUID()}`);
  mkdirSync(backup, { recursive: true });
  writeFileSync(
    resolve(backup, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), paths }, null, 2) +
      '\n'
  );
  for (const name of paths) {
    const destination = resolve(backup, name);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(inside(root, name), destination);
  }
  for (const [name, content] of Object.entries(replacements)) {
    const destination = inside(root, name);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  return { paths, replacements: Object.keys(replacements), backup };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) {
    console.error('Usage: pnpm data:clean [--dry-run]');
    process.exitCode = 1;
  } else {
    try {
      const result = cleanData(projectRoot, {
        dryRun: args.includes('--dry-run'),
      });
      console.log(
        result.backup
          ? `Data backup: ${result.backup}`
          : 'Preview only; no files changed.'
      );
      for (const name of result.paths) console.log(`  Archive: ${name}`);
      for (const name of result.replacements) console.log(`  Reset: ${name}`);
      console.log(
        'Next: sync/import your own activities, then rebuild the statistics.'
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
