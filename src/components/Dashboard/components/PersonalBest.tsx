import { memo, useState } from 'react';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import { cyclingPowerBests, personalBests } from '../utils/personalBests';
import { isCycling, isRunning } from '../utils/activityTypes';

interface PersonalBestProps {
  activities: Activity[];
  onSelectActivity?: (a: Activity | null) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const PersonalBest = memo(function PersonalBest({
  activities,
  onSelectActivity,
}: PersonalBestProps) {
  const { locale } = useLocale();
  const [page, setPage] = useState<'run' | 'cycling'>('run');
  const isRun = page === 'run';
  const turnPage = () =>
    setPage((current) => (current === 'run' ? 'cycling' : 'run'));

  const runs = activities.filter(
    (a) => a.source === 'strava' && isRunning(a.type) && a.distance >= 400
  );
  const pending = isRun
    ? runs.filter((a) => a.best_efforts == null || a.best_efforts_version !== 2)
        .length
    : activities.filter(
        (a) =>
          a.source === 'strava' && isCycling(a.type) && a.power_efforts == null
      ).length;

  const labels: Record<string, string> =
    locale === 'zh'
      ? {
          '400m': '400米',
          '1K': '1公里',
          '5K': '5公里',
          '10K': '10公里',
          'Half Marathon': '半程马拉松',
          Marathon: '全程马拉松',
        }
      : {
          '400m': '400m',
          '1K': '1K',
          '5K': '5K',
          '10K': '10K',
          'Half Marathon': 'Half Marathon',
          Marathon: 'Marathon',
        };

  const records = isRun
    ? personalBests(activities).map(({ key, activity, time }) => ({
        key,
        activity,
        label: labels[key],
        result: formatTime(time),
      }))
    : cyclingPowerBests(activities).map(({ duration, activity, watts }) => ({
        key: String(duration),
        activity,
        label:
          locale === 'zh'
            ? duration === 5
              ? '5秒'
              : duration === 3600
                ? '1小时'
                : `${duration / 60}分钟`
            : duration === 5
              ? '5s'
              : duration === 3600
                ? '1h'
                : `${duration / 60}min`,
        result: `${Math.round(watts)} W`,
      }));

  return (
    <div className="hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:shadow-[var(--color-accent)]/5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 hover:shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <svg
            className="h-4 w-4 text-[var(--color-accent)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          {locale === 'zh' ? '个人最佳' : 'Personal Best'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={turnPage}
            aria-label={
              locale === 'zh' ? '上一页最佳成绩' : 'Previous records page'
            }
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-[var(--color-muted)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            ‹
          </button>
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-[var(--color-muted)]"
          >
            {isRun
              ? locale === 'zh'
                ? '跑步 1/2'
                : 'Running 1/2'
              : locale === 'zh'
                ? '骑行功率 2/2'
                : 'Cycling power 2/2'}
          </span>
          <button
            type="button"
            onClick={turnPage}
            aria-label={
              locale === 'zh' ? '下一页最佳成绩' : 'Next records page'
            }
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-[var(--color-muted)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            ›
          </button>
        </div>
      </div>
      <p className="mb-2 text-[10px] text-[var(--color-muted)]">
        {isRun
          ? locale === 'zh'
            ? 'Strava 官方最佳分段 · 含停顿的总耗时'
            : 'Official Strava efforts · elapsed time'
          : locale === 'zh'
            ? 'Strava 实测功率计算 · 区间最佳平均功率'
            : 'Calculated from measured Strava power · best interval average'}
        {pending > 0 &&
          (locale === 'zh'
            ? ` · ${pending} 次待同步`
            : ` · ${pending} pending`)}
      </p>

      <div className="divide-y divide-[var(--color-border)]">
        {records.map(({ key, activity, label, result }) => (
          <button
            type="button"
            disabled={!activity || !onSelectActivity}
            key={key}
            title={
              activity
                ? `${activity.start_date_local.slice(0, 10)} · ${activity.name}`
                : locale === 'zh'
                  ? isRun
                    ? '暂无 Strava 标准距离成绩'
                    : '暂无该时长的连续实测功率'
                  : isRun
                    ? 'No official Strava effort'
                    : 'No continuous measured power for this duration'
            }
            className={`flex w-full items-center justify-between gap-3 py-2 text-left ${
              activity
                ? '-mx-2 cursor-pointer rounded-lg px-2 transition-colors hover:bg-[var(--color-bg)]'
                : ''
            }`}
            onClick={() => activity && onSelectActivity?.(activity)}
          >
            <span className="text-xs text-[var(--color-text)]">{label}</span>
            <span
              className={`font-mono text-xs font-bold ${activity ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            >
              {activity ? result : '--'}
            </span>
          </button>
        ))}
      </div>
      {!isRun && !records.some((record) => record.activity) && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {locale === 'zh'
            ? '需要功率计或智能骑行台记录的功率数据。'
            : 'Requires power recorded by a power meter or smart trainer.'}
        </p>
      )}
    </div>
  );
});
