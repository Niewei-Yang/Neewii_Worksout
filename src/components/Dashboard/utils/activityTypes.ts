export const isRunning = (type: string): boolean =>
  ['run', 'running', 'trailrun', 'virtualrun'].includes(
    type.replace(/[\s_-]/g, '').toLowerCase()
  );
