import { useId, useMemo } from 'react';
import { useLocale } from '../hooks/useLocale';
import {
  useTimelineCursor,
  type TimelineCursorProps,
} from '../hooks/useTimelineCursor';
import {
  elevationAtTime,
  elevationPoints,
  elapsedLabel,
  CLIMB_GRADES,
  climbSpans,
  type ElevationPoint,
  type PaceRun,
} from '../utils/paceTimeline';

export function ElevationTimeline({
  run,
  points,
  ...controlled
}: { run: PaceRun; points?: ElevationPoint[] } & TimelineCursorProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const clip = useId().replace(/:/g, '');
  const climbs = useMemo(
    () => climbSpans(run.climbs || [], run.elapsed_time),
    [run]
  );
  const { cursor, ...interaction } = useTimelineCursor(
    run.elapsed_time,
    controlled
  );
  const profile = useMemo(
    () => points ?? elevationPoints(run.elevation_bins || [], run.elapsed_time),
    [points, run]
  );
  const area = useMemo(() => {
    if (!profile.length) return '';
    const values = profile.map((point) => point[1]);
    const min = Math.min(...values),
      max = Math.max(...values);
    const contour = profile
      .map(
        ([time, value]) =>
          `L${((time / run.elapsed_time) * 1000).toFixed(2)},${(36 - ((value - min) / (max - min || 1)) * 36).toFixed(2)}`
      )
      .join(' ');
    return `M0,40 ${contour} L1000,40 Z`;
  }, [profile, run.elapsed_time]);
  const value = elevationAtTime(profile, cursor);
  const text =
    cursor == null
      ? ''
      : `${elapsedLabel(cursor)} · ${value == null ? '—' : `${Math.round(value)} m`}`;
  if (!area) return null;

  return (
    <div className="mt-3 min-w-0" data-elevation-activity={run.id}>
      <div className="mb-1.5 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-muted)]">
        <span>{zh ? '海拔 · m' : 'Elevation · m'}</span>
        {!!climbs.length && (
          <span
            className="inline-flex flex-wrap gap-2"
            title={
              zh
                ? 'Strava 爬坡等级 · 重叠路段显示较难等级'
                : 'Strava climb categories · hardest overlapping climb shown'
            }
          >
            {CLIMB_GRADES.map((grade) => (
              <span
                key={grade.category}
                className="inline-flex items-center gap-1"
              >
                <span
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: grade.color }}
                />
                {grade.label}
                {zh && grade.label !== 'HC' ? '级' : ''}
              </span>
            ))}
          </span>
        )}
      </div>
      <svg
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        className="block h-10 w-full cursor-crosshair rounded-sm"
        style={{ touchAction: 'pan-y' }}
        role="slider"
        tabIndex={0}
        aria-label={zh ? '随时间变化的海拔' : 'Elevation over elapsed time'}
        aria-valuemin={0}
        aria-valuemax={run.elapsed_time}
        aria-valuenow={Math.round(cursor ?? 0)}
        aria-valuetext={text || elapsedLabel(0)}
        {...interaction}
      >
        <path d={area} fill="#57b99c" />
        {!!climbs.length && (
          <>
            <defs>
              <clipPath id={clip}>
                <path d={area} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clip})`}>
              {climbs.map((climb, index) => (
                <rect
                  key={`${climb.segment_id}-${climb.start}-${index}`}
                  data-climb-category={climb.category}
                  x={(climb.start / run.elapsed_time) * 1000}
                  y="0"
                  width={((climb.end - climb.start) / run.elapsed_time) * 1000}
                  height="40"
                  fill={
                    CLIMB_GRADES.find(
                      (grade) => grade.category === climb.category
                    )!.color
                  }
                >
                  <title>{`${climb.category === 5 ? 'HC' : `${5 - climb.category}${zh ? '级' : ''}`} · ${climb.name}`}</title>
                </rect>
              ))}
            </g>
          </>
        )}
        {cursor != null && (
          <line
            x1={(cursor / run.elapsed_time) * 1000}
            x2={(cursor / run.elapsed_time) * 1000}
            y1="0"
            y2="40"
            stroke="var(--color-text)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
