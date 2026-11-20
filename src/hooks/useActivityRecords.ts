import { createContext, useContext } from 'react';
import type { Activity } from '@/utils/utils';

export const ActivityRecords = createContext<Activity[] | null>(null);

export function useActivityRecords() {
  const records = useContext(ActivityRecords);
  if (!records) throw new Error('Missing activity records');
  return records;
}
