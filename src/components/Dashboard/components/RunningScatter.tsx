import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import {
  formatScatterPace,
  INITIAL_ROTATION,
  normalizeScatter,
  projectScatter,
  rotateScatter,
  runningSequenceColor,
  runningPoints,
  scatterDomain,
  type Point3D,
} from '../utils/runningScatter';

interface RunningScatterProps {
  activities: Activity[];
  selectedActivity?: Activity | null;
  onSelectActivity?: (activity: Activity) => void;
}

const CUBE: Point3D[] = Array.from({ length: 8 }, (_, i) => [
  i & 1 ? 1 : -1,
  i & 2 ? 1 : -1,
  i & 4 ? 1 : -1,
]);
const EDGES = CUBE.flatMap((_, i) =>
  [1, 2, 4].filter((bit) => !(i & bit)).map((bit) => [i, i | bit])
);

export function RunningScatter({
  activities,
  selectedActivity,
  onSelectActivity,
}: RunningScatterProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [rotation, setRotation] = useState(INITIAL_ROTATION);
  const [activeId, setActiveId] = useState<number | null>(null);
  useEffect(() => setActiveId(null), [activities, selectedActivity?.run_id]);
  useEffect(() => {
    if (!fullscreen) return;
    dialogRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      fullscreenButton.current?.focus({ preventScroll: true });
    };
  }, [fullscreen]);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
    rotation: typeof INITIAL_ROTATION;
  } | null>(null);
  const data = useMemo(() => {
    const points = runningPoints(activities).sort(
      (a, b) => a.date - b.date || a.activity.run_id - b.activity.run_id
    );
    const domains = [
      scatterDomain(points.map((p) => p.pace)),
      scatterDomain(points.map((p) => p.distance)),
      scatterDomain(points.map((p) => p.heartRate)),
    ];
    return {
      domains,
      points: points.map((point, index) => ({
        ...point,
        color: runningSequenceColor(index, points.length),
        position: [
          normalizeScatter(point.pace, domains[0]),
          normalizeScatter(point.distance, domains[1]),
          normalizeScatter(point.heartRate, domains[2]),
        ] as Point3D,
      })),
    };
  }, [activities]);
  const projected = useMemo(
    () =>
      data.points
        .map((p) => ({ ...p, screen: projectScatter(p.position, rotation) }))
        .sort((a, b) => a.screen.depth - b.screen.depth),
    [data.points, rotation]
  );
  const active = data.points.find(
    (p) => p.activity.run_id === (activeId ?? selectedActivity?.run_id)
  );
  const axes = [
    { label: zh ? '平均配速 /km' : 'Avg pace /km', format: formatScatterPace },
    {
      label: zh ? '距离 km' : 'Distance km',
      format: (value: number) => value.toFixed(1),
    },
    {
      label: zh ? '平均心率 bpm' : 'Avg HR bpm',
      format: (value: number) => String(Math.round(value)),
    },
  ];
  const line = (from: Point3D, to: Point3D) => {
    const a = projectScatter(from, rotation);
    const b = projectScatter(to, rotation);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  const tilt = (yaw: number, pitch: number) =>
    setRotation((current) => rotateScatter(current, yaw, pitch));

  const chart = (
    <section
      aria-labelledby={titleId}
      className={`running-scatter-card overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] pb-4 ${fullscreen ? 'running-scatter-expanded' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 id={titleId} className="text-lg font-bold">
          {zh ? '跑步三维分析' : 'Running in 3D'}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-muted)]">
            {data.points.length} {zh ? '次跑步' : 'runs'}
          </span>
          <button
            ref={fullscreenButton}
            type="button"
            aria-label={
              fullscreen
                ? zh
                  ? '退出全屏'
                  : 'Exit full screen'
                : zh
                  ? '全屏查看'
                  : 'View full screen'
            }
            title={
              fullscreen
                ? zh
                  ? '退出全屏'
                  : 'Exit full screen'
                : zh
                  ? '全屏查看'
                  : 'View full screen'
            }
            className="rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            onClick={() => setFullscreen((current) => !current)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              className="mx-auto"
            >
              <path
                d={
                  fullscreen
                    ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6'
                    : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'
                }
              />
            </svg>
          </button>
        </div>
      </div>
      {data.points.length ? (
        <>
          <div
            className="mx-5 mt-4"
            role="img"
            aria-label={
              zh
                ? '跑步次数颜色图例，按记录顺序从较早到最近'
                : 'Run sequence colour scale, earlier to latest'
            }
          >
            <div
              className="h-2 rounded-full"
              style={{
                background:
                  data.points.length === 1
                    ? runningSequenceColor(0, 1)
                    : `linear-gradient(to right, ${Array.from({ length: 21 }, (_, index) => runningSequenceColor(index, 21)).join(', ')})`,
              }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-muted)]">
              <span>{zh ? '较早' : 'Earlier'}</span>
              <span>{zh ? '最近' : 'Latest'}</span>
            </div>
          </div>
          <svg
            viewBox="0 0 480 400"
            className="running-scatter block w-full cursor-grab select-none active:cursor-grabbing"
            role="group"
            aria-label={
              zh
                ? '可旋转的跑步三维散点图'
                : 'Rotatable 3D running scatter plot'
            }
            tabIndex={0}
            onKeyDown={(event) => {
              const movement = {
                ArrowLeft: [-0.15, 0],
                ArrowRight: [0.15, 0],
                ArrowUp: [0, 0.1],
                ArrowDown: [0, -0.1],
              }[event.key];
              if (movement) {
                event.preventDefault();
                tilt(movement[0], movement[1]);
              } else if (event.key === 'Home') {
                event.preventDefault();
                setRotation(INITIAL_ROTATION);
              }
            }}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              drag.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                moved: false,
                rotation,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || start.pointerId !== event.pointerId) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if (Math.hypot(dx, dy) < 4 && !start.moved) return;
              start.moved = true;
              setActiveId(null);
              setRotation(rotateScatter(start.rotation, dx * 0.01, dy * 0.01));
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointerId !== event.pointerId) return;
              // Pointer capture sends the release to the SVG; resolve a tap
              // against the frontmost visible point in SVG coordinates.
              if (!drag.current.moved) {
                const matrix = event.currentTarget.getScreenCTM();
                const pointer = matrix
                  ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
                      matrix.inverse()
                    )
                  : null;
                const hit =
                  pointer &&
                  [...projected]
                    .reverse()
                    .find(
                      (p) =>
                        Math.hypot(
                          p.screen.x - pointer.x,
                          p.screen.y - pointer.y
                        ) < 12
                    );
                setActiveId(hit?.activity.run_id ?? null);
              }
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <g stroke="var(--color-border)" fill="none" strokeWidth="1">
              {EDGES.map(([a, b]) => (
                <line key={`${a}-${b}`} {...line(CUBE[a], CUBE[b])} />
              ))}
              {[0, 0.5].flatMap((value) => {
                const t = value * 2 - 1;
                return [
                  <line
                    key={`x-${value}`}
                    {...line([t, -1, -1], [t, 1, -1])}
                    opacity="0.5"
                  />,
                  <line
                    key={`y-${value}`}
                    {...line([-1, t, -1], [1, t, -1])}
                    opacity="0.5"
                  />,
                ];
              })}
            </g>
            {axes.map((axis, i) => {
              const end: Point3D = [-1, -1, -1];
              end[i] = 1;
              const projectedAxis = line([-1, -1, -1], end);
              if (
                Math.hypot(
                  projectedAxis.x2 - projectedAxis.x1,
                  projectedAxis.y2 - projectedAxis.y1
                ) < 1
              )
                return null;
              const label: Point3D = [-1.18, -1.18, -1.18];
              label[i] = 1.25;
              const labelPosition = projectScatter(label, rotation);
              return (
                <g key={axis.label}>
                  <line
                    {...projectedAxis}
                    stroke="var(--color-muted)"
                    strokeWidth="1.5"
                  />
                  {[0, 0.5, 1].map((fraction) => {
                    const position: Point3D = [-1.12, -1.12, -1.12];
                    position[i] = fraction * 2 - 1;
                    const screen = projectScatter(position, rotation);
                    const originOffset = [
                      { x: 18, y: 18 },
                      { x: -18, y: 18 },
                      { x: 0, y: -8 },
                    ][i];
                    return (
                      <text
                        key={fraction}
                        x={screen.x + (fraction === 0 ? originOffset.x : 0)}
                        y={screen.y + (fraction === 0 ? originOffset.y : 5)}
                        textAnchor="middle"
                        fontSize="13"
                        fill="var(--color-muted)"
                      >
                        {axis.format(
                          data.domains[i][0] +
                            fraction * (data.domains[i][1] - data.domains[i][0])
                        )}
                      </text>
                    );
                  })}
                  <text
                    x={Math.max(80, Math.min(400, labelPosition.x))}
                    y={Math.max(
                      16,
                      Math.min(384, labelPosition.y + (i === 2 ? -12 : 24))
                    )}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fill="var(--color-text)"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
            {projected.map((point) => {
              const highlighted =
                point.activity.run_id ===
                (activeId ?? selectedActivity?.run_id);
              const description = `${point.activity.name} · ${point.activity.start_date_local.slice(0, 10)} · ${formatScatterPace(point.pace)} /km · ${Math.round(point.heartRate)} bpm · ${point.distance.toFixed(2)} km`;
              return (
                <circle
                  key={point.activity.run_id}
                  cx={point.screen.x}
                  cy={point.screen.y}
                  r={highlighted ? 7 : 4.5}
                  fill={point.color}
                  fillOpacity={highlighted ? 1 : 0.8}
                  stroke={
                    highlighted ? 'var(--color-text)' : 'var(--color-card)'
                  }
                  strokeWidth={highlighted ? 2 : 0.6}
                  tabIndex={0}
                  role="img"
                  aria-label={description}
                  onPointerEnter={() => {
                    if (!drag.current) setActiveId(point.activity.run_id);
                  }}
                  onFocus={() => setActiveId(point.activity.run_id)}
                >
                  <title>{description}</title>
                </circle>
              );
            })}
          </svg>
          <div className="flex justify-end px-5">
            <button
              type="button"
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
              onClick={() => setRotation(INITIAL_ROTATION)}
            >
              {zh ? '重置视角' : 'Reset view'}
            </button>
          </div>
          <div className="mx-5 mt-3 min-h-20 rounded-lg bg-[var(--color-bg)] p-3 text-xs">
            {active ? (
              <>
                <p className="truncate font-medium">{active.activity.name}</p>
                <p className="mt-1 text-[var(--color-muted)]">
                  {active.activity.start_date_local.slice(0, 16)}
                </p>
                <p className="mt-1 font-mono">
                  {formatScatterPace(active.pace)} /km ·{' '}
                  {Math.round(active.heartRate)} bpm ·{' '}
                  {active.distance.toFixed(2)} km
                </p>
                {onSelectActivity && (
                  <button
                    type="button"
                    className="mt-1 text-[var(--color-accent)]"
                    onClick={() => {
                      setFullscreen(false);
                      onSelectActivity(active.activity);
                    }}
                  >
                    {zh ? '查看活动路线' : 'View activity route'} ↗
                  </button>
                )}
              </>
            ) : (
              <p className="text-[var(--color-muted)]">
                {zh
                  ? '悬停、点按或用 Tab 聚焦数据点，查看日期和运动数据。'
                  : 'Hover, tap or Tab to a dot to see its date and metrics.'}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          {zh
            ? '当前筛选下暂无配速、心率和距离完整的跑步数据。'
            : 'No runs with pace, heart rate and distance in this selection.'}
        </p>
      )}
    </section>
  );
  return fullscreen ? (
    <dialog
      ref={dialogRef}
      className="running-scatter-dialog"
      aria-labelledby={titleId}
      onCancel={() => setFullscreen(false)}
      onClose={() => setFullscreen(false)}
    >
      {chart}
    </dialog>
  ) : (
    chart
  );
}
