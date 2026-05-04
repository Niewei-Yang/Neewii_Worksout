import { lazy, Suspense, type MouseEvent } from 'react';
import Stat from '@/components/Stat';
import WorkoutStat from '@/components/WorkoutStat';
import useActivities from '@/hooks/useActivities';

import {
  colorFromType,
  isActivityExcludedFromTotals,
  isActivityDisplayOnly,
  isTransportActivity,
} from '@/utils/utils';
import { yearGithubStats, yearStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { useThemeChangeCounter } from '@/hooks/useTheme';

const YearStat = ({
  year,
  onClick,
  onClickTypeInYear,
}: {
  year: string;
  onClick: (_year: string) => void;
  onClickTypeInYear: (_year: string, _type: string) => void;
}) => {
  let { activities: runs, years } = useActivities();
  useThemeChangeCounter();
  // lazy Component
  const YearSVG = lazy(() => loadSvgComponent(yearStats, `./year_${year}.svg`));
  const yearGithubPath = `./github_${year}.svg`;
  const hasYearGithub = Object.prototype.hasOwnProperty.call(
    yearGithubStats,
    yearGithubPath
  );
  const YearGithubSVG = hasYearGithub
    ? lazy(() => loadSvgComponent(yearGithubStats, yearGithubPath))
    : null;

  if (years.includes(year)) {
    runs = runs.filter((run) => run.start_date_local.slice(0, 4) === year);
  }
  let sumDistance = 0;
  let streak = 0;
  let sumElevationGain = 0;
  let heartRate = 0;
  let heartRateNullCount = 0;
  const workoutsCounts = {};

  runs.forEach((run) => {
    const includeInTotal = !isActivityExcludedFromTotals(run.type);
    if (includeInTotal) {
      sumDistance += run.distance || 0;
      sumElevationGain += run.elevation_gain || 0;
    }
    if (run.average_speed && !isTransportActivity(run.type)) {
      if (workoutsCounts[run.type]) {
        var [oriCount, oriSecondsAvail, oriMetersAvail] =
          workoutsCounts[run.type];
        workoutsCounts[run.type] = [
          oriCount + 1,
          oriSecondsAvail + (run.distance || 0) / run.average_speed,
          oriMetersAvail + (run.distance || 0),
        ];
      } else {
        workoutsCounts[run.type] = [
          1,
          (run.distance || 0) / run.average_speed,
          run.distance,
        ];
      }
    }
    if (run.average_heartrate) {
      heartRate += run.average_heartrate;
    } else {
      heartRateNullCount++;
    }
    if (run.streak && !isActivityDisplayOnly(run.type)) {
      streak = Math.max(streak, run.streak);
    }
  });
  const sumElevationGainStr = sumElevationGain.toFixed(0);
  const hasHeartRate = !(heartRate === 0);
  const avgHeartRate = (heartRate / (runs.length - heartRateNullCount)).toFixed(
    0
  );

  const workoutsArr = Object.entries(workoutsCounts);
  workoutsArr.sort((a, b) => {
    return b[1][0] - a[1][0];
  });
  return (
    <div className="cursor-pointer" onClick={() => onClick(year)}>
      <section>
        <Stat value={year} description=" Journey" />
        {sumDistance > 0 && (
          <WorkoutStat
            key="total"
            value={
              runs.filter((run) => !isActivityExcludedFromTotals(run.type))
                .length
            }
            description={' Total'}
            distance={(sumDistance / 1000.0).toFixed(0)}
          />
        )}
        {workoutsArr.map(([type, count]) => (
          <WorkoutStat
            key={type}
            value={count[0]}
            description={` ${type}` + 's'}
            // pace={formatPace(count[2] / count[1])}
            distance={
              isActivityDisplayOnly(type)
                ? undefined
                : (count[2] / 1000.0).toFixed(0)
            }
            color={colorFromType(type)}
            onClick={(e: MouseEvent<HTMLDivElement>) => {
              onClickTypeInYear(year, type);
              e.stopPropagation();
            }}
          />
        ))}
        {SHOW_ELEVATION_GAIN && sumElevationGain > 0 && (
          <Stat
            value={`${sumElevationGainStr} `}
            description="M Elev Gain"
            className="pb-2"
          />
        )}
        <Stat value={`${streak} day`} description=" Streak" className="pb-2" />
        {hasHeartRate && (
          <Stat value={avgHeartRate} description=" Avg Heart Rate" />
        )}
        {year !== 'Total' && YearGithubSVG && (
          <Suspense fallback="loading...">
            <YearGithubSVG className="github-svg year-github-svg mt-3 h-auto w-full border-0 p-0" />
          </Suspense>
        )}
        {year !== 'Total' && (
          <Suspense fallback="loading...">
            <YearSVG className="year-svg my-4 h-4/6 w-4/6 border-0 p-0" />
          </Suspense>
        )}
      </section>
      <hr />
    </div>
  );
};

export default YearStat;
