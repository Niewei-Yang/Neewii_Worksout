import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ReactComponent as EndSvg } from '@assets/end.svg';
import { ReactComponent as StartSvg } from '@assets/start.svg';
import { Marker } from 'react-map-gl';
import styles from './style.module.css';
const RunMarker = ({ startLon, startLat, endLon, endLat, }) => {
    const size = 5;
    return (_jsxs(_Fragment, { children: [_jsx(Marker, { longitude: startLon, latitude: startLat, pitchAlignment: "viewport", children: _jsx("div", { style: {
                        transform: `translate(${-size / 2}px,${-size}px)`,
                        maxWidth: '25px',
                    }, children: _jsx(StartSvg, { className: styles.locationSVG }) }) }, "maker_start"), _jsx(Marker, { longitude: endLon, latitude: endLat, children: _jsx("div", { style: {
                        transform: `translate(${-size / 2}px,${-size}px)`,
                        maxWidth: '25px',
                    }, children: _jsx(EndSvg, { className: styles.locationSVG }) }) }, "maker_end")] }));
};
export default RunMarker;
