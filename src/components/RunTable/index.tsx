import React, { useState, useMemo, useCallback } from 'react';
import {
  sortDateFunc,
  sortDateFuncReverse,
  convertMovingTime2Sec,
  Activity,
  RunIds,
  isActivityDisplayOnly,
  isTransportActivity,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';

import RunRow from './RunRow';
import styles from './style.module.css';

interface IRunTableProperties {
  runs: Activity[];
  locateActivity: (_runIds: RunIds) => void;
  setActivity: (_runs: Activity[]) => void;
  runIndex: number;
  setRunIndex: (_index: number) => void;
}

type SortFunc = (_a: Activity, _b: Activity) => number;

const PACE_SPEED_HEADER = 'Pace/Speed';
const TEMP_HEADER = 'Temp';
const DATE_HEADER = 'Date';
const WEEKDAY_HEADER = 'Weekday';

const transportLast = (sortFunc: SortFunc): SortFunc => {
  return (a, b) => {
    const aTransport = isTransportActivity(a.type);
    const bTransport = isTransportActivity(b.type);
    if (aTransport !== bTransport) {
      return aTransport ? 1 : -1;
    }
    return sortFunc(a, b);
  };
};

const RunTable = ({
  runs,
  locateActivity,
  setActivity,
  runIndex,
  setRunIndex,
}: IRunTableProperties) => {
  const [sortFuncInfo, setSortFuncInfo] = useState('');

  // Memoize sort functions to prevent recreating them on every render
  const sortFunctions = useMemo(() => {
    const sortTypeFunc: SortFunc = (a, b) =>
      sortFuncInfo === 'Type'
        ? a.type > b.type
          ? 1
          : -1
        : b.type < a.type
          ? -1
          : 1;
    const sortKMFunc: SortFunc = (a, b) =>
      sortFuncInfo === 'KM' ? a.distance - b.distance : b.distance - a.distance;
    const sortElevationGainFunc: SortFunc = (a, b) =>
      sortFuncInfo === 'Elev'
        ? (a.elevation_gain ?? 0) - (b.elevation_gain ?? 0)
        : (b.elevation_gain ?? 0) - (a.elevation_gain ?? 0);
    const sortPaceSpeedFunc: SortFunc = (a, b) => {
      const aDisplayOnly = isActivityDisplayOnly(a.type);
      const bDisplayOnly = isActivityDisplayOnly(b.type);
      if (aDisplayOnly !== bDisplayOnly) {
        return aDisplayOnly ? 1 : -1;
      }
      return sortFuncInfo === PACE_SPEED_HEADER
        ? a.average_speed - b.average_speed
        : b.average_speed - a.average_speed;
    };
    const sortBPMFunc: SortFunc = (a, b) => {
      return sortFuncInfo === 'BPM'
        ? (a.average_heartrate ?? 0) - (b.average_heartrate ?? 0)
        : (b.average_heartrate ?? 0) - (a.average_heartrate ?? 0);
    };
    const temperatureValue = (run: Activity): number | null => {
      if (run.temperature_min == null || run.temperature_max == null) {
        return null;
      }

      return (run.temperature_min + run.temperature_max) / 2;
    };
    const sortTempFunc: SortFunc = (a, b) => {
      const aTemperature = temperatureValue(a);
      const bTemperature = temperatureValue(b);

      if (aTemperature == null && bTemperature == null) {
        return 0;
      }
      if (aTemperature == null) {
        return 1;
      }
      if (bTemperature == null) {
        return -1;
      }

      return sortFuncInfo === TEMP_HEADER
        ? aTemperature - bTemperature
        : bTemperature - aTemperature;
    };
    const sortRunTimeFunc: SortFunc = (a, b) => {
      const aTotalSeconds = convertMovingTime2Sec(a.moving_time);
      const bTotalSeconds = convertMovingTime2Sec(b.moving_time);
      return sortFuncInfo === 'Time'
        ? aTotalSeconds - bTotalSeconds
        : bTotalSeconds - aTotalSeconds;
    };
    const sortDateFuncClick =
      sortFuncInfo === DATE_HEADER ? sortDateFunc : sortDateFuncReverse;

    const sortFuncMap = new Map([
      ['Type', transportLast(sortTypeFunc)],
      ['KM', transportLast(sortKMFunc)],
      ['Elev', transportLast(sortElevationGainFunc)],
      [PACE_SPEED_HEADER, transportLast(sortPaceSpeedFunc)],
      ['BPM', transportLast(sortBPMFunc)],
      [TEMP_HEADER, transportLast(sortTempFunc)],
      ['Time', transportLast(sortRunTimeFunc)],
      [DATE_HEADER, sortDateFuncClick],
    ]);

    if (!SHOW_ELEVATION_GAIN) {
      sortFuncMap.delete('Elev');
    }

    return sortFuncMap;
  }, [sortFuncInfo]);

  const handleClick = useCallback<React.MouseEventHandler<HTMLElement>>(
    (e) => {
      const funcName = (e.target as HTMLElement).innerHTML;
      const f = sortFunctions.get(funcName);

      setRunIndex(-1);
      setSortFuncInfo(sortFuncInfo === funcName ? '' : funcName);
      setActivity(runs.sort(f));
    },
    [sortFunctions, sortFuncInfo, runs, setRunIndex, setActivity]
  );

  const tableHeaders = useMemo(() => {
    return Array.from(sortFunctions.keys()).flatMap((header) =>
      header === DATE_HEADER ? [WEEKDAY_HEADER, header] : [header]
    );
  }, [sortFunctions]);

  return (
    <div className={styles.tableContainer}>
      <table className={styles.runTable} cellSpacing="0" cellPadding="0">
        <thead>
          <tr>
            <th />
            {tableHeaders.map((k) => (
              <th
                key={k}
                onClick={k === WEEKDAY_HEADER ? undefined : handleClick}
              >
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run, elementIndex) => (
            <RunRow
              key={run.run_id}
              elementIndex={elementIndex}
              locateActivity={locateActivity}
              run={run}
              runIndex={runIndex}
              setRunIndex={setRunIndex}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RunTable;
