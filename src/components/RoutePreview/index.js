import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { pathForRun, colorFromType } from '@/utils/utils';
import styles from './style.module.css';
const RoutePreview = ({ activities, className, }) => {
    // Filter activities that have polyline data
    const activitiesWithRoutes = activities.filter((activity) => activity.summary_polyline);
    if (activitiesWithRoutes.length === 0) {
        return (_jsx("div", { className: `${styles.routePreview} ${className || ''}`, children: _jsx("div", { className: styles.noRoute, children: "\u6682\u65E0\u8DEF\u7EBF\u6570\u636E" }) }));
    }
    // Get all route coordinates
    const allCoordinates = activitiesWithRoutes.map((activity) => {
        const path = pathForRun(activity);
        const color = colorFromType(activity.type);
        return { path, color };
    });
    // Calculate bounding box for all routes
    const allPoints = allCoordinates.flatMap((route) => route.path);
    if (allPoints.length === 0) {
        return (_jsx("div", { className: `${styles.routePreview} ${className || ''}`, children: _jsx("div", { className: styles.noRoute, children: "\u8DEF\u7EBF\u6570\u636E\u65E0\u6548" }) }));
    }
    const lats = allPoints.map((point) => point[1]);
    const lngs = allPoints.map((point) => point[0]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    // Add padding to bounds
    const padding = 0.001;
    const bounds = {
        minLat: minLat - padding,
        maxLat: maxLat + padding,
        minLng: minLng - padding,
        maxLng: maxLng + padding,
    };
    const boundsWidth = bounds.maxLng - bounds.minLng;
    const boundsHeight = bounds.maxLat - bounds.minLat;
    // SVG dimensions
    const svgWidth = 250;
    const svgHeight = 150;
    const svgPadding = 10;
    const drawWidth = svgWidth - 2 * svgPadding;
    const drawHeight = svgHeight - 2 * svgPadding;
    // Convert coordinate to SVG coordinate
    const coordToSvg = (lng, lat) => {
        const x = svgPadding + ((lng - bounds.minLng) / boundsWidth) * drawWidth;
        const y = svgPadding + ((bounds.maxLat - lat) / boundsHeight) * drawHeight;
        return [x, y];
    };
    return (_jsx("div", { className: `${styles.routePreview} ${className || ''}`, children: _jsxs("svg", { width: svgWidth, height: svgHeight, className: styles.routeSvg, children: [_jsx("rect", { width: svgWidth, height: svgHeight, fill: "var(--color-activity-card)" }), allCoordinates.map((route, routeIndex) => {
                    if (route.path.length < 2)
                        return null;
                    const pathString = route.path
                        .map((coord, index) => {
                        const [x, y] = coordToSvg(coord[0], coord[1]);
                        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                        .join(' ');
                    return (_jsxs("g", { children: [_jsx("path", { d: pathString, fill: "none", stroke: route.color, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", opacity: "0.8" }), route.path.length > 0 && (_jsx("circle", { cx: coordToSvg(route.path[0][0], route.path[0][1])[0], cy: coordToSvg(route.path[0][0], route.path[0][1])[1], r: "3", fill: "#2ecc71", stroke: "white", strokeWidth: "1" })), route.path.length > 1 && (_jsx("circle", { cx: coordToSvg(route.path[route.path.length - 1][0], route.path[route.path.length - 1][1])[0], cy: coordToSvg(route.path[route.path.length - 1][0], route.path[route.path.length - 1][1])[1], r: "3", fill: "#e74c3c", stroke: "white", strokeWidth: "1" }))] }, routeIndex));
                })] }) }));
};
export default RoutePreview;
