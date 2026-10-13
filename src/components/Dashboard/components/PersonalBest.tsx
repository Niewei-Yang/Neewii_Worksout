import { memo } from 'react';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import { personalBests } from '../utils/personalBests';
import { isRunning } from '../utils/activityTypes';

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

  const runs = activities.filter(
    (a) => a.source === 'strava' && isRunning(a.type) && a.distance >= 5000
  );
  const pending = runs.filter((a) => a.best_efforts == null).length;

  const labels: Record<string, string> =
    locale === 'zh'
      ? {
          '5K': '5公里',
          '10K': '10公里',
          'Half Marathon': '半程马拉松',
          Marathon: '全程马拉松',
        }
      : {
          '5K': '5K',
          '10K': '10K',
          'Half Marathon': 'Half Marathon',
          Marathon: 'Marathon',
        };

  const bests = personalBests(activities);

  return (
    <div className="hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:shadow-[var(--color-accent)]/5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 hover:shadow-lg">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
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
      <p className="mb-2 text-[10px] text-[var(--color-muted)]">
        {locale === 'zh'
          ? 'Strava 官方最佳分段 · 含停顿的总耗时'
          : 'Official Strava efforts · elapsed time'}
        {pending > 0 &&
          (locale === 'zh'
            ? ` · ${pending} 次待同步`
            : ` · ${pending} pending`)}
      </p>

      <div className="divide-y divide-[var(--color-border)]">
        {bests.map(({ key, activity, time }) => (
          <button
            type="button"
            disabled={!activity || !onSelectActivity}
            key={key}
            title={
              activity
                ? `${activity.start_date_local.slice(0, 10)} · ${activity.name}`
                : locale === 'zh'
                  ? '暂无 Strava 标准距离成绩'
                  : 'No official Strava effort'
            }
            className={`flex w-full items-center justify-between gap-3 py-2 text-left ${
              activity
                ? '-mx-2 cursor-pointer rounded-lg px-2 transition-colors hover:bg-[var(--color-bg)]'
                : ''
            }`}
            onClick={() => activity && onSelectActivity?.(activity)}
          >
            <span className="text-xs text-[var(--color-text)]">
              {labels[key]}
            </span>
            <span
              className={`font-mono text-xs font-bold ${activity ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            >
              {activity ? formatTime(time) : '--'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});
