import type { Activity } from '../types';
import { isCycling, isRunning } from './activityTypes';

export const DISTANCES = [
  { key: '400m', meters: 400 },
  { key: '1K', meters: 1000 },
  { key: '5K', meters: 5000 },
  { key: '10K', meters: 10000 },
  { key: 'Half Marathon', meters: 21097.5 },
  { key: 'Marathon', meters: 42195 },
];

export const POWER_DURATIONS = [5, 60, 300, 1200, 2400, 3600];

export function cyclingPowerBests(activities: Activity[]) {
  return POWER_DURATIONS.map((duration) => {
    let activity: Activity | null = null;
    let watts = 0;
    for (const ride of activities) {
      if (!isCycling(ride.type) || ride.device_watts !== true) continue;
      for (const effort of ride.power_efforts || []) {
        if (
          effort.duration === duration &&
          Number.isFinite(effort.watts) &&
          effort.watts > watts
        ) {
          activity = ride;
          watts = effort.watts;
        }
      }
    }
    return { duration, activity, watts };
  });
}

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
