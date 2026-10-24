import { isActivityExcludedFromTotals, type Activity } from '@/utils/utils';
import { isCycling, isHiking, isRunning } from './activityTypes';

export const TRACK_WALL_COLORS = {
  Run: '#f97316',
  Ride: '#3b82f6',
  Hike: '#22c55e',
  Other: '#ec4899',
};

export function trackWallType(type: string): keyof typeof TRACK_WALL_COLORS {
  if (isRunning(type)) return 'Run';
  if (isCycling(type)) return 'Ride';
  if (isHiking(type)) return 'Hike';
  return 'Other';
}

export function isTrackWallActivity(
  activity: Pick<Activity, 'type' | 'distance' | 'summary_polyline'>
): boolean {
  if (isActivityExcludedFromTotals(activity.type)) return false;
  const type = trackWallType(activity.type);
  const minimumDistance =
    type === 'Run' ? 5000 : type === 'Ride' ? 20000 : 10000;
  return (
    activity.distance >= minimumDistance &&
    Boolean(activity.summary_polyline && activity.summary_polyline.length > 20)
  );
}
