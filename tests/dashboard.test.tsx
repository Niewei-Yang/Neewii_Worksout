import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Activity } from '../src/utils/utils';
import {
  cyclingPowerBests,
  personalBests,
} from '../src/components/Dashboard/utils/personalBests';
import { PersonalBest } from '../src/components/Dashboard/components/PersonalBest';
import {
  isRunning,
  orderActivityTypes,
} from '../src/components/Dashboard/utils/activityTypes';
import { StatsCards } from '../src/components/Dashboard/components/StatsCards';
import {
  ContributionHeatmap,
  buildYearGrid,
} from '../src/components/Dashboard/components/ContributionHeatmap';
import { SummaryPage } from '../src/components/Dashboard/components/SummaryPage';
import { ActivityLog } from '../src/components/Dashboard/components/ActivityLog';
import {
  compareActivities,
  type ActivitySortKey,
  type SortDirection,
} from '../src/components/Dashboard/utils/activitySort';
import { formatTemperatureRange } from '../src/utils/utils';
import {
  bandDurations,
  canShowElevation,
  climbSpans,
  CLIMB_GRADES,
  routePositionAtTime,
  elevationPoints,
  elevationAtTime,
  binAtTime,
  paceBand,
  heartRateTimeline,
  type PaceBin,
} from '../src/components/Dashboard/utils/paceTimeline';
import { PaceTimeline } from '../src/components/Dashboard/components/PaceTimeline';
import { ElevationTimeline } from '../src/components/Dashboard/components/ElevationTimeline';
import {
  isTrackWallActivity,
  TRACK_WALL_COLORS,
  trackWallType,
} from '../src/components/Dashboard/utils/trackWall';
import {
  summaryKey,
  summaryChart,
  summarize,
} from '../src/components/Dashboard/utils/summary';

const today = new Date();
test('track wall keeps individual qualifying activities and excludes short rides and transport', () => {
  const route = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
  const activities = [
    { name: '吃个夜市', type: 'Ride', distance: 7174.6 },
    { name: 'Short run', type: 'Run', distance: 4999 },
    { name: '5 km run', type: 'Run', distance: 5000 },
    { name: 'Same route again', type: 'Run', distance: 5000 },
    { name: 'Trail run', type: 'TrailRun', distance: 5000 },
    { name: 'Short ride', type: 'Ride', distance: 19999 },
    { name: '20 km ride', type: 'Ride', distance: 20000 },
    { name: 'Gravel ride', type: 'GravelRide', distance: 20000 },
    { name: 'Short hike', type: 'Hike', distance: 4999 },
    { name: '5 km hike', type: 'Hike', distance: 5000 },
    { name: '10 km hike', type: 'Hike', distance: 10000 },
    ...['Flight', 'Train', 'RoadTrip'].map((type) => ({
      name: type,
      type,
      distance: 100000,
    })),
  ].map((activity) => ({ ...activity, summary_polyline: route }));
  assert.deepEqual(
    activities.filter(isTrackWallActivity).map((activity) => activity.name),
    [
      '5 km run',
      'Same route again',
      'Trail run',
      '20 km ride',
      'Gravel ride',
      '5 km hike',
      '10 km hike',
    ]
  );
  assert.equal(
    isTrackWallActivity({ type: 'Run', distance: 5000, summary_polyline: '' }),
    false
  );
  assert.equal(TRACK_WALL_COLORS[trackWallType('TrailRun')], '#f97316');
  assert.equal(TRACK_WALL_COLORS[trackWallType('GravelRide')], '#3b82f6');
  assert.equal(TRACK_WALL_COLORS[trackWallType('Hike')], '#22c55e');
});

