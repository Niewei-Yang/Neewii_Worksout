import type { Locale } from '../i18n';

const normalizedType = (type: string) =>
  type.replace(/[\s_-]/g, '').toLowerCase();

export const isTrailRunning = (type: string): boolean =>
  normalizedType(type) === 'trailrun';

export const isRunning = (type: string): boolean =>
  ['run', 'running', 'trailrun', 'virtualrun'].includes(
    type.replace(/[\s_-]/g, '').toLowerCase()
  );

export const isHiking = (type: string): boolean =>
  ['hike', 'hiking'].includes(type.replace(/[\s_-]/g, '').toLowerCase());

export const isCycling = (type: string): boolean =>
  [
    'ride',
    'virtualride',
    'mountainbikeride',
    'gravelride',
    'ebikeride',
    'emountainbikeride',
  ].includes(type.replace(/[\s_-]/g, '').toLowerCase());

export function orderActivityTypes(types: string[]): string[] {
  const preferred = ['Run', 'Ride', 'Trail Run', 'TrailRun', 'Hike', 'Workout'];
  const unique = [...new Set(types)];
  return [
    ...preferred.filter((type) => unique.includes(type)),
    ...unique.filter((type) => !preferred.includes(type)),
  ];
}

const ACTIVITY_LABELS: Record<string, [string, string]> = {
  run: ['跑步', 'Run'],
  running: ['跑步', 'Run'],
  trailrun: ['越野跑', 'Trail Run'],
  virtualrun: ['虚拟跑步', 'Virtual Run'],
  ride: ['骑行', 'Ride'],
  virtualride: ['虚拟骑行', 'Virtual Ride'],
  indoorride: ['室内骑行', 'Indoor Ride'],
  mountainbikeride: ['山地骑行', 'Mountain Bike Ride'],
  gravelride: ['砾石骑行', 'Gravel Ride'],
  ebikeride: ['电助力骑行', 'E-Bike Ride'],
  emountainbikeride: ['电助力山地骑行', 'E-Mountain Bike Ride'],
  hike: ['徒步', 'Hike'],
  hiking: ['徒步', 'Hike'],
  walk: ['步行', 'Walk'],
  swim: ['游泳', 'Swim'],
  rowing: ['划船', 'Rowing'],
  kayaking: ['皮划艇', 'Kayaking'],
  snowboard: ['单板滑雪', 'Snowboard'],
  ski: ['双板滑雪', 'Ski'],
  workout: ['训练', 'Workout'],
  training: ['训练', 'Training'],
  weighttraining: ['力量训练', 'Weight Training'],
  stairstepper: ['楼梯机', 'Stair Stepper'],
  watersport: ['水上运动', 'Water Sport'],
  flight: ['飞行', 'Flight'],
  roadtrip: ['自驾', 'Road Trip'],
  train: ['铁路', 'Train'],
};

export function activityTypeLabel(type: string, locale: Locale): string {
  return (
    ACTIVITY_LABELS[normalizedType(type)]?.[locale === 'zh' ? 0 : 1] ?? type
  );
}
