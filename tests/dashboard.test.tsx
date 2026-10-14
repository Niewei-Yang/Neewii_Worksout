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
  summaryKey,
  summaryChart,
  summarize,
} from '../src/components/Dashboard/utils/summary';

const today = new Date();
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
