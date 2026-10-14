export const isRunning = (type: string): boolean =>
  ['run', 'running', 'trailrun', 'virtualrun'].includes(
    type.replace(/[\s_-]/g, '').toLowerCase()
  );

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
  const preferred = ['Run', 'Ride', 'Hike', 'Workout'];
  const unique = [...new Set(types)];
  return [
    ...preferred.filter((type) => unique.includes(type)),
    ...unique.filter((type) => !preferred.includes(type)),
  ];
}
