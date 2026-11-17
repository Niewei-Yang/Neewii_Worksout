import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { cleanData } from '../scripts/clean-data.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workouts-clean-data-'));
  const old = {
    'run_page/data.db': 'old database',
    'src/static/activities.json': '[{"name":"old activity"}]',
    'imported.json': '["old.gpx"]',
    'public/data/activity-timelines/123.json': '{"id":123}',
    'public/data/pace-preview.json': '{"activities":[{"id":123}]}',
    'assets/github.svg': '<svg>old totals</svg>',
    'assets/year_2020.svg': '<svg>old year</svg>',
    'assets/mol_running.svg': '<svg>old month</svg>',
    'GPX_OUT/old.gpx': 'old export',
  };
  const retained = {
    '.env': 'private local configuration',
    LICENSE: 'copyright',
    'GPX_OUT/.gitkeep': '',
    'assets/index.tsx': 'resource imports',
    'assets/start.svg': '<svg>start marker</svg>',
    'docs/images/example.png': 'documentation image',
    'roadtrip/new.gpx': 'new input route',
    'src/main.tsx': 'application code',
  };
  for (const [name, content] of Object.entries({ ...old, ...retained })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return { root, old, retained };
}

test('preview lists old data without changing or backing up files', () => {
  const { root, old, retained } = fixture();
  const result = cleanData(root, { dryRun: true });
  assert.ok(result.paths.includes('assets/year_2020.svg'));
  assert.equal(result.backup, null);
  assert.equal(existsSync(join(root, '.local-backups')), false);
  for (const [name, content] of Object.entries({ ...old, ...retained }))
    assert.equal(readFileSync(join(root, name), 'utf8'), content);
});

test('reset archives old data, initializes an empty site and preserves code and new inputs', () => {
  const { root, old, retained } = fixture();
  const result = cleanData(root);
  for (const [name, content] of Object.entries(old))
    assert.equal(readFileSync(join(result.backup, name), 'utf8'), content);
  for (const [name, content] of Object.entries(retained))
    assert.equal(readFileSync(join(root, name), 'utf8'), content);
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, 'src/static/activities.json'))),
    []
  );
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'imported.json'))), []);
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(root, 'public/data/activity-timelines/index.json'))
    ),
    { version: 1, activities: {} }
  );
  assert.equal(existsSync(join(root, 'run_page/data.db')), false);
  assert.equal(existsSync(join(root, 'assets/year_2020.svg')), false);
  assert.equal(existsSync(join(root, 'public/data/pace-preview.json')), false);
  for (const name of ['github.svg', 'grid.svg', 'mol.svg']) {
    const svg = readFileSync(join(root, 'assets', name), 'utf8');
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(!svg.includes('old'));
  }
});

test('reset rejects a directory junction before moving any project or external data', () => {
  const { root } = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'workouts-external-data-'));
  writeFileSync(join(outside, 'keep.txt'), 'outside data');
  symlinkSync(outside, join(root, '.local-backups'), 'junction');
  assert.throws(() => cleanData(root), /symlink or junction/);
  assert.equal(
    readFileSync(join(root, 'run_page/data.db'), 'utf8'),
    'old database'
  );
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'outside data');
});
