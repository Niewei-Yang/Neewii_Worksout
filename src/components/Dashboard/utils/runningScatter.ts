import type { Activity } from '../types';
import { isRunning } from './activityTypes';

export interface RunningPoint {
  activity: Activity;
  pace: number; // seconds per kilometre
  heartRate: number;
  distance: number; // kilometres
  date: number;
}

export type Point3D = [number, number, number];
// Look along the distance axis initially: pace is horizontal, heart rate is
// vertical, and rotation reveals the distance dimension.
export const INITIAL_ROTATION = { yaw: 0, pitch: 0 };

export function runningPoints(activities: Activity[]): RunningPoint[] {
  return activities.flatMap((activity) => {
    const {
      average_speed: speed,
      average_heartrate: heartRate,
      distance,
    } = activity;
    const date = new Date(
      activity.start_date_local.replace(' ', 'T')
    ).getTime();
    const pace = 1000 / speed;
    if (
      !isRunning(activity.type) ||
      !Number.isFinite(pace) ||
      pace <= 0 ||
      !Number.isFinite(heartRate) ||
      !heartRate ||
      heartRate <= 0 ||
      !Number.isFinite(distance) ||
      distance <= 0 ||
      !Number.isFinite(date)
    )
      return [];
    return [{ activity, pace, heartRate, distance: distance / 1000, date }];
  });
}

// Spread colours evenly by run number, regardless of gaps between dates.
// Constant perceptual lightness keeps the continuous blue-to-orange hue sweep
// legible on both themes without distinct colour bands.
export function runningSequenceColor(index: number, count: number) {
  const t = count <= 1 ? 1 : Math.max(0, Math.min(1, index / (count - 1)));
  return `oklch(70% 0.17 ${(260 - 220 * t).toFixed(2)})`;
}

export function rotateScatter(
  current: typeof INITIAL_ROTATION,
  yaw: number,
  pitch: number
) {
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  return { yaw: wrap(current.yaw + yaw), pitch: wrap(current.pitch + pitch) };
}

export function scatterDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.08, max * 0.02, 0.1);
  return [Math.max(0, min - padding), max + padding];
}

export function normalizeScatter(value: number, [min, max]: [number, number]) {
  return ((value - min) / (max - min)) * 2 - 1;
}

// An orthographic camera: rotate around the vertical heart-rate axis, then tilt.
// Depth is retained so points can be painted from back to front.
export function projectScatter(
  [x, y, z]: Point3D,
  { yaw, pitch }: typeof INITIAL_ROTATION
) {
  const horizontal = x * Math.cos(yaw) + y * Math.sin(yaw);
  const depth = -x * Math.sin(yaw) + y * Math.cos(yaw);
  return {
    x: 240 + horizontal * 100,
    y: 195 + (depth * Math.sin(pitch) - z * Math.cos(pitch)) * 100,
    depth: depth * Math.cos(pitch) + z * Math.sin(pitch),
  };
}

export function formatScatterPace(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
