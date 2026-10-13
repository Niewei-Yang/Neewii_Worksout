import metadata from '@/static/site-metadata';

// Initial targets follow running_page's defaults. Customize them here.
export const DEFAULT_GOAL = {
  yearly: 2000,
  monthly: 150,
  weekly: 35,
  unit: 'distance' as const,
};
export const GOALS: Record<
  string,
  { yearly: number; monthly: number; weekly: number; unit: 'distance' | 'time' }
> = {
  all: DEFAULT_GOAL,
  Run: DEFAULT_GOAL,
  Workout: { yearly: 6000, monthly: 500, weekly: 120, unit: 'time' },
};
export const AVATAR = metadata.logo;
