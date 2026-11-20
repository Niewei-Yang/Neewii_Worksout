import type { Activity } from './utils';

type ActivityAsset = { url: string; bytes: number };

export class ActivityDownloadError extends Error {
  constructor(
    readonly url: string,
    cause: unknown
  ) {
    super(`活动数据下载失败：${url.split('/').pop()}`, { cause });
  }
}

async function decodeRecords(data: Blob): Promise<Activity[]> {
  const records: unknown = JSON.parse(await data.text());
  if (!Array.isArray(records))
    throw new Error('Activity data must be an array');
  return records as Activity[];
}

// A slow connection can keep downloading as long as it is making progress.
async function fetchPart(
  asset: ActivityAsset,
  group?: AbortSignal,
  onBytes?: (size: number) => void
): Promise<Blob> {
  const request = new AbortController();
  const abort = () => request.abort();
  let timer = setTimeout(abort, 25000);
  group?.addEventListener('abort', abort);
  try {
    const response = await fetch(asset.url, { signal: request.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (
      !response.body ||
      response.headers.get('content-type')?.includes('text/html')
    ) {
      throw new Error('Expected activity data');
    }
    const reader = response.body.getReader();
    const bytes: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.push(value);
      received += value.byteLength;
      onBytes?.(received);
      clearTimeout(timer);
      timer = setTimeout(abort, 25000);
    }
    if (received !== asset.bytes) throw new Error('Incomplete activity data');
    return new Blob(bytes);
  } catch (error) {
    throw new ActivityDownloadError(asset.url, error);
  } finally {
    clearTimeout(timer);
    group?.removeEventListener('abort', abort);
  }
}

export async function downloadActivities(
  full: ActivityAsset,
  parts: ActivityAsset[],
  report?: (message: string) => void
): Promise<Activity[]> {
  try {
    const data = await fetchPart(full, undefined, (size) =>
      report?.(`已收到 ${Math.ceil(size / 1024)} KiB 运动数据`)
    );
    return await decodeRecords(data);
  } catch (error) {
    if (!parts.length) throw error;
  }

  // Keep request pressure bounded and restore byte order before decoding UTF-8.
  const group = new AbortController();
  const chunks: Blob[] = [];
  let next = 0;
  let completed = 0;
  const reportRecovery = () =>
    report?.(`正在分段恢复运动数据（${completed} / ${parts.length}）`);
  reportRecovery();
  async function worker() {
    while (!group.signal.aborted && next < parts.length) {
      const index = next++;
      chunks[index] = await fetchPart(parts[index], group.signal);
      completed++;
      reportRecovery();
    }
  }
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, parts.length) }, worker)
    );
    return await decodeRecords(new Blob(chunks));
  } finally {
    group.abort();
  }
}
