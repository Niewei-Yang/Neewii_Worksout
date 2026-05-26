import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { lazy, useState, Suspense, useEffect, useRef, useCallback, useMemo, } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, } from 'recharts';
import VirtualList from 'rc-virtual-list';
import { useNavigate } from 'react-router-dom';
import activities from '@/static/activities.json';
import styles from './style.module.css';
import { ACTIVITY_TOTAL, LOADING_TEXT, TYPES_MAPPING } from '@/utils/const';
import { totalStat } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { SHOW_ELEVATION_GAIN, HOME_PAGE_TITLE } from '@/utils/const';
import RoutePreview from '@/components/RoutePreview';
import { isActivityExcludedFromSummary } from '@/utils/utils';
// Layout constants (avoid magic numbers)
const ITEM_WIDTH = 280;
const ITEM_GAP = 20;
const VIRTUAL_LIST_STYLES = {
    horizontalScrollBar: {},
    horizontalScrollBarThumb: {
        background: 'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
    },
    verticalScrollBar: {},
    verticalScrollBarThumb: {
        background: 'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
    },
};
const MonthOfLifeSvg = (sportType) => {
    const path = sportType === 'all' ? './mol.svg' : `./mol_${sportType}.svg`;
    return lazy(() => loadSvgComponent(totalStat, path));
};
const RunningSvg = MonthOfLifeSvg('running');
const WalkingSvg = MonthOfLifeSvg('walking');
const HikingSvg = MonthOfLifeSvg('hiking');
const CyclingSvg = MonthOfLifeSvg('cycling');
const SwimmingSvg = MonthOfLifeSvg('swimming');
const SkiingSvg = MonthOfLifeSvg('skiing');
const AllSvg = MonthOfLifeSvg('all');
const ActivityCardInner = ({ period, summary, dailyDistances, interval, activityType = 'all', activities = [], }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const handleCardClick = () => {
        if (interval === 'day' && activities.length > 0) {
            setIsFlipped(!isFlipped);
        }
    };
    const generateLabels = () => {
        if (interval === 'month') {
            const [year, month] = period.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate(); // Get the number of days in the month
            return Array.from({ length: daysInMonth }, (_, i) => i + 1);
        }
        else if (interval === 'week') {
            return Array.from({ length: 7 }, (_, i) => i + 1);
        }
        else if (interval === 'year') {
            return Array.from({ length: 12 }, (_, i) => i + 1); // Generate months 1 to 12
        }
        return [];
    };
    const data = generateLabels().map((day) => ({
        day,
        distance: (dailyDistances[day - 1] || 0).toFixed(2), // Keep two decimal places
    }));
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}h ${m}m ${s}s`;
    };
    const formatPace = (speed) => {
        if (speed === 0)
            return '0:00 min/km';
        const pace = 60 / speed; // min/km
        const totalSeconds = Math.round(pace * 60); // Total seconds per km
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds} min/km`;
    };
    const isFastType = (activityType) => {
        switch (activityType?.toLowerCase()) {
            case 'virtualride':
            case 'ride':
            case 'indoor ride':
            case 'roadtrip':
                return true;
            default:
                return false;
        }
    };
    // Calculate Y-axis maximum value and ticks
    const yAxisMax = Math.ceil(Math.max(...data.map((d) => parseFloat(d.distance))) + 10); // Round up and add buffer
    const yAxisTicks = Array.from({ length: Math.ceil(yAxisMax / 5) + 1 }, (_, i) => i * 5); // Generate arithmetic sequence
    return (_jsx("div", { className: `${styles.activityCard} ${interval === 'day' ? styles.activityCardFlippable : ''}`, onClick: handleCardClick, style: {
            cursor: interval === 'day' && activities.length > 0 ? 'pointer' : 'default',
        }, children: _jsxs("div", { className: `${styles.cardInner} ${isFlipped ? styles.flipped : ''}`, children: [_jsxs("div", { className: styles.cardFront, children: [_jsx("h2", { className: styles.activityName, children: period }), _jsxs("div", { className: styles.activityDetails, children: [_jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.TOTAL_DISTANCE_TITLE, ":"] }), ' ', summary.totalDistance.toFixed(2), " km"] }), SHOW_ELEVATION_GAIN &&
                                    summary.totalElevationGain !== undefined && (_jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.TOTAL_ELEVATION_GAIN_TITLE, ":"] }), ' ', summary.totalElevationGain.toFixed(0), " m"] })), _jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.AVERAGE_SPEED_TITLE, ":"] }), ' ', isFastType(activityType)
                                            ? `${summary.averageSpeed.toFixed(2)} km/h`
                                            : formatPace(summary.averageSpeed)] }), _jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.TOTAL_TIME_TITLE, ":"] }), ' ', formatTime(summary.totalTime)] }), summary.averageHeartRate !== undefined && (_jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.AVERAGE_HEART_RATE_TITLE, ":"] }), ' ', summary.averageHeartRate.toFixed(0), " bpm"] })), interval !== 'day' && (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.ACTIVITY_COUNT_TITLE, ":"] }), ' ', summary.count] }), _jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.MAX_DISTANCE_TITLE, ":"] }), ' ', summary.maxDistance.toFixed(2), " km"] }), _jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.MAX_SPEED_TITLE, ":"] }), ' ', isFastType(activityType)
                                                    ? `${summary.maxSpeed.toFixed(2)} km/h`
                                                    : formatPace(summary.maxSpeed)] }), _jsxs("p", { children: [_jsxs("strong", { children: [ACTIVITY_TOTAL.AVERAGE_DISTANCE_TITLE, ":"] }), ' ', (summary.totalDistance / summary.count).toFixed(2), " km"] })] })), ['month', 'week', 'year'].includes(interval) && (_jsx("div", { className: styles.chart, children: _jsx(ResponsiveContainer, { children: _jsxs(BarChart, { data: data, margin: { top: 20, right: 20, left: -20, bottom: 5 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--color-run-row-hover-background)" }), _jsx(XAxis, { dataKey: "day", tick: { fill: 'var(--color-run-table-thead)' } }), _jsx(YAxis, { label: {
                                                        value: 'km',
                                                        angle: -90,
                                                        position: 'insideLeft',
                                                        fill: 'var(--color-run-table-thead)',
                                                    }, domain: [0, yAxisMax], ticks: yAxisTicks, tick: { fill: 'var(--color-run-table-thead)' } }), _jsx(Tooltip, { formatter: (value) => `${value} km`, contentStyle: {
                                                        backgroundColor: 'var(--color-run-row-hover-background)',
                                                        border: '1px solid var(--color-run-row-hover-background)',
                                                        color: 'var(--color-run-table-thead)',
                                                    }, labelStyle: { color: 'var(--color-primary)' } }), _jsx(Bar, { dataKey: "distance", fill: "var(--color-primary)" })] }) }) }))] })] }), interval === 'day' && activities.length > 0 && (_jsx("div", { className: styles.cardBack, children: _jsx("div", { className: styles.routeContainer, children: _jsx(RoutePreview, { activities: activities }) }) }))] }) }));
};
// custom equality for memo: compare key summary fields, dailyDistances values and activities length
const activityCardAreEqual = (prev, next) => {
    if (prev.period !== next.period)
        return false;
    if (prev.interval !== next.interval)
        return false;
    const s1 = prev.summary;
    const s2 = next.summary;
    if (s1.totalDistance !== s2.totalDistance ||
        s1.averageSpeed !== s2.averageSpeed ||
        s1.totalTime !== s2.totalTime ||
        s1.count !== s2.count ||
        s1.maxDistance !== s2.maxDistance ||
        s1.maxSpeed !== s2.maxSpeed ||
        s1.location !== s2.location ||
        (s1.totalElevationGain ?? undefined) !==
            (s2.totalElevationGain ?? undefined) ||
        (s1.averageHeartRate ?? undefined) !== (s2.averageHeartRate ?? undefined)) {
        return false;
    }
    const d1 = prev.dailyDistances || [];
    const d2 = next.dailyDistances || [];
    if (d1.length !== d2.length)
        return false;
    for (let i = 0; i < d1.length; i++)
        if (d1[i] !== d2[i])
            return false;
    const a1 = prev.activities || [];
    const a2 = next.activities || [];
    if (a1.length !== a2.length)
        return false;
    return true;
};
const ActivityCard = React.memo(ActivityCardInner, activityCardAreEqual);
const ActivityList = () => {
    const [interval, setInterval] = useState('month');
    const [activityType, setActivityType] = useState('run');
    const [sportType, setSportType] = useState('all');
    const [sportTypeOptions, setSportTypeOptions] = useState([]);
    useEffect(() => {
        const playTypes = new Set(activities
            .filter((activity) => !isActivityExcludedFromSummary(activity.type))
            .map((activity) => activity.type));
        const uniqueSportTypes = [...playTypes];
        uniqueSportTypes.unshift('all');
        setSportTypeOptions(uniqueSportTypes);
    }, []);
    // 添加useEffect监听interval变化
    useEffect(() => {
        if (interval === 'life' && sportType !== 'all') {
            setSportType('all');
        }
    }, [interval, sportType]);
    const navigate = useNavigate();
    const handleHomeClick = () => {
        navigate('/');
    };
    function toggleInterval(newInterval) {
        setInterval(newInterval);
    }
    const filterActivities = (activity) => {
        return activity.type?.toLowerCase() === activityType;
    };
    function convertTimeToSeconds(time) {
        const [hours, minutes, seconds] = time.split(':').map(Number);
        return hours * 3600 + minutes * 60 + seconds;
    }
    function groupActivitiesFn(intervalArg, sportTypeArg) {
        return activities
            .filter((activity) => {
            if (isActivityExcludedFromSummary(activity.type)) {
                return false;
            }
            if (sportType === 'all') {
                return true;
            }
            return activity.type === sportTypeArg;
        })
            .reduce((acc, activity) => {
            const date = new Date(activity.start_date_local);
            let key;
            let index;
            switch (intervalArg) {
                case 'year':
                    key = date.getFullYear().toString();
                    index = date.getMonth();
                    break;
                case 'month':
                    key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                    index = date.getDate() - 1;
                    break;
                case 'week': {
                    const currentDate = new Date(date.valueOf());
                    currentDate.setDate(currentDate.getDate() + 4 - (currentDate.getDay() || 7));
                    const yearStart = new Date(currentDate.getFullYear(), 0, 1);
                    const weekNum = Math.ceil(((currentDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
                    key = `${currentDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
                    index = (date.getDay() + 6) % 7;
                    break;
                }
                case 'day':
                    key = date.toLocaleDateString('zh').replaceAll('/', '-');
                    index = 0;
                    break;
                default:
                    key = date.getFullYear().toString();
                    index = 0;
            }
            if (!acc[key])
                acc[key] = {
                    totalDistance: 0,
                    totalTime: 0,
                    totalElevationGain: 0,
                    count: 0,
                    dailyDistances: [],
                    maxDistance: 0,
                    maxSpeed: 0,
                    location: '',
                    totalHeartRate: 0,
                    heartRateCount: 0,
                    activities: [],
                };
            const distanceKm = activity.distance / 1000;
            const timeInSeconds = convertTimeToSeconds(activity.moving_time);
            const speedKmh = timeInSeconds > 0 ? distanceKm / (timeInSeconds / 3600) : 0;
            acc[key].totalDistance += distanceKm;
            acc[key].totalTime += timeInSeconds;
            if (SHOW_ELEVATION_GAIN && activity.elevation_gain)
                acc[key].totalElevationGain += activity.elevation_gain;
            if (activity.average_heartrate) {
                acc[key].totalHeartRate += activity.average_heartrate;
                acc[key].heartRateCount += 1;
            }
            acc[key].count += 1;
            if (intervalArg === 'day')
                acc[key].activities.push(activity);
            acc[key].dailyDistances[index] =
                (acc[key].dailyDistances[index] || 0) + distanceKm;
            if (distanceKm > acc[key].maxDistance)
                acc[key].maxDistance = distanceKm;
            if (speedKmh > acc[key].maxSpeed)
                acc[key].maxSpeed = speedKmh;
            if (intervalArg === 'day')
                acc[key].location = activity.location_country || '';
            return acc;
        }, {});
    }
    const activitiesByInterval = useMemo(() => groupActivitiesFn(interval, sportType), [interval, sportType]);
    const dataList = useMemo(() => Object.entries(activitiesByInterval)
        .sort(([a], [b]) => {
        if (interval === 'day') {
            return new Date(b).getTime() - new Date(a).getTime(); // Sort by date
        }
        else if (interval === 'week') {
            const [yearA, weekA] = a.split('-W').map(Number);
            const [yearB, weekB] = b.split('-W').map(Number);
            return yearB - yearA || weekB - weekA; // Sort by year and week number
        }
        else {
            const [yearA, monthA = 0] = a.split('-').map(Number);
            const [yearB, monthB = 0] = b.split('-').map(Number);
            return yearB - yearA || monthB - monthA; // Sort by year and month
        }
    })
        .map(([period, summary]) => ({ period, summary })), [activitiesByInterval, interval]);
    const itemWidth = ITEM_WIDTH;
    const gap = ITEM_GAP;
    const containerRef = useRef(null);
    const filterRef = useRef(null);
    const [itemsPerRow, setItemsPerRow] = useState(0);
    const [rowHeight, setRowHeight] = useState(360);
    const sampleRef = useRef(null);
    const [listHeight, setListHeight] = useState(500);
    // ref to the VirtualList DOM node so we can control scroll position
    const virtualListRef = useRef(null);
    const calculateItemsPerRow = useCallback(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const containerWidth = container.clientWidth;
        // Calculate how many items can fit in one row (considering gaps)
        const count = Math.floor((containerWidth + gap) / (itemWidth + gap));
        setItemsPerRow(count);
    }, [gap, itemWidth]);
    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        // Calculate immediately once
        calculateItemsPerRow();
        // Use ResizeObserver to monitor container size changes
        const resizeObserver = new ResizeObserver(calculateItemsPerRow);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [calculateItemsPerRow]);
    // when the interval changes, scroll the virtual list to top to improve UX
    useEffect(() => {
        // attempt to find the virtual list DOM node and reset scrollTop
        const resetScroll = () => {
            // prefer an explicit ref if available
            const el = virtualListRef.current || document.querySelector('.rc-virtual-list');
            if (el) {
                try {
                    el.scrollTop = 0;
                }
                catch (e) {
                    console.error(e);
                }
            }
        };
        // Defer to next frame so the list has time to re-render with new data
        const id = requestAnimationFrame(() => requestAnimationFrame(resetScroll));
        // also fallback to a short timeout
        const t = setTimeout(resetScroll, 50);
        return () => {
            cancelAnimationFrame(id);
            clearTimeout(t);
        };
    }, [interval, sportType]);
    // compute list height = viewport height - filter container height
    useEffect(() => {
        const updateListHeight = () => {
            const filterH = filterRef.current?.clientHeight || 0;
            const containerEl = containerRef.current;
            let topOffset = 0;
            if (containerEl) {
                const rect = containerEl.getBoundingClientRect();
                topOffset = Math.max(0, rect.top);
            }
            const base = topOffset || filterH || 0;
            // Try to compute a dynamic bottom padding by checking the container's parent element's bottom
            let bottomPadding = 16; // fallback
            if (containerEl && containerEl.parentElement) {
                try {
                    const parentRect = containerEl.parentElement.getBoundingClientRect();
                    const containerRect = containerEl.getBoundingClientRect();
                    const distanceToParentBottom = Math.max(0, parentRect.bottom - containerRect.bottom);
                    // Use a small fraction of that distance (or clamp) to avoid huge paddings
                    bottomPadding = Math.min(48, Math.max(8, Math.round(distanceToParentBottom / 4)));
                }
                catch (e) {
                    console.error(e);
                }
            }
            const h = Math.max(100, window.innerHeight - base - bottomPadding);
            setListHeight(h);
        };
        // initial
        updateListHeight();
        // window resize
        window.addEventListener('resize', updateListHeight);
        // observe filter size changes
        const ro = new ResizeObserver(updateListHeight);
        if (filterRef.current)
            ro.observe(filterRef.current);
        return () => {
            window.removeEventListener('resize', updateListHeight);
            ro.disconnect();
        };
    }, []);
    // measure representative card height using a hidden sample and ResizeObserver
    useEffect(() => {
        const el = sampleRef.current;
        if (!el)
            return;
        const update = () => {
            const h = el.offsetHeight;
            if (h && h !== rowHeight)
                setRowHeight(h);
        };
        // initial
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [dataList, rowHeight]);
    const calcGroup = useMemo(() => {
        if (itemsPerRow < 1)
            return [];
        const groupLength = Math.ceil(dataList.length / itemsPerRow);
        const arr = [];
        for (let i = 0; i < groupLength; i++) {
            const start = i * itemsPerRow;
            arr.push(dataList.slice(start, start + itemsPerRow));
        }
        return arr;
    }, [dataList, itemsPerRow]);
    // compute a row width so we can center the VirtualList and keep cards left-aligned inside
    const rowWidth = itemsPerRow < 1
        ? '100%'
        : `${itemsPerRow * itemWidth + Math.max(0, itemsPerRow - 1) * gap}px`;
    const loading = itemsPerRow < 1 || !rowHeight;
    return (_jsxs("div", { className: styles.activityList, children: [_jsxs("div", { className: styles.filterContainer, ref: filterRef, children: [_jsx("button", { className: styles.smallHomeButton, onClick: handleHomeClick, children: HOME_PAGE_TITLE }), _jsx("select", { onChange: (e) => setSportType(e.target.value), value: sportType, children: sportTypeOptions.map((type) => (_jsx("option", { value: type, disabled: interval === 'life' && type !== 'all', children: type in TYPES_MAPPING ? TYPES_MAPPING[type] : type }, type))) }), _jsxs("select", { onChange: (e) => toggleInterval(e.target.value), value: interval, children: [_jsx("option", { value: "year", children: ACTIVITY_TOTAL.YEARLY_TITLE }), _jsx("option", { value: "month", children: ACTIVITY_TOTAL.MONTHLY_TITLE }), _jsx("option", { value: "week", children: ACTIVITY_TOTAL.WEEKLY_TITLE }), _jsx("option", { value: "day", children: ACTIVITY_TOTAL.DAILY_TITLE }), _jsx("option", { value: "life", children: "Life" })] })] }), interval === 'life' && (_jsx("div", { className: styles.lifeContainer, children: _jsxs(Suspense, { fallback: _jsx("div", { children: "Loading SVG..." }), children: [sportType === 'Run' && _jsx(RunningSvg, {}), sportType === 'Walk' && _jsx(WalkingSvg, {}), sportType === 'Hike' && _jsx(HikingSvg, {}), sportType === 'Ride' && _jsx(CyclingSvg, {}), sportType === 'Swim' && _jsx(SwimmingSvg, {}), sportType === 'Ski' && _jsx(SkiingSvg, {}), sportType === 'all' && _jsx(AllSvg, {})] }) })), interval !== 'life' && (_jsxs("div", { className: styles.summaryContainer, ref: containerRef, children: [_jsx("div", { style: {
                            position: 'absolute',
                            visibility: 'hidden',
                            pointerEvents: 'none',
                            height: 'auto',
                        }, ref: sampleRef, children: dataList[0] && (_jsx(ActivityCard, { period: dataList[0].period, summary: {
                                totalDistance: dataList[0].summary.totalDistance,
                                averageSpeed: dataList[0].summary.totalTime
                                    ? dataList[0].summary.totalDistance /
                                        (dataList[0].summary.totalTime / 3600)
                                    : 0,
                                totalTime: dataList[0].summary.totalTime,
                                count: dataList[0].summary.count,
                                maxDistance: dataList[0].summary.maxDistance,
                                maxSpeed: dataList[0].summary.maxSpeed,
                                location: dataList[0].summary.location,
                                totalElevationGain: SHOW_ELEVATION_GAIN
                                    ? dataList[0].summary.totalElevationGain
                                    : undefined,
                                averageHeartRate: dataList[0].summary.heartRateCount > 0
                                    ? dataList[0].summary.totalHeartRate /
                                        dataList[0].summary.heartRateCount
                                    : undefined,
                            }, dailyDistances: dataList[0].summary.dailyDistances, interval: interval, activityType: sportType, activities: interval === 'day'
                                ? dataList[0].summary.activities
                                : undefined }, dataList[0].period)) }), _jsx("div", { className: styles.summaryInner, children: _jsx("div", { style: { width: rowWidth }, children: loading ? (
                            // Use full viewport height (or viewport minus filter height if available) to avoid flicker
                            _jsx("div", { style: {
                                    height: filterRef.current
                                        ? `${Math.max(100, window.innerHeight - (filterRef.current.clientHeight || 0) - 40)}px`
                                        : '100vh',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }, children: _jsx("div", { style: {
                                        padding: 20,
                                        color: 'var(--color-run-table-thead)',
                                    }, children: LOADING_TEXT }) })) : (_jsx(VirtualList, { data: calcGroup, height: listHeight, itemHeight: rowHeight, itemKey: (row) => row[0]?.period ?? '', styles: VIRTUAL_LIST_STYLES, children: (row) => (_jsx("div", { ref: virtualListRef, className: styles.rowContainer, style: { gap: `${gap}px` }, children: row.map((cardData) => (_jsx(ActivityCard, { period: cardData.period, summary: {
                                            totalDistance: cardData.summary.totalDistance,
                                            averageSpeed: cardData.summary.totalTime
                                                ? cardData.summary.totalDistance /
                                                    (cardData.summary.totalTime / 3600)
                                                : 0,
                                            totalTime: cardData.summary.totalTime,
                                            count: cardData.summary.count,
                                            maxDistance: cardData.summary.maxDistance,
                                            maxSpeed: cardData.summary.maxSpeed,
                                            location: cardData.summary.location,
                                            totalElevationGain: SHOW_ELEVATION_GAIN
                                                ? cardData.summary.totalElevationGain
                                                : undefined,
                                            averageHeartRate: cardData.summary.heartRateCount > 0
                                                ? cardData.summary.totalHeartRate /
                                                    cardData.summary.heartRateCount
                                                : undefined,
                                        }, dailyDistances: cardData.summary.dailyDistances, interval: interval, activityType: sportType, activities: interval === 'day'
                                            ? cardData.summary.activities
                                            : undefined }, cardData.period))) })) }, `${sportType}-${interval}-${itemsPerRow}`)) }) })] }))] }));
};
export default ActivityList;
