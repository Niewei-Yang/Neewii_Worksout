import type { Activity } from '../types';
import { isRunning } from './activityTypes';

export const DISTANCES = [
  { key: '5K', meters: 5000 },
  { key: '10K', meters: 10000 },
  { key: 'Half Marathon', meters: 21097.5 },
  { key: 'Marathon', meters: 42195 },
];

export function personalBests(activities: Activity[]) {
  return DISTANCES.map(({ key, meters }) => {
    let activity: Activity | null = null;
    let time = Infinity;
    for (const run of activities) {
      if (!isRunning(run.type)) continue;
      for (const effort of run.best_efforts || []) {
        if (
          Math.abs(effort.distance - meters) <= 1 &&
          Number.isFinite(effort.elapsed_time) &&
          effort.elapsed_time > 0 &&
          effort.elapsed_time < time
        ) {
          activity = run;
          time = effort.elapsed_time;
        }
      }
    }
    return { key, activity, time: activity ? time : 0 };
  });
}
