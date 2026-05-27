import { useMemo } from 'react';
import {
  formatPaceOrSpeed,
  colorFromType,
  titleForRun,
  formatRunTime,
  Activity,
  RunIds,
  isActivityDisplayOnly,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { useThemeChangeCounter } from '@/hooks/useTheme';
import styles from './style.module.css';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  setRunIndex: (_ndex: number) => void;
}

const RunRow = ({
  elementIndex,
  locateActivity,
  run,
  runIndex,
  setRunIndex,
}: IRunRowProperties) => {
  const distance = (run.distance / 1000.0).toFixed(2);
  const elevation_gain = run.elevation_gain?.toFixed(0);
  const displayOnly = isActivityDisplayOnly(run.type);
  const hideDistanceAndElevation = displayOnly || run.type === 'Workout';
  const paceParts = run.average_speed
    ? formatPaceOrSpeed(run.average_speed, run.type)
    : null;
  const heartRate = run.average_heartrate;
  const type = run.type;
  const runTime = formatRunTime(run.moving_time);
  const weekday =
    WEEKDAYS[new Date(run.start_date_local.replace(' ', 'T')).getDay()];
  const themeChangeCounter = useThemeChangeCounter();
  const rowColor = useMemo(
    () => colorFromType(type),
    [type, themeChangeCounter]
  );
  const handleClick = () => {
    if (runIndex === elementIndex) {
      setRunIndex(-1);
      locateActivity([]);
      return;
    }
    setRunIndex(elementIndex);
    locateActivity([run.run_id]);
  };

  return (
    <tr
      className={`${styles.runRow} ${runIndex === elementIndex ? styles.selected : ''}`}
      key={run.start_date_local}
      onClick={handleClick}
      style={{ color: rowColor }}
    >
      <td>{titleForRun(run)}</td>
      <td>{type}</td>
      <td>{hideDistanceAndElevation ? '' : distance}</td>
      {SHOW_ELEVATION_GAIN && (
        <td>{hideDistanceAndElevation ? '' : (elevation_gain ?? 0.0)}</td>
      )}
      <td>{displayOnly ? '' : paceParts}</td>
      <td>{displayOnly ? '' : heartRate && heartRate.toFixed(0)}</td>
      <td>{runTime}</td>
      <td>{weekday}</td>
      <td className={styles.runDate}>{run.start_date_local}</td>
    </tr>
  );
};

export default RunRow;
