import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { formatPaceOrSpeed, colorFromType, titleForRun, formatRunTime, isActivityDisplayOnly, } from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { useThemeChangeCounter } from '@/hooks/useTheme';
import styles from './style.module.css';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const RunRow = ({ elementIndex, locateActivity, run, runIndex, setRunIndex, }) => {
    const distance = (run.distance / 1000.0).toFixed(2);
    const elevation_gain = run.elevation_gain?.toFixed(0);
    const displayOnly = isActivityDisplayOnly(run.type);
    const paceParts = run.average_speed
        ? formatPaceOrSpeed(run.average_speed, run.type)
        : null;
    const heartRate = run.average_heartrate;
    const type = run.type;
    const runTime = formatRunTime(run.moving_time);
    const weekday = WEEKDAYS[new Date(run.start_date_local.replace(' ', 'T')).getDay()];
    const themeChangeCounter = useThemeChangeCounter();
    const rowColor = useMemo(() => colorFromType(type), [type, themeChangeCounter]);
    const handleClick = () => {
        if (runIndex === elementIndex) {
            setRunIndex(-1);
            locateActivity([]);
            return;
        }
        setRunIndex(elementIndex);
        locateActivity([run.run_id]);
    };
    return (_jsxs("tr", { className: `${styles.runRow} ${runIndex === elementIndex ? styles.selected : ''}`, onClick: handleClick, style: { color: rowColor }, children: [_jsx("td", { children: titleForRun(run) }), _jsx("td", { children: type }), _jsx("td", { children: displayOnly ? '' : distance }), SHOW_ELEVATION_GAIN && _jsx("td", { children: displayOnly ? '' : (elevation_gain ?? 0.0) }), _jsx("td", { children: displayOnly ? '' : paceParts }), _jsx("td", { children: displayOnly ? '' : heartRate && heartRate.toFixed(0) }), _jsx("td", { children: runTime }), _jsx("td", { children: weekday }), _jsx("td", { className: styles.runDate, children: run.start_date_local })] }, run.start_date_local));
};
export default RunRow;
