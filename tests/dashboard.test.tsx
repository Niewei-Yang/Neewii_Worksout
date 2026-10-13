import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Activity } from '../src/utils/utils';
import { personalBests } from '../src/components/Dashboard/utils/personalBests';
import { isRunning } from '../src/components/Dashboard/utils/activityTypes';
import { StatsCards } from '../src/components/Dashboard/components/StatsCards';
import {
  ContributionHeatmap,
  buildYearGrid,
} from '../src/components/Dashboard/components/ContributionHeatmap';
import { SummaryPage } from '../src/components/Dashboard/components/SummaryPage';
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
  assert.equal(bests[0].activity?.run_id, 1);
  assert.equal(bests[0].time, 1250);
  assert.equal(bests[2].time, 11670);
  assert.equal(bests[1].activity, null);
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
