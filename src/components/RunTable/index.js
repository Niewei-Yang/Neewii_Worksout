import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback } from 'react';
import { sortDateFunc, sortDateFuncReverse, convertMovingTime2Sec, isActivityDisplayOnly, isTransportActivity, } from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import RunRow from './RunRow';
import styles from './style.module.css';
const PACE_SPEED_HEADER = 'Pace/Speed';
const DATE_HEADER = 'Date';
const WEEKDAY_HEADER = 'Weekday';
const transportLast = (sortFunc) => {
    return (a, b) => {
        const aTransport = isTransportActivity(a.type);
        const bTransport = isTransportActivity(b.type);
        if (aTransport !== bTransport) {
            return aTransport ? 1 : -1;
        }
        return sortFunc(a, b);
    };
};
const RunTable = ({ runs, locateActivity, setActivity, runIndex, setRunIndex, }) => {
    const [sortFuncInfo, setSortFuncInfo] = useState('');
    // Memoize sort functions to prevent recreating them on every render
    const sortFunctions = useMemo(() => {
        const sortTypeFunc = (a, b) => sortFuncInfo === 'Type'
            ? a.type > b.type
                ? 1
                : -1
            : b.type < a.type
                ? -1
                : 1;
        const sortKMFunc = (a, b) => sortFuncInfo === 'KM' ? a.distance - b.distance : b.distance - a.distance;
        const sortElevationGainFunc = (a, b) => sortFuncInfo === 'Elev'
            ? (a.elevation_gain ?? 0) - (b.elevation_gain ?? 0)
            : (b.elevation_gain ?? 0) - (a.elevation_gain ?? 0);
        const sortPaceSpeedFunc = (a, b) => {
            const aDisplayOnly = isActivityDisplayOnly(a.type);
            const bDisplayOnly = isActivityDisplayOnly(b.type);
            if (aDisplayOnly !== bDisplayOnly) {
                return aDisplayOnly ? 1 : -1;
            }
            return sortFuncInfo === PACE_SPEED_HEADER
                ? a.average_speed - b.average_speed
                : b.average_speed - a.average_speed;
        };
        const sortBPMFunc = (a, b) => {
            return sortFuncInfo === 'BPM'
                ? (a.average_heartrate ?? 0) - (b.average_heartrate ?? 0)
                : (b.average_heartrate ?? 0) - (a.average_heartrate ?? 0);
        };
        const sortRunTimeFunc = (a, b) => {
            const aTotalSeconds = convertMovingTime2Sec(a.moving_time);
            const bTotalSeconds = convertMovingTime2Sec(b.moving_time);
            return sortFuncInfo === 'Time'
                ? aTotalSeconds - bTotalSeconds
                : bTotalSeconds - aTotalSeconds;
        };
        const sortDateFuncClick = sortFuncInfo === DATE_HEADER ? sortDateFunc : sortDateFuncReverse;
        const sortFuncMap = new Map([
            ['Type', transportLast(sortTypeFunc)],
            ['KM', transportLast(sortKMFunc)],
            ['Elev', transportLast(sortElevationGainFunc)],
            [PACE_SPEED_HEADER, transportLast(sortPaceSpeedFunc)],
            ['BPM', transportLast(sortBPMFunc)],
            ['Time', transportLast(sortRunTimeFunc)],
            [DATE_HEADER, sortDateFuncClick],
        ]);
        if (!SHOW_ELEVATION_GAIN) {
            sortFuncMap.delete('Elev');
        }
        return sortFuncMap;
    }, [sortFuncInfo]);
    const handleClick = useCallback((e) => {
        const funcName = e.target.innerHTML;
        const f = sortFunctions.get(funcName);
        setRunIndex(-1);
        setSortFuncInfo(sortFuncInfo === funcName ? '' : funcName);
        setActivity(runs.sort(f));
    }, [sortFunctions, sortFuncInfo, runs, setRunIndex, setActivity]);
    const tableHeaders = useMemo(() => {
        return Array.from(sortFunctions.keys()).flatMap((header) => header === DATE_HEADER ? [WEEKDAY_HEADER, header] : [header]);
    }, [sortFunctions]);
    return (_jsx("div", { className: styles.tableContainer, children: _jsxs("table", { className: styles.runTable, cellSpacing: "0", cellPadding: "0", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), tableHeaders.map((k) => (_jsx("th", { onClick: k === WEEKDAY_HEADER ? undefined : handleClick, children: k }, k)))] }) }), _jsx("tbody", { children: runs.map((run, elementIndex) => (_jsx(RunRow, { elementIndex: elementIndex, locateActivity: locateActivity, run: run, runIndex: runIndex, setRunIndex: setRunIndex }, run.run_id))) })] }) }));
};
export default RunTable;
