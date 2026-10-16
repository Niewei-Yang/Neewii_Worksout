import { useId } from 'react';
import {
  useTimelineCursor,
  type TimelineCursorProps,
} from '../hooks/useTimelineCursor';
import { useLocale } from '../hooks/useLocale';
import {
  BAND_COLORS,
  PACE_BANDS,
  POWER_BANDS,
  HEART_RATE_BANDS,
  RIDE_PACE_BANDS,
  binAtTime,
  elapsedLabel,
  paceBand,
  type PaceRun,
} from '../utils/paceTimeline';

export function PaceTimeline({
  run,
  elevationValue,
  speedValue,
  heartRateValue,
  showReadout = true,
  showAxis = true,
  ...controlled
}: {
  run: PaceRun;
  elevationValue?: number | null;
  speedValue?: number | null;
  heartRateValue?: number | null;
  showReadout?: boolean;
  showAxis?: boolean;
} & TimelineCursorProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const pattern = useId().replace(/:/g, '');
  const { cursor, ...interaction } = useTimelineCursor(
    run.elapsed_time,
    controlled
  );
  const selected = cursor == null ? undefined : binAtTime(run.bins, cursor);
  const power = run.metric === 'power';
  const heartRate = run.metric === 'heartrate';
  const speed = run.sport_group === 'ride' && !power && !heartRate;
  const bands = heartRate
    ? HEART_RATE_BANDS
    : power
      ? POWER_BANDS
      : run.sport_group === 'ride'
        ? RIDE_PACE_BANDS
        : PACE_BANDS;
  const bandFor = (bin: (typeof run.bins)[number]) =>
    paceBand(bin, run.metric, run.sport_group);
  const metricLabel = heartRate
    ? zh
      ? '心率 · bpm'
      : 'Heart rate · bpm'
    : power
      ? run.device_watts === false
        ? zh
          ? '估算功率 · W'
          : 'Estimated power · W'
        : zh
          ? '功率 · W'
          : 'Power · W'
      : speed
        ? zh
          ? '速度 · km/h'
          : 'Speed · km/h'
        : zh
          ? '配速 · min/km'
          : 'Pace · min/km';
  const labels = [
    ...bands.map((b, index) =>
      speed
        ? `${index === 0 ? `≤${3600 / b.min}` : index === bands.length - 1 ? `>${3600 / bands[index - 1].min}` : `${3600 / bands[index - 1].min}–${3600 / b.min}`} km/h`
        : `${b.label} ${heartRate ? 'bpm' : power ? 'W' : '/km'}`
    ),
    zh ? '暂停／静止' : 'Paused / stationary',
    zh ? '数据缺失' : 'Missing data',
  ];
  const selectedText = selected
    ? `${elapsedLabel(cursor!)} · ${selected[2] != null && bandFor(selected) !== 8 ? (heartRate ? `${Math.round(selected[2])} bpm` : power ? `${Math.round(selected[2])} W` : speed ? `${(3600 / selected[2]).toFixed(1)} km/h` : `${elapsedLabel(selected[2])} /km`) : '—'}${speedValue === undefined ? '' : ` · ${speedValue == null ? '—' : speedValue.toFixed(1)} km/h`}${heartRateValue === undefined ? '' : ` · ${heartRateValue == null ? '—' : Math.round(heartRateValue)} bpm`}${elevationValue === undefined ? '' : ` · ${elevationValue == null ? '—' : `${Math.round(elevationValue)} m`}`}`
    : '';

  if (!run.bins.length)
    return (
      <p className="py-3 text-sm text-[var(--color-muted)]">
        {zh
          ? '这次活动没有可用的时间序列。'
          : 'No stream is available for this activity.'}
      </p>
    );

  return (
    <div className="min-w-0" data-pace-activity={run.id}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-[var(--color-muted)]">
        <span
          title={
            heartRate
              ? zh
                ? '固定心率范围，非个人训练区间 · 约 10 秒平均 · 斜纹为缺失'
                : 'Fixed BPM bands, not personalized training zones · ~10 s averages · hatched: missing'
              : zh
                ? `${power ? '固定功率范围，非 FTP 区间' : speed ? '固定速度范围' : '固定配速范围'} · 约 10 秒平均 · 灰色为暂停，斜纹为缺失`
                : `${power ? 'Absolute power bands, not FTP zones' : speed ? 'Fixed speed bands' : 'Fixed pace bands'} · ~10 s averages · grey: paused, hatched: missing`
          }
        >
          {metricLabel}
        </span>
        {showReadout && <span aria-live="polite">{selectedText}</span>}
      </div>
      <svg
        viewBox="0 0 1000 32"
        preserveAspectRatio="none"
        className="block h-4 w-full cursor-crosshair rounded-sm"
        style={{ touchAction: 'pan-y' }}
        role="slider"
        aria-label={
          heartRate
            ? zh
              ? '随时间变化的心率区间'
              : 'Heart rate bands over elapsed time'
            : power
              ? zh
                ? '随时间变化的功率区间'
                : 'Power bands over elapsed time'
              : speed
                ? zh
                  ? '随时间变化的速度区间'
                  : 'Speed bands over elapsed time'
                : zh
                  ? '随时间变化的配速区间'
                  : 'Pace bands over elapsed time'
        }
        aria-valuemin={0}
        aria-valuemax={run.elapsed_time}
        aria-valuenow={Math.round(cursor ?? 0)}
        aria-valuetext={selected ? selectedText : elapsedLabel(0)}
        tabIndex={0}
        {...interaction}
      >
        <defs>
          <pattern
            id={pattern}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="8" height="8" fill={BAND_COLORS[8]} />
            <path d="M0 8L8 0" stroke="#7b8493" strokeWidth="2" />
          </pattern>
        </defs>
        {run.bins.map((bin) => (
          <rect
            key={bin[0]}
            x={(bin[0] / run.elapsed_time) * 1000}
            y="0"
            width={((bin[1] - bin[0]) / run.elapsed_time) * 1000}
            height="32"
            shapeRendering="crispEdges"
            fill={
              bandFor(bin) === 8
                ? `url(#${pattern})`
                : BAND_COLORS[bandFor(bin)]
            }
          >
            <title>{`${elapsedLabel(bin[0])}–${elapsedLabel(bin[1])}: ${labels[bandFor(bin)]}`}</title>
          </rect>
        ))}
        {cursor != null && (
          <line
            x1={(cursor / run.elapsed_time) * 1000}
            x2={(cursor / run.elapsed_time) * 1000}
            y1="0"
            y2="32"
            stroke="var(--color-text)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {showAxis && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--color-muted)]">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <span key={fraction}>
              {elapsedLabel(run.elapsed_time * fraction)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
