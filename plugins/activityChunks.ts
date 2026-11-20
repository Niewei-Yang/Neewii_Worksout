import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const moduleId = 'virtual:activity-downloads';
const sourcePath = 'src/static/activities.json';

// Split bytes, so even a single long GPS track can be recovered in small requests.
export function splitActivityData(data: Buffer, limit = 48 * 1024): Buffer[] {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('Invalid chunk size');
  const parts: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += limit) {
    parts.push(data.subarray(offset, offset + limit));
  }
  return parts;
}

export function activityChunks(): Plugin {
  let file: string;
  let development: boolean;
  return {
    name: 'activity-downloads',
    configResolved(config) {
      file = resolve(config.root, sourcePath);
      development = config.command === 'serve';
    },
    resolveId(id) {
      if (id === moduleId) return '\0' + id;
    },
    load(id) {
      if (id !== '\0' + moduleId) return;
      if (development) {
        return `export default () => import('/${sourcePath}').then(m => m.default);`;
      }
      this.addWatchFile(file);
      const records: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(records)) this.error('Activity data must be an array');
      const data = Buffer.from(JSON.stringify(records));
      const emitAsset = (name: string, source: Buffer) => {
        const ref = this.emitFile({ type: 'asset', name, source });
        return `{ url: import.meta.ROLLUP_FILE_URL_${ref}, bytes: ${source.length} }`;
      };
      const full = emitAsset('activities.json', data);
      const parts = splitActivityData(data);
      const urls =
        parts.length > 1
          ? parts.map((part, i) => emitAsset(`activities-part-${i}.bin`, part))
          : [];
      return `import { downloadActivities } from '/src/utils/downloadActivities';
        export default report => downloadActivities(${full}, [${urls.join(',')}], report);`;
    },
  };
}
