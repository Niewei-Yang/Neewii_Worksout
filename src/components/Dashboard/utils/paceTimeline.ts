import { isCycling, isRunning } from './activityTypes';

export function canShowElevation(type: string, gain: number | null): boolean {
  return (isRunning(type) || isCycling(type)) && (gain ?? 0) > 500;
}

export type PaceBin = [
  number,
  number,
  number | null,
  'running' | 'paused' | 'unknown',
];
export interface ClimbSegment {
  segment_id: number;
  name: string;
  category: number;
  start: number;
  end: number;
  distance?: number;
  average_grade?: number;
}

// Strava category 1 is Cat 4, 5 is HC. Render harder overlapping climbs last.
export const CLIMB_GRADES = [
  { category: 1, label: '4', color: '#60a5fa' },
  { category: 2, label: '3', color: '#d6c04b' },
  { category: 3, label: '2', color: '#f59b45' },
  { category: 4, label: '1', color: '#e96a68' },
  { category: 5, label: 'HC', color: '#bb7cde' },
];

export function climbSpans(
  climbs: ClimbSegment[],
  duration: number
): ClimbSegment[] {
  return climbs
    .filter(
      (climb) =>
        CLIMB_GRADES.some((grade) => grade.category === climb.category) &&
        Number.isFinite(climb.start) &&
        Number.isFinite(climb.end)
    )
    .map((climb) => ({
      ...climb,
      start: Math.max(0, climb.start),
      end: Math.min(duration, climb.end),
    }))
    .filter((climb) => climb.end > climb.start)
    .sort((a, b) => a.category - b.category);
}

export interface PaceRun {
  id: number;
  name: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  bins: PaceBin[];
  speed_bins?: PaceBin[];
  elevation_bins?: PaceBin[];
  elevation_gain?: number;
  climbs?: ClimbSegment[];
  climbs_source?: 'strava_segments';
  route_points?: RoutePoint[];
  metric?: 'pace' | 'power';
  sport_group?: 'run' | 'ride';
  device_watts?: boolean | null;
  unavailable?: string;
}

export type RoutePoint = [number, number | null, number | null];

export function routePositionAtTime(
  points: RoutePoint[],
  time: number
): [number, number] | null {
  if (!points.length || time < points[0][0]) return null;
  let left = 0,
    right = points.length - 1;
  while (left + 1 < right) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid][0] <= time) left = mid;
    else right = mid;
  }
  const a = points[left],
    b = points[right];
  const previous = () => {
    let index = time >= b[0] ? right : left;
    for (; index >= 0; index--) {
      const point = points[index];
      if (point[1] != null && point[2] != null)
        return [point[1], point[2]] as [number, number];
    }
    return null;
  };
  if (time >= points.at(-1)![0]) return previous();
  for (const point of [a, b]) {
    if (time === point[0])
      return point[1] == null || point[2] == null
        ? previous()
        : [point[1], point[2]];
  }
  if (
    a[1] == null ||
    a[2] == null ||
    b[1] == null ||
    b[2] == null ||
    b[0] - a[0] > 30
  )
    return previous();
  const fraction = (time - a[0]) / (b[0] - a[0]);
  // Take the short longitude arc when a route crosses the antimeridian.
  let longitudeDelta = b[1] - a[1];
  if (longitudeDelta > 180) longitudeDelta -= 360;
  if (longitudeDelta < -180) longitudeDelta += 360;
  const longitude = ((a[1] + longitudeDelta * fraction + 540) % 360) - 180;
  return [longitude, a[2] + (b[2] - a[2]) * fraction];
}
export interface PacePreview {
  version: number;
  generated_at: string;
  window_seconds: number;
  activities: PaceRun[];
}

