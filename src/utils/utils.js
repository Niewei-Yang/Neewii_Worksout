import * as mapboxPolyline from '@mapbox/polyline';
import gcoord from 'gcoord';
import { WebMercatorViewport } from '@math.gl/web-mercator';
import { chinaCities } from '@/static/city';
import { MAIN_COLOR, MUNICIPALITY_CITIES_ARR, NEED_FIX_MAP, RUN_TITLES, VIRTUAL_RIDE_COLOR, HIKE_COLOR, SWIM_COLOR, ROWING_COLOR, ROAD_TRIP_COLOR, FLIGHT_COLOR, RUN_COLOR, KAYAKING_COLOR, SNOWBOARD_COLOR, TRAIL_RUN_COLOR, RICH_TITLE, MAP_TILE_STYLES, getMapTileVendorStyles, MAP_TILE_STYLE_DARK, getRuntimeSingleColor, RUN_TRAIL_COLOR, HIKING_COLOR, WALKING_COLOR, SWIMMING_COLOR, getCyclingColor, getRuntimeRunColor, } from './const';
import { getMapThemeFromCurrentTheme } from '@/hooks/useTheme';
const titleForShow = (run) => {
    const date = run.start_date_local.slice(0, 11);
    const distance = (run.distance / 1000.0).toFixed(2);
    let name = 'Run';
    if (run.name) {
        name = run.name;
    }
    return `${name} ${date} ${distance} KM ${!run.summary_polyline ? '(No map data for this workout)' : ''}`;
};
const formatPace = (d) => {
    if (Number.isNaN(d) || d == 0)
        return '0';
    const pace = (1000.0 / 60.0) * (1.0 / d);
    const minutes = Math.floor(pace);
    const seconds = Math.floor((pace - minutes) * 60.0);
    return `${minutes}'${seconds.toFixed(0).toString().padStart(2, '0')}"`;
};
const SPEED_DISPLAY_TYPES = new Set([
    'Ride',
    'Indoor Ride',
    'VirtualRide',
    'RoadTrip',
    'Train',
]);
const shouldDisplaySpeed = (type) => SPEED_DISPLAY_TYPES.has(type);
const formatSpeed = (metersPerSecond) => {
    if (Number.isNaN(metersPerSecond) || metersPerSecond == 0)
        return '0.0 km/h';
    return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
};
const formatPaceOrSpeed = (metersPerSecond, type) => shouldDisplaySpeed(type)
    ? formatSpeed(metersPerSecond)
    : formatPace(metersPerSecond);
const normalizeActivityType = (type) => type.replace(/\s+/g, '').toLowerCase();
const TRANSPORT_ACTIVITY_TYPES = new Set(['train', 'roadtrip', 'flight']);
const isTransportActivity = (type) => TRANSPORT_ACTIVITY_TYPES.has(normalizeActivityType(type));
const TOTAL_EXCLUDED_ACTIVITY_TYPES = new Set(['RoadTrip', 'Flight', 'Train']);
const SUMMARY_EXCLUDED_ACTIVITY_TYPES = new Set(['Flight', 'Train']);
const DISPLAY_ONLY_ACTIVITY_TYPES = new Set(['Flight', 'Train']);
const isActivityExcludedFromTotals = (type) => TOTAL_EXCLUDED_ACTIVITY_TYPES.has(type) || isTransportActivity(type);
const isActivityExcludedFromSummary = (type) => SUMMARY_EXCLUDED_ACTIVITY_TYPES.has(type);
const isActivityDisplayOnly = (type) => DISPLAY_ONLY_ACTIVITY_TYPES.has(type);
const convertMovingTime2Sec = (moving_time) => {
    if (!moving_time) {
        return 0;
    }
    // moving_time : '2 days, 12:34:56' or '12:34:56';
    const splits = moving_time.split(', ');
    const days = splits.length == 2 ? parseInt(splits[0]) : 0;
    const time = splits.splice(-1)[0];
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
    return totalSeconds;
};
const formatRunTime = (moving_time) => {
    const totalSeconds = convertMovingTime2Sec(moving_time);
    const seconds = totalSeconds % 60;
    const minutes = (totalSeconds - seconds) / 60;
    if (minutes === 0) {
        return seconds + 's';
    }
    return minutes + 'min';
};
// for scroll to the map
const scrollToMap = () => {
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
        mapContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};