test('running heart rate is conditional, uses BPM and shares the time readout', () => {
  const run = {
    id: 1,
    name: 'Run',
    start_date_local: '',
    distance: 100,
    moving_time: 30,
    elapsed_time: 30,
    sport_group: 'run' as const,
    bins: [[0, 30, 300, 'running']] as PaceBin[],
  };
  assert.equal(heartRateTimeline(run), null);
  assert.equal(
    heartRateTimeline({ ...run, heartrate_bins: [[0, 30, 0, 'running']] }),
    null
  );
  assert.equal(
    heartRateTimeline({ ...run, heartrate_bins: [[0, 30, null, 'unknown']] }),
    null
  );
  const heartrate_bins: PaceBin[] = [
    [0, 20, 155, 'running'],
    [20, 30, null, 'unknown'],
  ];
  assert.equal(
    heartRateTimeline({ ...run, sport_group: 'ride', heartrate_bins }),
    null
  );
  const heart = heartRateTimeline({ ...run, heartrate_bins })!;
  const html = renderToStaticMarkup(
    <PaceTimeline run={heart} cursor={15} showReadout={false} />
  );
  assert.ok(html.includes('心率 · bpm'));
  assert.ok(html.includes('0:15 · 155 bpm'));
  assert.ok(html.includes('150–160 bpm'));
  assert.ok(html.includes('fill="url(#'));
  assert.ok(!html.includes('aria-live'));
  assert.equal(paceBand([0, 10, 100, 'running'], 'heartrate'), 1);
  assert.equal(paceBand([0, 10, 180, 'running'], 'heartrate'), 6);
  assert.equal(paceBand([0, 10, 0, 'running'], 'heartrate'), 8);
  assert.equal(paceBand([0, 10, NaN, 'running'], 'heartrate'), 8);
  const readout = renderToStaticMarkup(
    <PaceTimeline run={run} cursor={15} heartRateValue={155} />
  );
  assert.ok(readout.includes('0:15 · 5:00 /km · 155 bpm'));
  const missing = renderToStaticMarkup(
    <PaceTimeline run={heart} cursor={25} />
  );
  assert.ok(missing.includes('0:25 · —'));
});

test('hiking elevation has its own readout and time axis without pace', () => {
  const html = renderToStaticMarkup(
    <ElevationTimeline
      run={{
        id: 1,
        name: 'Hike',
        start_date_local: '',
        distance: 100,
        moving_time: 60,
        elapsed_time: 60,
        sport_group: 'hike',
        bins: [],
        elevation_bins: [[0, 60, 120, 'running']],
      }}
      cursor={30}
      showReadout
      showAxis
    />
  );
  assert.ok(html.includes('0:30 · 120 m'));
  assert.ok(html.includes('aria-live'));
  assert.ok(html.includes('1:00'));
  assert.ok(!html.includes('min/km'));
});

