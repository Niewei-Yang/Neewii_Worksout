import { useEffect, useMemo, useState } from 'react';
import { WebMercatorViewport } from '@math.gl/web-mercator';
import RunMap from '@/components/RunMap';
import {
  geoJsonForRuns,
  sortDateFunc,
  type Activity,
  type IViewState,
} from '@/utils/utils';
import { useThemeChangeCounter } from '@/hooks/useTheme';
import { useLocale } from '../hooks/useLocale';

export function RouteMap({
  activities,
  selectedActivity,
  onClearSelection,
}: {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}) {
  const { locale } = useLocale();
  const counter = useThemeChangeCounter();
  const data = useMemo(() => {
    const geo = geoJsonForRuns(
      selectedActivity ? [selectedActivity] : [...activities].sort(sortDateFunc)
    );
    return {
      ...geo,
      features: geo.features.filter((f) => f.geometry.coordinates.length >= 2),
    };
  }, [activities, selectedActivity, counter]);
  const bounds = useMemo(() => {
    // Keep all tracks visible, but frame the latest activity with usable GPS.
    const points = data.features[0]?.geometry.coordinates || [];
    if (!points.length) return { longitude: 104, latitude: 30, zoom: 2 };
    let west = Infinity,
      east = -Infinity,
      south = Infinity,
      north = -Infinity;
    points.forEach(([longitude, latitude]) => {
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
    });
    const view = new WebMercatorViewport({ width: 360, height: 320 }).fitBounds(
      [
        [west, Math.max(-85, south)],
        [east, Math.min(85, north)],
      ],
      { padding: 45, maxZoom: 14 }
    );
    return {
      longitude: view.longitude,
      latitude: view.latitude,
      zoom: Math.max(0.5, view.zoom),
    };
  }, [data]);
  const [viewState, setViewState] = useState<IViewState>(bounds);
  useEffect(() => setViewState(bounds), [bounds]);
  return (
    <section
      aria-label={locale === 'zh' ? '路线地图' : 'Route map'}
      className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex items-center justify-between p-5">
        <h2 className="text-lg font-bold">
          {locale === 'zh' ? '路线地图' : 'Route map'}
        </h2>
        {selectedActivity ? (
          <button
            type="button"
            className="text-xs text-[var(--color-muted)]"
            onClick={onClearSelection}
          >
            {locale === 'zh' ? '清除选择 ×' : 'Clear ×'}
          </button>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">
            {data.features.length} {locale === 'zh' ? '条轨迹' : 'routes'}
          </span>
        )}
      </div>
      <RunMap
        geoData={data}
        viewState={viewState}
        setViewState={setViewState}
        title={selectedActivity?.name || ''}
        thisYear="Total"
        changeYear={() => {}}
        showYearSelector={false}
        height={320}
      />
      <div className="px-5 py-3 text-xs text-[var(--color-muted)]">
        {selectedActivity
          ? `${selectedActivity.name} · ${selectedActivity.start_date_local.slice(0, 10)}${!data.features.length ? (locale === 'zh' ? ' · 暂无轨迹' : ' · No route') : ''}`
          : locale === 'zh'
            ? '点击活动记录查看路线'
            : 'Select an activity to view its route'}
      </div>
    </section>
  );
}
