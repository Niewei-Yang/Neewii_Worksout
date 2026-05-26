import { jsx as _jsx } from "react/jsx-runtime";
import styles from './style.module.css';
const LightsControl = ({ setLights, lights }) => {
    return (_jsx("div", { className: 'mapboxgl-ctrl mapboxgl-ctrl-group  ' + styles.lights, children: _jsx("button", { className: `${lights ? styles.lightsOn : styles.lightsOff}`, onClick: () => setLights(!lights), children: _jsx("span", { className: "mapboxgl-ctrl-icon", "aria-hidden": "true", title: 'Turn ' + `${lights ? 'off' : 'on'}` + ' the Light' }) }) }));
};
export default LightsControl;