test('cycling power and speed share one readout in W and km/h', () => {
  const run = {
    id: 1,
    name: 'Ride',
    start_date_local: '',
    distance: 100,
    moving_time: 30,
    elapsed_time: 30,
    metric: 'power' as const,
    sport_group: 'ride' as const,
    bins: [[0, 30, 150, 'running']] as PaceBin[],
  };
  const html = renderToStaticMarkup(
    <PaceTimeline
      run={run}
      cursor={15}
      speedValue={32.5}
      elevationValue={100}
      showAxis={false}
    />
  );
  assert.ok(html.includes('0:15 · 150 W · 32.5 km/h · 100 m'));
  const speed = renderToStaticMarkup(
    <PaceTimeline
      run={{ ...run, metric: 'pace', bins: [[0, 30, 120, 'running']] }}
      cursor={15}
      showReadout={false}
    />
  );
  assert.ok(speed.includes('速度 · km/h'));
  assert.ok(speed.includes('0:15 · 30.0 km/h'));
  assert.ok(!speed.includes('aria-live'));
});
test('map cursor uses timestamped coordinates and does not cross GPS gaps', () => {
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 116, 40],
        [10, 118, 42],
      ],
      5
    ),
    [117, 41]
  );
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 116, 40],
        [60, 118, 42],
      ],
      30
    ),
    [116, 40]
  );
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 116, 40],
        [10, null, null],
      ],
      5
    ),
    [116, 40]
  );
  assert.equal(routePositionAtTime([[10, 116, 40]], 0), null);
  assert.deepEqual(routePositionAtTime([[10, 116, 40]], 10), [116, 40]);
  assert.equal(routePositionAtTime([], 10), null);
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 116, 40],
        [10, null, null],
        [20, null, null],
        [30, 118, 42],
      ],
      20
    ),
    [116, 40]
  );
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 116, 40],
        [10, null, null],
      ],
      100
    ),
    [116, 40]
  );
  assert.equal(
    routePositionAtTime(
      [
        [0, null, null],
        [10, 118, 42],
      ],
      5
    ),
    null
  );
  assert.deepEqual(
    routePositionAtTime(
      [
        [0, 179, 40],
        [10, -179, 40],
      ],
      5
    ),
    [-180, 40]
  );
});
test('official climb classes colour the elevation contour with harder overlaps on top', () => {
  const climbs = [
    { segment_id: 1, name: 'Cat 2 climb', category: 3, start: 10, end: 20 },
    { segment_id: 2, name: 'Cat 4 climb', category: 1, start: -10, end: 40 },
    { segment_id: 3, name: 'Not classified', category: 0, start: 0, end: 30 },
  ];
  const spans = climbSpans(climbs, 30);
  assert.deepEqual(
    spans.map((c) => [c.category, c.start, c.end]),
    [
      [1, 0, 30],
      [3, 10, 20],
    ]
  );
  assert.equal(CLIMB_GRADES.find((c) => c.category === 5)?.label, 'HC');
  const html = renderToStaticMarkup(
    <ElevationTimeline
      run={{
        id: 1,
        name: 'Ride',
        start_date_local: '',
        distance: 100,
        moving_time: 30,
        elapsed_time: 30,
        bins: [],
        elevation_bins: [[0, 30, 100, 'running']],
        climbs,
      }}
    />
  );
  assert.ok(html.includes('<clipPath'));
  assert.ok(
    html.indexOf('data-climb-category="1"') <
      html.indexOf('data-climb-category="3"')
  );
  assert.ok(html.includes('2级 · Cat 2 climb'));
  assert.ok(!html.includes('data-climb-category="0"'));
});
test('altitude gaps connect linearly and the upper strip includes the shared altitude value', () => {
  const bins: PaceBin[] = [
    [0, 10, 0, 'running'],
    [10, 20, null, 'unknown'],
    [20, 30, 200, 'running'],
  ];
  const points = elevationPoints(bins, 30);
  assert.equal(elevationAtTime(points, 15), 100);
  assert.equal(elevationAtTime(points, 0), 0);
  assert.equal(elevationAtTime(points, 30), 200);
  assert.equal(elevationAtTime([], 5), null);
  const run = {
    id: 1,
    name: 'Ride',
    start_date_local: '',
    distance: 100,
    moving_time: 30,
    elapsed_time: 30,
    metric: 'power' as const,
    bins: [[0, 30, 150, 'running']] as PaceBin[],
    elevation_bins: bins,
  };
  const upper = renderToStaticMarkup(
    <PaceTimeline run={run} cursor={15} elevationValue={100} />
  );
  assert.ok(upper.includes('0:15 · 150 W · 100 m'));
  const lower = renderToStaticMarkup(
    <ElevationTimeline run={run} points={points} cursor={15} />
  );
  assert.ok(lower.includes('aria-valuenow="15"'));
  assert.ok(lower.includes('<path'));
  assert.ok(!lower.includes('<pattern'));
  assert.ok(!lower.includes('aria-live'));
});
test('elevation preview requires run/ride/hike and strictly more than 200m gain', () => {
  assert.equal(canShowElevation('Ride', 200), false);
  assert.equal(canShowElevation('Ride', 200.1), true);
  assert.equal(canShowElevation('Trail Run', 201), true);
  assert.equal(canShowElevation('Run', null), false);
  assert.equal(canShowElevation('Hike', 201), true);
  assert.equal(canShowElevation('Hiking', 200), false);
  assert.equal(canShowElevation('Workout', 1000), false);
  const html = renderToStaticMarkup(
    <ElevationTimeline
      run={{
        id: 1,
        name: 'Ride',
        start_date_local: '',
        distance: 100,
        moving_time: 60,
        elapsed_time: 60,
        bins: [],
        elevation_bins: [
          [0, 30, 0, 'running'],
          [30, 60, 100, 'running'],
        ],
      }}
    />
  );
  assert.ok(html.includes('海拔 · m'));
  assert.ok(html.includes('随时间变化的海拔'));
  assert.ok(html.includes('aria-valuemax="60"'));
});
test('pace bands use exact boundaries, preserve pauses and account for every elapsed second', () => {
  const bins: PaceBin[] = [
    [0, 20, 420, 'running'],
    [20, 30, 360, 'running'],
    [30, 35, 239.9, 'running'],
    [35, 45, null, 'paused'],
    [45, 60, null, 'unknown'],
  ];
  assert.deepEqual(
    bins.map((bin) => paceBand(bin)),
    [0, 1, 6, 7, 8]
  );
  assert.deepEqual(bandDurations(bins), [20, 10, 0, 0, 0, 0, 5, 10, 15]);
  assert.equal(binAtTime(bins, 20), bins[1]);
  assert.equal(binAtTime(bins, 60), bins[4]);
  assert.equal(binAtTime(bins, -1), undefined);
  const html = renderToStaticMarkup(
    <PaceTimeline
      run={{
        id: 1,
        name: 'Run',
        start_date_local: '',
        distance: 100,
        moving_time: 35,
        elapsed_time: 60,
        bins,
      }}
    />
  );
  assert.ok(html.includes('role="slider"'));
  assert.ok(html.includes('aria-valuemax="60"'));
  assert.ok(html.includes('暂停／静止'));
  assert.ok(html.includes('数据缺失'));
});
test('cycling timelines use watts including zero and distinct cycling pace bands', () => {
  assert.equal(paceBand([0, 10, 0, 'running'], 'power', 'ride'), 0);
  assert.equal(paceBand([0, 10, 100, 'running'], 'power', 'ride'), 1);
  assert.equal(paceBand([0, 10, 400, 'running'], 'power', 'ride'), 6);
  assert.equal(paceBand([0, 10, null, 'unknown'], 'power', 'ride'), 8);
  assert.equal(paceBand([0, 10, 120, 'running'], 'pace', 'ride'), 3);
  const html = renderToStaticMarkup(
    <PaceTimeline
      run={{
        id: 2,
        name: 'Ride',
        start_date_local: '',
        distance: 100,
        moving_time: 10,
        elapsed_time: 10,
        metric: 'power',
        sport_group: 'ride',
        device_watts: true,
        bins: [[0, 10, 0, 'running']],
      }}
    />
  );
  assert.ok(html.includes('功率 · W'));
  assert.ok(html.includes('随时间变化的功率区间'));
  assert.ok(!html.includes('配速 · min/km'));
});
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} 08:00:00`;
const activity = (extra: Partial<Activity> = {}): Activity => ({
  run_id: 1,
  name: 'Run',
  source: 'strava',
  type: 'Run',
  distance: 7000,
  moving_time: '0:30:00',
  start_date: date,
  start_date_local: date,
  average_speed: 3,
  elevation_gain: 0,
  streak: 1,
  ...extra,
});

test('PB uses official elapsed-time efforts inside longer runs, not total moving time or short runs', () => {
  const short = activity({ run_id: 2, distance: 4800, moving_time: '0:01:00' });
  const long = activity({
    distance: 15000,
    best_efforts: [{ name: '5K', distance: 5000, elapsed_time: 1250 }],
  });
  const slowHalf = activity({
    run_id: 3,
    type: 'Trail Run',
    distance: 23000,
    best_efforts: [
      { name: 'Half-Marathon', distance: 21097, elapsed_time: 11670 },
    ],
  });
  const bests = personalBests([short, long, slowHalf]);
  assert.equal(bests.find((b) => b.key === '5K')?.activity?.run_id, 1);
  assert.equal(bests.find((b) => b.key === '5K')?.time, 1250);
  assert.equal(bests.find((b) => b.key === 'Half Marathon')?.time, 11670);
  assert.equal(bests.find((b) => b.key === '10K')?.activity, null);
});

test('short running records and both page controls render', () => {
  const run = activity({
    distance: 1100,
    best_efforts_version: 2,
    best_efforts: [
      { name: '400m', distance: 400, elapsed_time: 85 },
      { name: '1K', distance: 1000, elapsed_time: 245 },
    ],
  });
  const markup = renderToStaticMarkup(<PersonalBest activities={[run]} />);
  for (const value of [
    '400米',
    '1公里',
    '1:25',
    '4:05',
    '上一页最佳成绩',
    '下一页最佳成绩',
  ])
    assert.ok(markup.includes(value), value);
  assert.ok(!markup.includes('待同步'));
});

test('power records use measured cycling intervals and select highest watts independently', () => {
  const effort = (duration: number, watts: number) => ({
    duration,
    watts,
    start_time: 0,
    end_time: duration,
  });
  const ride = activity({
    type: 'Ride',
    device_watts: true,
    power_efforts: [effort(5, 900), effort(60, 350)],
  });
  const indoor = activity({
    run_id: 2,
    type: 'VirtualRide',
    device_watts: true,
    power_efforts: [effort(60, 400), effort(3600, 200)],
  });
  const bests = cyclingPowerBests([
    ride,
    indoor,
    activity({
      type: 'RoadTrip',
      device_watts: true,
      power_efforts: [effort(5, 9999)],
    }),
    activity({
      type: 'Ride',
      device_watts: false,
      power_efforts: [effort(5, 9999)],
    }),
    activity({
      type: 'Ride',
      device_watts: true,
      power_efforts: [effort(300, NaN)],
    }),
  ]);
  assert.deepEqual(
    bests.map((b) => b.duration),
    [5, 60, 300, 1200, 2400, 3600]
  );
  assert.equal(bests[0].watts, 900);
  assert.equal(bests[1].activity?.run_id, 2);
  assert.equal(bests[2].activity, null);
  assert.equal(bests[5].watts, 200);
});

test('running categories include trail and virtual runs', () => {
  for (const type of ['Run', 'Trail Run', 'VirtualRun'])
    assert.equal(isRunning(type), true);
  for (const type of ['Ride', 'Workout', 'RoadTrip', 'Flight', 'Train'])
    assert.equal(isRunning(type), false);
});

test('year/month/week running goals remain identical when transport, rides and workouts are added', () => {
  const run = activity();
  const extra = ['Ride', 'Workout', 'RoadTrip', 'Flight', 'Train'].map(
    (type, index) => activity({ run_id: 10 + index, type, distance: 999999 })
  );
  const render = (items: Activity[]) =>
    renderToStaticMarkup(
      <StatsCards
        activities={items}
        allActivities={items}
        year={null}
        filter="Run"
        onSelectActivity={() => {}}
      />
    );
  const goalValues = (markup: string) =>
    [...markup.matchAll(/<p[^>]*class="[^"]*text-3xl[^"]*"[^>]*>(.*?)<\/p>/gs)]
      .slice(0, 3)
      .map((match) => match[1]);
  assert.deepEqual(
    goalValues(render([run])),
    goalValues(render([run, ...extra]))
  );
  assert.equal(render([run, ...extra]).match(/1 次跑步/g)?.length, 3);
});

test('heatmap removes transport from its dates, totals, tooltips and training colours', () => {
  const run = activity();
  const transports = ['RoadTrip', 'Flight', 'Train'].map((type, index) =>
    activity({ run_id: 2 + index, type, distance: 999999 })
  );
  const render = (items: Activity[]) =>
    renderToStaticMarkup(
      <ContributionHeatmap
        activities={items}
        year={today.getFullYear()}
        filter="all"
      />
    );
  assert.equal(render([run]), render([run, ...transports]));
});

test('transport filters show only matching dates, distance, totals and labels', () => {
  const transports = ['RoadTrip', 'Flight', 'Train'];
  const labels = ['自驾', '飞行', '铁路'];
  const dates = ['2026-01-02', '2026-02-03', '2026-03-04'];
  const items = transports.map((type, index) =>
    activity({
      run_id: 20 + index,
      type,
      distance: 123400,
      start_date_local: `${dates[index]} 10:00:00`,
    })
  );
  transports.forEach((filter, index) => {
    const markup = renderToStaticMarkup(
      <ContributionHeatmap activities={items} year={2026} filter={filter} />
    );
    assert.ok(markup.includes(`${labels[index]}热力图`));
    assert.ok(markup.includes(`${dates[index]}: 123.4 km`));
    assert.equal(
      markup.match(/class="heatmap-day[^>]*title="[^\"]* km"/g)?.length,
      1
    );
    dates
      .filter((_, i) => i !== index)
      .forEach((date) => {
        assert.ok(!markup.includes(`${date}:`));
      });
    assert.match(markup, /1 次/);
    assert.match(markup, /123 km/);
  });
});

test('activity type labels prioritize run, ride, hike and workout', () => {
  assert.deepEqual(
    orderActivityTypes([
      'Flight',
      'Train',
      'Workout',
      'Ride',
      'RoadTrip',
      'Hike',
      'Run',
      'Run',
    ]),
    ['Run', 'Ride', 'Hike', 'Workout', 'Flight', 'Train', 'RoadTrip']
  );
});

test('new Summary excludes transport and handles ISO weeks across New Year', () => {
  const render = (items: Activity[]) =>
    renderToStaticMarkup(
      <SummaryPage activities={items} onSelectActivity={() => {}} />
    );
  assert.equal(
    render([activity()]),
    render([
      activity(),
      activity({ run_id: 2, type: 'Train', distance: 999999 }),
    ])
  );
  assert.equal(summaryKey('2021-01-01 08:00:00', 'week'), '2020-W53');
  assert.equal(
    summaryChart(
      [activity({ start_date_local: '2024-02-29 08:00:00' })],
      'month',
      '2024-02'
    ).length,
    29
  );
  assert.equal(summarize([activity({ distance: 0 })]).speed, 0);
});

test('heatmap columns are Monday–Sunday for Sunday/Monday year starts and leap days', () => {
  const sundayYear = buildYearGrid(2023, [], false, true).grid;
  assert.deepEqual(
    sundayYear[0].map((day) => day.date),
    ['2023-01-01']
  );
  assert.equal(sundayYear[1][0].date, '2023-01-02');
  assert.equal(sundayYear[1][6].date, '2023-01-08');
  const leapYear = buildYearGrid(2024, [], false, true).grid;
  assert.equal(leapYear[0][0].date, '2024-01-01');
  assert.equal(leapYear[0][6].date, '2024-01-07');
  assert.equal(leapYear.flat().length, 366);
  assert.equal(
    leapYear.find((week) => week.some((day) => day.date === '2024-02-29'))?.[3]
      .date,
    '2024-02-29'
  );
});

test('activity log uses legacy weather and elevation data and exposes sortable headers', () => {
  const run = activity({
    elevation_gain: 358.9,
    temperature_min: -3.2,
    temperature_max: 4.7,
    weather_code: 71,
  });
  const render = (items: Activity[]) =>
    renderToStaticMarkup(
      <ActivityLog
        activities={items}
        years={[]}
        year={null}
        setYear={() => {}}
      />
    );
  const markup = render([run]);
  assert.ok(markup.includes('海拔爬升'));
  assert.ok(markup.includes('天气'));
  assert.ok(markup.includes(formatTemperatureRange(-3.2, 4.7, 71)));
  assert.match(markup, /359<span class="ml-1 text-xs">m<\/span>/);
  assert.equal(markup.match(/scope="col"/g)?.length, 9);
  assert.match(markup, /aria-sort="descending"/);
  assert.equal(markup.match(/aria-sort="none"/g)?.length, 8);
  assert.match(render([]), /colSpan="9"/i);
  const transport = render([activity({ ...run, type: 'Flight' })]);
  assert.ok(!transport.includes(formatTemperatureRange(-3.2, 4.7, 71)));
  assert.ok(!transport.includes('359<span'));
  assert.ok(!render([activity()]).includes('undefined'));
});

test('activity sorting compares numbers, full durations, speed, dates and text in both directions', () => {
  const low = activity({
    name: 'Alpha',
    type: 'Hike',
    distance: 2000,
    elevation_gain: 2,
    moving_time: '23:59:59',
    average_speed: 2,
    average_heartrate: 90,
    start_date_local: '2025-01-01 08:00:00',
    temperature_min: -5,
    temperature_max: 1,
  });
  const high = activity({
    run_id: 2,
    name: 'Zulu',
    type: 'Run',
    distance: 10000,
    elevation_gain: 100,
    moving_time: '1 day, 0:00:00',
    average_speed: 5,
    average_heartrate: 150,
    start_date_local: '2026-01-01T08:00:00',
    temperature_min: 0,
    temperature_max: 10,
  });
  const keys: ActivitySortKey[] = [
    'date',
    'type',
    'name',
    'distance',
    'elevation',
    'duration',
    'pace',
    'hr',
    'weather',
  ];
  for (const key of keys) {
    assert.ok(compareActivities(low, high, key, 'ascending', 'en') < 0, key);
    assert.ok(compareActivities(low, high, key, 'descending', 'en') > 0, key);
    assert.equal(compareActivities(low, low, key, 'ascending', 'en'), 0, key);
  }
});

test('activity sorting keeps missing temperatures last, accepts zero and places transport last for metrics', () => {
  const measured = activity({ temperature_min: 0, temperature_max: 0 });
  const missing = activity({ run_id: 2, temperature_min: 10 });
  const transport = activity({ run_id: 3, type: 'RoadTrip', distance: 999999 });
  const directions: SortDirection[] = ['ascending', 'descending'];
  for (const direction of directions) {
    assert.ok(
      compareActivities(measured, missing, 'weather', direction, 'zh') < 0
    );
    assert.ok(
      compareActivities(measured, transport, 'distance', direction, 'zh') < 0
    );
    assert.ok(
      compareActivities(
        measured,
        activity({ type: 'Workout' }),
        'elevation',
        direction,
        'zh'
      ) < 0
    );
  }
  assert.equal(
    compareActivities(missing, missing, 'weather', 'descending', 'zh'),
    0
  );
  const dated = [
    activity({ run_id: 4, start_date_local: '2026-01-01 00:00:00' }),
    activity({
      run_id: 5,
      type: 'Flight',
      start_date_local: '2026-01-02 00:00:00',
    }),
  ];
  assert.equal(
    [...dated].sort((a, b) =>
      compareActivities(a, b, 'date', 'descending', 'zh')
    )[0].run_id,
    5
  );
  assert.deepEqual(
    dated.map((a) => a.run_id),
    [4, 5]
  );
});
