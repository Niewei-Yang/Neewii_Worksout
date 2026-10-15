import { useEffect, useState } from 'react';
import type { PaceRun } from '../utils/paceTimeline';

interface TimelineIndex {
  version: number;
  activities: Record<string, { state: string; updated_at: string }>;
}

const base = `${import.meta.env.BASE_URL}data/activity-timelines/`;
let indexPromise: Promise<TimelineIndex> | undefined;
let indexLoadedAt = 0;
const files = new Map<string, Promise<PaceRun>>();

function loadIndex() {
  if (!indexPromise || Date.now() - indexLoadedAt > 30000) {
    indexLoadedAt = Date.now();
    indexPromise = fetch(`${base}index.json`, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Timeline index unavailable');
        const data = await response.json();
        if (
          data.version !== 1 ||
          !data.activities ||
          Array.isArray(data.activities)
        )
          throw new Error('Invalid timeline index');
        return data as TimelineIndex;
      })
      .catch((error) => {
        indexPromise = undefined;
        throw error;
      });
  }
  return indexPromise;
}

async function loadActivity(id: number): Promise<PaceRun | null> {
  const index = await loadIndex();
  const entry = index.activities[String(id)];
  if (!entry || entry.state !== 'ready') return null;
  const key = `${id}:${entry.updated_at}`;
  let file = files.get(key);
  if (!file) {
    file = fetch(`${base}${id}.json?v=${encodeURIComponent(entry.updated_at)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Activity timeline unavailable');
        const data = await response.json();
        if (
          data.id !== id ||
          !Array.isArray(data.bins) ||
          !(data.elapsed_time > 0)
        )
          throw new Error('Invalid activity timeline');
        return data as PaceRun;
      })
      .catch((error) => {
        files.delete(key);
        throw error;
      });
    files.set(key, file);
    if (files.size > 32) files.delete(files.keys().next().value!);
  }
  return file;
}

export function useActivityTimeline(activityId: number) {
  const [state, setState] = useState<{
    id: number;
    data: PaceRun | null;
    error: boolean;
  }>({ id: activityId, data: null, error: false });
  useEffect(() => {
    let active = true;
    loadActivity(activityId)
      .then((data) => {
        if (active) setState({ id: activityId, data, error: false });
      })
      .catch(() => {
        if (active) setState({ id: activityId, data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [activityId]);
  return state.id === activityId
    ? state
    : { id: activityId, data: null, error: false };
}
