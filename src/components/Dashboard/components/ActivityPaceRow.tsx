import { useEffect, useMemo, useState } from 'react';
import { useActivityTimeline } from '../hooks/useActivityTimeline';
import { useLocale } from '../hooks/useLocale';
import { PaceTimeline } from './PaceTimeline';
import { ElevationTimeline } from './ElevationTimeline';
import {
  canShowElevation,
  elevationAtTime,
  elevationPoints,
  routePositionAtTime,
  binAtTime,
} from '../utils/paceTimeline';
import type { Activity } from '../types';
import { useUpdateTimelineRoutePosition } from '../hooks/useTimelineRoutePosition';

export function ActivityPaceRow({
  activity,
  columns,
}: {
  activity: Activity;
  columns: number;
}) {
  const { data: run } = useActivityTimeline(activity.run_id);
  const { locale } = useLocale();
  const [cursor, setCursor] = useState<number | null>(null);
  const updatePosition = useUpdateTimelineRoutePosition();
  useEffect(() => () => updatePosition(null), [updatePosition]);
  const updateCursor = (time: number) => {
    setCursor(time);
    const coordinate = routePositionAtTime(run?.route_points || [], time);
    updatePosition(
      coordinate ? { activityId: activity.run_id, time, coordinate } : null
    );
  };
  const showElevation =
    canShowElevation(activity.type, activity.elevation_gain) &&
    !!run?.elevation_bins?.length;
  const profile = useMemo(
    () => elevationPoints(run?.elevation_bins || [], run?.elapsed_time || 0),
    [run]
  );
  const speedRun = useMemo(
    () =>
      run?.metric === 'power' &&
      run.sport_group === 'ride' &&
      run.speed_bins?.length
        ? { ...run, metric: 'pace' as const, bins: run.speed_bins }
        : null,
    [run]
  );
  const selectedSpeed =
    speedRun && cursor != null ? binAtTime(speedRun.bins, cursor)?.[2] : null;
  if (!run || (!run.bins.length && !showElevation)) return null;
  return (
    <tr
      className="border-b border-[var(--color-border)]"
      aria-label={
        locale === 'zh'
          ? `${run.name}的${run.metric === 'power' ? '功率' : run.sport_group === 'ride' ? '速度' : '配速'}条`
          : `${run.metric === 'power' ? 'Power' : run.sport_group === 'ride' ? 'Speed' : 'Pace'} timeline for ${run.name}`
      }
    >
      <td colSpan={columns} className="py-3">
        <div className="pace-inline-strip">
          {!!run.bins.length && (
            <PaceTimeline
              key={run.id}
              run={run}
              cursor={cursor}
              onCursorChange={updateCursor}
              speedValue={
                speedRun
                  ? selectedSpeed != null && selectedSpeed > 0
                    ? 3600 / selectedSpeed
                    : null
                  : undefined
              }
              showAxis={!speedRun}
              elevationValue={
                showElevation ? elevationAtTime(profile, cursor) : undefined
              }
            />
          )}
          {speedRun && (
            <div className="mt-3">
              <PaceTimeline
                run={speedRun}
                cursor={cursor}
                onCursorChange={updateCursor}
                showReadout={false}
              />
            </div>
          )}
          {showElevation && (
            <ElevationTimeline
              key={`elevation-${run.id}`}
              run={run}
              points={profile}
              cursor={cursor}
              onCursorChange={updateCursor}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
