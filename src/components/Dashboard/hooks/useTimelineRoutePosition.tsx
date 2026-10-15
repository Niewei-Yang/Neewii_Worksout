import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';

export interface TimelineRoutePosition {
  activityId: number;
  time: number;
  coordinate: [number, number];
}
const PositionContext = createContext<TimelineRoutePosition | null>(null);
const UpdateContext = createContext<
  Dispatch<SetStateAction<TimelineRoutePosition | null>>
>(() => {});

export function TimelineRouteProvider({ children }: { children: ReactNode }) {
  const [position, update] = useState<TimelineRoutePosition | null>(null);
  return (
    <UpdateContext.Provider value={update}>
      <PositionContext.Provider value={position}>
        {children}
      </PositionContext.Provider>
    </UpdateContext.Provider>
  );
}
export const useTimelineRoutePosition = () => useContext(PositionContext);
export const useUpdateTimelineRoutePosition = () => useContext(UpdateContext);