// Fixed pace bands for this preview, not physiological training zones.
// Lower bound inclusive, upper bound exclusive, in seconds per kilometre.
export const PACE_BANDS = [
  { min: 420, label: '≥7:00', color: '#8b9bae' },
  { min: 360, label: '6:00–7:00', color: '#5097dc' },
  { min: 330, label: '5:30–6:00', color: '#3eb99e' },
  { min: 300, label: '5:00–5:30', color: '#a6bd3e' },
  { min: 270, label: '4:30–5:00', color: '#edbd40' },
  { min: 240, label: '4:00–4:30', color: '#ee8846' },
  { min: 0, label: '<4:00', color: '#e95c72' },
];
export const PAUSED_BAND = 7;
// Absolute comparison bands, not FTP-based training zones.
export const POWER_BANDS = [
  { min: 0, label: '0–100' },
  { min: 100, label: '100–150' },
  { min: 150, label: '150–200' },
  { min: 200, label: '200–250' },
  { min: 250, label: '250–300' },
  { min: 300, label: '300–400' },
  { min: 400, label: '≥400' },
];
export const RIDE_PACE_BANDS = [
  { min: 240, label: '≥4:00' },
  { min: 180, label: '3:00–4:00' },
  { min: 150, label: '2:30–3:00' },
  { min: 120, label: '2:00–2:30' },
  { min: 100, label: '1:40–2:00' },
  { min: 90, label: '1:30–1:40' },
  { min: 0, label: '<1:30' },
];
export const UNKNOWN_BAND = 8;
export const BAND_COLORS = [
  ...PACE_BANDS.map((b) => b.color),
  '#5c6470',
  '#cbd0d8',
];

export function paceBand(
  bin: PaceBin,
  metric: 'pace' | 'power' = 'pace',
  sportGroup: 'run' | 'ride' = 'run'
): number {
  if (bin[3] === 'paused') return PAUSED_BAND;
  if (
    bin[3] !== 'running' ||
    bin[2] == null ||
    !Number.isFinite(bin[2]) ||
    bin[2] < 0 ||
    (metric === 'pace' && bin[2] === 0)
  )
    return UNKNOWN_BAND;
  if (metric === 'power') {
    return POWER_BANDS.findIndex(
      (_, index) =>
        index === POWER_BANDS.length - 1 || bin[2]! < POWER_BANDS[index + 1].min
    );
  }
  const bands = sportGroup === 'ride' ? RIDE_PACE_BANDS : PACE_BANDS;
  return bands.findIndex((band) => bin[2]! >= band.min);
}

export function bandDurations(bins: PaceBin[]): number[] {
  const totals = Array<number>(9).fill(0);
  for (const bin of bins) totals[paceBand(bin)] += bin[1] - bin[0];
  return totals;
}

export function elapsedLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function binAtTime(bins: PaceBin[], time: number): PaceBin | undefined {
  return (
    bins.find((bin) => time >= bin[0] && time < bin[1]) ||
    (time === bins.at(-1)?.[1] ? bins.at(-1) : undefined)
  );
}

export type ElevationPoint = [number, number];

export function elevationPoints(
  bins: PaceBin[],
  duration: number
): ElevationPoint[] {
  const points: ElevationPoint[] = bins.flatMap((bin) =>
    bin[2] != null && Number.isFinite(bin[2])
      ? [[(bin[0] + bin[1]) / 2, bin[2]] as ElevationPoint]
      : []
  );
  if (!points.length) return [];
  if (points[0][0] > 0) points.unshift([0, points[0][1]]);
  if (points.at(-1)![0] < duration) points.push([duration, points.at(-1)![1]]);
  return points;
}

export function elevationAtTime(
  points: ElevationPoint[],
  time: number | null
): number | null {
  if (time == null || !points.length) return null;
  if (time <= points[0][0]) return points[0][1];
  let left = 0,
    right = points.length - 1;
  while (left + 1 < right) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid][0] <= time) left = mid;
    else right = mid;
  }
  if (time >= points[right][0]) return points[right][1];
  const [start, a] = points[left];
  const [end, b] = points[right];
  return a + ((b - a) * (time - start)) / (end - start);
}
