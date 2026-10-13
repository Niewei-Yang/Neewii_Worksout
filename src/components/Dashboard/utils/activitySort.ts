import type { Activity } from '../types';
import {
  convertMovingTime2Sec,
  isActivityDisplayOnly,
  isTransportActivity,
} from '@/utils/utils';

export type ActivitySortKey =
  | 'date'
  | 'type'
  | 'name'
  | 'distance'
  | 'elevation'
  | 'duration'
  | 'pace'
  | 'hr'
  | 'weather';
export type SortDirection = 'ascending' | 'descending';

function sortValue(a: Activity, key: ActivitySortKey): string | number | null {
  switch (key) {
    case 'date':
      return new Date(a.start_date_local.replace(' ', 'T')).getTime();
    case 'type':
      return a.type;
    case 'name':
      return a.name;
    case 'distance':
      return a.distance;
    case 'elevation':
      return isActivityDisplayOnly(a.type) || a.type === 'Workout'
        ? null
        : (a.elevation_gain ?? 0);
    case 'duration':
      return convertMovingTime2Sec(a.moving_time);
    case 'pace':
      return a.average_speed;
    case 'hr':
      return a.average_heartrate || null;
    case 'weather':
      return isActivityDisplayOnly(a.type) ||
        a.temperature_min == null ||
        a.temperature_max == null
        ? null
        : (a.temperature_min + a.temperature_max) / 2;
  }
}

export function compareActivities(
  a: Activity,
  b: Activity,
  key: ActivitySortKey,
  direction: SortDirection,
  locale: string
): number {
  // Match the legacy table: transport stays after exercise for metric sorts.
  if (key !== 'date' && key !== 'name') {
    const aTransport = isTransportActivity(a.type);
    const bTransport = isTransportActivity(b.type);
    if (aTransport !== bTransport) return aTransport ? 1 : -1;
  }
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  // Keep records without a displayed value last in either direction.
  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return 1;
  if (bValue == null) return -1;
  const result =
    typeof aValue === 'string' && typeof bValue === 'string'
      ? aValue.localeCompare(bValue, locale)
      : Number(aValue) - Number(bValue);
  return direction === 'ascending' ? result : -result;
}
