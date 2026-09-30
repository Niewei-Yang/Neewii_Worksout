import { IS_CHINESE } from '@/utils/const';
import styles from './style.module.css';

interface IFlightControlProps {
  hideFlights: boolean;
  setHideFlights: (_hidden: boolean) => void;
}

const FlightControl = ({
  hideFlights,
  setHideFlights,
}: IFlightControlProps) => {
  const label = IS_CHINESE
    ? hideFlights
      ? '显示飞行轨迹'
      : '屏蔽飞行轨迹'
    : hideFlights
      ? 'Show flight routes'
      : 'Hide flight routes';

  return (
    <div className={'mapboxgl-ctrl mapboxgl-ctrl-group ' + styles.flightCtrl}>
      <button
        type="button"
        className={styles.flightButton}
        onClick={(event) => {
          event.stopPropagation();
          setHideFlights(!hideFlights);
        }}
        title={label}
        aria-label={label}
        aria-pressed={hideFlights}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
          />
          {hideFlights && (
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
          )}
        </svg>
      </button>
    </div>
  );
};

export default FlightControl;
