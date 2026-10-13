import { lazy, Suspense, useMemo, useRef } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Analytics } from '@vercel/analytics/react';
import useActivities from '@/hooks/useActivities';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import { useHomeView } from '@/hooks/useHomeView';
import { useTheme } from '@/hooks/useTheme';
import { isActivityExcludedFromTotals, type Activity } from '@/utils/utils';
import HomeViewSwitch from '@/components/HomeViewSwitch';
import {
  LocaleProvider,
  useLocale,
} from '@/components/Dashboard/hooks/useLocale';
import { extractProvince } from '@/components/Dashboard/hooks/useActivities';
import { StatsCards } from '@/components/Dashboard/components/StatsCards';
import { ContributionHeatmap } from '@/components/Dashboard/components/ContributionHeatmap';
import { ActivityLog } from '@/components/Dashboard/components/ActivityLog';
import { ProfileCard } from '@/components/Dashboard/components/ProfileCard';
import { ChinaMap } from '@/components/Dashboard/components/ChinaMap';
import { RouteMap } from '@/components/Dashboard/components/RouteMap';
import { CalendarWidget } from '@/components/Dashboard/components/CalendarWidget';
import { PersonalBest } from '@/components/Dashboard/components/PersonalBest';
import { isRunning } from '@/components/Dashboard/utils/activityTypes';
import '@/components/Dashboard/index.css';

const TracksPage = lazy(() =>
  import('@/components/Dashboard/components/TracksPage').then((module) => ({
    default: module.TracksPage,
  }))
);
const SummaryPage = lazy(() =>
  import('@/components/Dashboard/components/SummaryPage').then((module) => ({
    default: module.SummaryPage,
  }))
);
const TYPE_LABELS: Record<string, string> = {
  Run: '跑步',
  Ride: '骑行',
  Hike: '徒步',
  Workout: '训练',
  Flight: '飞行',
  RoadTrip: '自驾',
  Train: '铁路',
};