const extractCities = (str) => {
    const locations = [];
    let match;
    const pattern = /([\u4e00-\u9fa5]{2,}(市|自治州|特别行政区|盟|地区))/g;
    while ((match = pattern.exec(str)) !== null) {
        locations.push(match[0]);
    }
    return locations;
};
const extractDistricts = (str) => {
    const locations = [];
    let match;
    const pattern = /([\u4e00-\u9fa5]{2,}(区|县))/g;
    while ((match = pattern.exec(str)) !== null) {
        locations.push(match[0]);
    }
    return locations;
};
const extractCoordinate = (str) => {
    const pattern = /'latitude': ([-]?\d+\.\d+).*?'longitude': ([-]?\d+\.\d+)/;
    const match = str.match(pattern);
    if (match) {
        const latitude = parseFloat(match[1]);
        const longitude = parseFloat(match[2]);
        return [longitude, latitude];
    }
    return null;
};
const cities = chinaCities.map((c) => c.name);
const locationCache = new Map();
// what about oversea?
const locationForRun = (run) => {
    if (locationCache.has(run.run_id)) {
        return locationCache.get(run.run_id);
    }
    let location = run.location_country;
    let [city, province, country] = ['', '', ''];
    let coordinate = null;
    if (location) {
        // Only for Chinese now
        // should filter 臺灣
        const cityMatch = extractCities(location);
        const provinceMatch = location.match(/[\u4e00-\u9fa5]{2,}(省|自治区)/);
        if (cityMatch) {
            city = cities.find((value) => cityMatch.includes(value));
            if (!city) {
                city = '';
            }
        }
        if (provinceMatch) {
            [province] = provinceMatch;
            // try to extract city coord from location_country info
            coordinate = extractCoordinate(location);
        }
        const l = location.split(',');
        // or to handle keep location format
        let countryMatch = l[l.length - 1].match(/[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/);
        if (!countryMatch && l.length >= 3) {
            countryMatch = l[2].match(/[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/);
        }
        if (countryMatch) {
            [country] = countryMatch;
        }
    }
    if (MUNICIPALITY_CITIES_ARR.includes(city)) {
        province = city;
        if (location) {
            const districtMatch = extractDistricts(location);
            if (districtMatch.length > 0) {
                city = districtMatch[districtMatch.length - 1];
            }
        }
    }
    const r = { country, province, city, coordinate };
    locationCache.set(run.run_id, r);
    return r;
};
const intComma = (x = '') => {
    if (x.toString().length <= 5) {
        return x;
    }
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const pathForRun = (run) => {
    try {
        if (!run.summary_polyline) {
            return [];
        }
        const c = mapboxPolyline.decode(run.summary_polyline);
        // reverse lat long for mapbox
        c.forEach((arr) => {
            [arr[0], arr[1]] = !NEED_FIX_MAP
                ? [arr[1], arr[0]]
                : gcoord.transform([arr[1], arr[0]], gcoord.GCJ02, gcoord.WGS84);
        });
        // try to use location city coordinate instead , if runpath is incomplete
        if (c.length === 2 && String(c[0]) === String(c[1])) {
            const { coordinate } = locationForRun(run);
            if (coordinate?.[0] && coordinate?.[1]) {
                return [coordinate, coordinate];
            }
        }
        return c;
    }
    catch (_err) {
        return [];
    }
};
const geoJsonForRuns = (runs) => ({
    type: 'FeatureCollection',
    features: runs.map((run) => {
        const points = pathForRun(run);
        const color = colorForRun(run);
        return {
            type: 'Feature',
            properties: {
                color: color,
                activityType: run.type,
            },
            geometry: {
                type: 'LineString',
                coordinates: points,
            },
        };
    }),
});
const geoJsonForMap = async () => {
    const [{ chinaGeojson }, worldGeoJson] = await Promise.all([
        import('@/static/run_countries'),
        import('@surbowl/world-geo-json-zh/world.zh.json'),
    ]);
    return {
        type: 'FeatureCollection',
        features: [
            ...worldGeoJson.default.features,
            ...chinaGeojson.features,
        ],
    };
};
const titleForType = (type) => {
    switch (type) {
        case 'Run':
            return RUN_TITLES.RUN_TITLE;
        case 'Full Marathon':
            return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
        case 'Half Marathon':
            return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
        case 'Trail Run':
            return RUN_TITLES.TRAIL_RUN_TITLE;
        case 'Ride':
            return RUN_TITLES.RIDE_TITLE;
        case 'Indoor Ride':
            return RUN_TITLES.INDOOR_RIDE_TITLE;
        case 'VirtualRide':
            return RUN_TITLES.VIRTUAL_RIDE_TITLE;
        case 'Hike':
            return RUN_TITLES.HIKE_TITLE;
        case 'Rowing':
            return RUN_TITLES.ROWING_TITLE;
        case 'Swim':
            return RUN_TITLES.SWIM_TITLE;
        case 'RoadTrip':
            return RUN_TITLES.ROAD_TRIP_TITLE;
        case 'Flight':
            return RUN_TITLES.FLIGHT_TITLE;
        case 'Train':
            return RUN_TITLES.TRAIN_TITLE;
        case 'Kayaking':
            return RUN_TITLES.KAYAKING_TITLE;
        case 'Snowboard':
            return RUN_TITLES.SNOWBOARD_TITLE;
        case 'Ski':
            return RUN_TITLES.SKI_TITLE;
        default:
            return RUN_TITLES.RUN_TITLE;
    }
};
const colorForRun = (run) => {
    // 为跑步和骑行分别准备动态颜色变量
    const dynamicRunColor = getRuntimeRunColor();
    const dynamicCyclingColor = getCyclingColor();
    switch (run.type) {
        case 'Run': {
            if (run.subtype === 'trail') {
                return RUN_TRAIL_COLOR;
            }
            // 普通跑步（generic 或其他）统一用动态颜色
            return dynamicRunColor;
        }
        case 'cycling':
        case 'Ride': {
            return dynamicCyclingColor;
        }
        case 'hiking':
        case 'Hike':
            return HIKING_COLOR;
        case 'walking':
        case 'Walk':
            return WALKING_COLOR;
        case 'swimming':
        case 'Swim':
            return SWIMMING_COLOR;
        case 'RoadTrip':
            return colorFromType('RoadTrip');
        case 'Flight':
            return colorFromType('Flight');
        case 'Train':
            return colorFromType('Train');
        default:
            return MAIN_COLOR;
    }
};
const typeForRun = (run) => {
    const type = run.type;
    var distance = run.distance / 1000;
    switch (type) {
        case 'Run':
            if (distance >= 40) {
                return 'Full Marathon';
            }
            else if (distance > 20) {
                return 'Half Marathon';
            }
            return 'Run';
        case 'Trail Run':
            if (distance >= 40) {
                return 'Full Marathon';
            }
            else if (distance > 20) {
                return 'Half Marathon';
            }
            return 'Trail Run';
        default:
            return type;
    }
};
const titleForRun = (run) => {
    const type = run.type;
    if (RICH_TITLE) {
        // 1. try to use user defined name
        if (run.name != '') {
            return run.name;
        }
        // 2. try to use location+type if the location is available, eg. 'Shanghai Run'
        const { city } = locationForRun(run);
        const activity_sport = titleForType(typeForRun(run));
        if (city && city.length > 0 && activity_sport.length > 0) {
            return `${city} ${activity_sport}`;
        }
    }
    // 3. use time+length if location or type is not available
    if (type == 'Run' || type == 'Trail Run') {
        const runDistance = run.distance / 1000;
        if (runDistance >= 40) {
            return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
        }
        else if (runDistance > 20) {
            return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
        }
    }
    return titleForType(type);
};
const colorFromType = (workoutType) => {
    switch (workoutType) {
        case 'Run':
            return getRuntimeSingleColor(RUN_COLOR);
        case 'Trail Run':
            return getRuntimeSingleColor(TRAIL_RUN_COLOR);
        case 'Ride':
        case 'Indoor Ride':
            return getCyclingColor();
        case 'VirtualRide':
            return getRuntimeSingleColor(VIRTUAL_RIDE_COLOR);
        case 'Hike':
            return getRuntimeSingleColor(HIKE_COLOR);
        case 'Rowing':
            return getRuntimeSingleColor(ROWING_COLOR);
        case 'Swim':
            return getRuntimeSingleColor(SWIM_COLOR);
        case 'RoadTrip':
            return getRuntimeSingleColor(ROAD_TRIP_COLOR);
        case 'Flight':
            return getRuntimeSingleColor(FLIGHT_COLOR);
        case 'Train':
            return getRuntimeSingleColor(ROAD_TRIP_COLOR);
        case 'Kayaking':
            return getRuntimeSingleColor(KAYAKING_COLOR);
        case 'Snowboard':
        case 'Ski':
            return getRuntimeSingleColor(SNOWBOARD_COLOR);
        default:
            return getRuntimeSingleColor();
    }
};
const getBoundsForGeoData = (geoData) => {
    const { features } = geoData;
    let points = [];
    // find first have data
    for (const f of features) {
        if (f.geometry.coordinates.length) {
            points = f.geometry.coordinates;
            break;
        }
    }
    if (points.length === 0) {
        return { longitude: 20, latitude: 20, zoom: 3 };
    }
    if (points.length === 2 && String(points[0]) === String(points[1])) {
        return { longitude: points[0][0], latitude: points[0][1], zoom: 9 };
    }
    // Calculate corner values of bounds
    const pointsLong = points.map((point) => point[0]);
    const pointsLat = points.map((point) => point[1]);
    const cornersLongLat = [
        [Math.min(...pointsLong), Math.min(...pointsLat)],
        [Math.max(...pointsLong), Math.max(...pointsLat)],
    ];
    const viewState = new WebMercatorViewport({
        width: 800,
        height: 600,
    }).fitBounds(cornersLongLat, { padding: 200 });
    let { longitude, latitude, zoom } = viewState;
    if (features.length > 1) {
        zoom = 11.5;
    }
    return { longitude, latitude, zoom };
};
const filterYearRuns = (run, year) => {
    if (run && run.start_date_local) {
        return run.start_date_local.slice(0, 4) === year;
    }
    return false;
};
const filterCityRuns = (run, city) => {
    if (run && run.location_country) {
        return run.location_country.includes(city);
    }
    return false;
};
const filterTitleRuns = (run, title) => titleForRun(run) === title;
const filterTypeRuns = (run, type) => {
    switch (type) {
        case 'Full Marathon':
            return ((run.type === 'Run' || run.type === 'Trail Run') && run.distance > 40000);
        case 'Half Marathon':
            return ((run.type === 'Run' || run.type === 'Trail Run') &&
                run.distance < 40000 &&
                run.distance > 20000);
        default:
            return run.type === type;
    }
};
const filterAndSortRuns = (activities, item, filterFunc, sortFunc, item2, filterFunc2) => {
    let s = activities;
    if (item !== 'Total') {
        s = activities.filter((run) => filterFunc(run, item));
    }
    if (filterFunc2 != null && item2 != null) {
        s = s.filter((run) => filterFunc2(run, item2));
    }
    return s.sort(sortFunc);
};
const sortDateFunc = (a, b) => {
    return (new Date(b.start_date_local.replace(' ', 'T')).getTime() -
        new Date(a.start_date_local.replace(' ', 'T')).getTime());
};
const sortDateFuncReverse = (a, b) => sortDateFunc(b, a);
const getMapStyle = (vendor, styleName, token) => {
    const vendorStyles = getMapTileVendorStyles(vendor);
    const style = vendorStyles?.[styleName];
    if (!style) {
        return MAP_TILE_STYLES.default;
    }
    if (vendor === 'maptiler' || vendor === 'stadiamaps') {
        return style + token;
    }
    return style;
};
const isTouchDevice = () => {
    if (typeof window === 'undefined')
        return false;
    return ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth <= 768); // Consider small screens as touch devices
};
/**
 * Determines the appropriate map theme based on current settings
 * @returns The map theme style to use
 */
const getMapTheme = () => {
    if (typeof window === 'undefined')
        return MAP_TILE_STYLE_DARK;
    // Check for explicit theme in DOM
    const dataTheme = document.documentElement.getAttribute('data-theme');
    // Check for saved theme in localStorage
    const savedTheme = localStorage.getItem('theme');
    // Determine theme based on priority:
    // 1. DOM attribute
    // 2. localStorage
    // 3. Default to dark theme
    if (dataTheme) {
        return getMapThemeFromCurrentTheme(dataTheme);
    }
    else if (savedTheme) {
        return getMapThemeFromCurrentTheme(savedTheme);
    }
    else {
        return getMapThemeFromCurrentTheme('dark');
    }
};
export { titleForShow, formatPace, formatSpeed, formatPaceOrSpeed, shouldDisplaySpeed, isTransportActivity, isActivityExcludedFromTotals, isActivityExcludedFromSummary, isActivityDisplayOnly, scrollToMap, locationForRun, intComma, pathForRun, geoJsonForRuns, geoJsonForMap, titleForRun, typeForRun, titleForType, filterYearRuns, filterCityRuns, filterTitleRuns, filterAndSortRuns, sortDateFunc, sortDateFuncReverse, getBoundsForGeoData, filterTypeRuns, colorFromType, formatRunTime, convertMovingTime2Sec, getMapStyle, isTouchDevice, getMapTheme, };
