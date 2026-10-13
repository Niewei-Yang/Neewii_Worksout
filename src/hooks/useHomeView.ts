import { useEffect } from 'react';

export type HomeView = 'classic' | 'dashboard';
const STORAGE_KEY = 'workouts-home-view';

export const getHomeView = (): HomeView => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dashboard'
      ? 'dashboard'
      : 'classic';
  } catch {
    return 'classic';
  }
};

export const useHomeView = (view: HomeView) => {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // Both explicit page URLs remain usable when storage is unavailable.
    }
  }, [view]);
};