const DashboardContent = () => {
  useHomeView('dashboard');
  const { activities, years, thisYear } = useActivities();
  const { siteTitle, description, keywords } = useSiteMetadata();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeSection = useRef<HTMLDivElement>(null);
  const types = useMemo(
    () => [...new Set(activities.map((a) => a.type))],
    [activities]
  );
  const filter = types.includes(params.get('type') || '')
    ? params.get('type')!
    : 'all';
  const year = years.includes(params.get('year') || '')
    ? Number(params.get('year'))
    : null;
  const selectedId = /^#run_\d+$/.test(location.hash)
    ? Number(location.hash.slice(5))
    : null;
  const selected = activities.find((a) => a.run_id === selectedId) || null;
  const province = params.get('province');
  const page = location.pathname.endsWith('/summary')
    ? 'summary'
    : params.get('page') === 'tracks'
      ? 'tracks'
      : 'home';
  const filtered = useMemo(
    () =>
      activities.filter(
        (a) =>
          (filter === 'all' || a.type === filter) &&
          (year === null || a.start_date_local.startsWith(String(year)))
      ),
    [activities, filter, year]
  );
  const exercise = useMemo(
    () => filtered.filter((a) => !isActivityExcludedFromTotals(a.type)),
    [filtered]
  );
  const allExercise = useMemo(
    () => activities.filter((a) => !isActivityExcludedFromTotals(a.type)),
    [activities]
  );
  const running = useMemo(
    () => activities.filter((a) => isRunning(a.type)),
    [activities]
  );
  const provinceFiltered = useMemo(
    () =>
      province
        ? filtered.filter(
            (a) => extractProvince(a.location_country) === province
          )
        : filtered,
    [filtered, province]
  );
  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value == null ? next.delete(key) : next.set(key, value)
    );
    navigate({ pathname: '/dashboard', search: next.toString(), hash: '' });
  };
  const selectActivity = (activity: Activity | null) => {
    const next = new URLSearchParams(params);
    if (activity) {
      if (page === 'summary') next.delete('page');
      next.delete('province');
      if (year !== null && !activity.start_date_local.startsWith(String(year)))
        next.set('year', activity.start_date_local.slice(0, 4));
      if (filter !== 'all' && activity.type !== filter) next.delete('type');
    }
    navigate({
      pathname: '/dashboard',
      search: next.toString(),
      hash: activity ? `#run_${activity.run_id}` : '',
    });
    if (
      activity &&
      page === 'home' &&
      window.matchMedia('(max-width: 1023px)').matches
    ) {
      requestAnimationFrame(() =>
        routeSection.current?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
        })
      );
    }
  };
  return (
    <div className={`running-dashboard ${theme === 'dark' ? 'dark' : ''}`}>
      <Helmet>
        <html lang={locale === 'zh' ? 'zh-CN' : 'en'} data-theme={theme} />
        <title>{siteTitle} · 新版</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
      </Helmet>
      <header className="bg-[var(--color-bg)]/70 sticky top-0 z-50 border-b border-[var(--color-border)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/dashboard" className="text-xl font-bold">
            NEEWII<span className="text-[var(--color-run)]">.</span>PAGE
          </Link>
          <nav
            className="flex flex-wrap items-center gap-3 sm:gap-6"
            aria-label="主导航"
          >
            <button
              type="button"
              className={
                page === 'home'
                  ? 'text-sm font-medium text-[var(--color-accent)]'
                  : 'text-sm text-[var(--color-muted)]'
              }
              onClick={() => update({ page: null })}
            >
              {t('home')}
            </button>
            <button
              type="button"
              className={
                page === 'tracks'
                  ? 'text-sm font-medium text-[var(--color-accent)]'
                  : 'text-sm text-[var(--color-muted)]'
              }
              onClick={() => update({ page: 'tracks' })}
            >
              {t('tracks')}
            </button>
            <Link
              to="/dashboard/summary"
              aria-current={page === 'summary' ? 'page' : undefined}
              className={
                page === 'summary'
                  ? 'text-sm font-medium text-[var(--color-accent)]'
                  : 'text-sm text-[var(--color-muted)]'
              }
            >
              Summary
            </Link>
            <HomeViewSwitch />
            <button
              type="button"
              aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
              className="text-[var(--color-muted)]"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
            <button
              type="button"
              className="text-xs text-[var(--color-muted)]"
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            >
              {locale === 'zh' ? 'EN' : '中'}
            </button>
            <a
              href="https://github.com/Niewei-Yang/Neewii_Worksout"
              aria-label="GitHub"
              className="text-sm text-[var(--color-muted)]"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>
      <Suspense
        fallback={
          <div role="status" className="p-6">
            {t('loading')}
          </div>
        }
      >
        {page === 'summary' ? (
          <SummaryPage
            activities={allExercise}
            onSelectActivity={selectActivity}
          />
        ) : page === 'tracks' ? (
          <TracksPage
            activities={filtered}
            selectedActivity={selected}
            dark={theme === 'dark'}
            filter={filter}
            onSelectActivity={selectActivity}
            onBack={() => update({ page: null })}
          />
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
              <div className="min-w-0 space-y-6 overflow-hidden">
                <StatsCards
                  activities={exercise}
                  allActivities={running}
                  year={year}
                  filter="Run"
                  onSelectActivity={selectActivity}
                />
                <ContributionHeatmap
                  activities={exercise}
                  year={year ?? Number(thisYear || new Date().getFullYear())}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="活动类型"
                >
                  {['all', ...types].map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={filter === type}
                      onClick={() =>
                        update({
                          type: type === 'all' ? null : type,
                          province: null,
                        })
                      }
                      className={`rounded-full px-3 py-1 text-xs ${filter === type ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-border)] text-[var(--color-muted)]'}`}
                    >
                      {type === 'all'
                        ? t('all')
                        : locale === 'zh'
                          ? TYPE_LABELS[type] || type
                          : type}
                    </button>
                  ))}
                </div>
                <ActivityLog
                  activities={filtered}
                  years={years.map(Number)}
                  year={year}
                  setYear={(value) =>
                    update({
                      year: value === null ? null : String(value),
                      province: null,
                    })
                  }
                  selectedActivity={selected}
                  onSelectActivity={selectActivity}
                  filter={filter}
                />
                <p className="text-xs text-[var(--color-muted)]">
                  {locale === 'zh'
                    ? '热力图和运动汇总不含自驾、飞行和铁路。年 / 月 / 周目标仅统计跑步类活动；目标为可配置的初始参考值。'
                    : 'Heatmaps and exercise totals exclude transport. Year/month/week goals count running activities only. Targets are configurable defaults.'}
                </p>
              </div>
              <aside className="flex min-w-0 flex-col gap-6 overflow-hidden">
                <ProfileCard activities={allExercise} filter={filter} />
                <ChinaMap
                  activities={filtered}
                  filter={filter}
                  selectedProvince={province}
                  onSelectProvince={(value) => update({ province: value })}
                />
                <div ref={routeSection} className="scroll-mt-28">
                  <RouteMap
                    activities={provinceFiltered}
                    selectedActivity={selected}
                    onClearSelection={() => selectActivity(null)}
                  />
                </div>
                <PersonalBest
                  activities={allExercise}
                  onSelectActivity={selectActivity}
                />
                <CalendarWidget
                  key={`${year ?? 'all'}-${filter}`}
                  activities={filtered}
                  selectedActivity={selected}
                  onSelectActivity={selectActivity}
                />
              </aside>
            </div>
          </main>
        )}
      </Suspense>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
        Neewii ·{' '}
        <a href="https://github.com/yihong0618/running_page">
          running_page 3.0
        </a>
      </footer>
      {import.meta.env.VERCEL && <Analytics />}
    </div>
  );
};
export default function Dashboard() {
  return (
    <LocaleProvider>
      <DashboardContent />
    </LocaleProvider>
  );
}
