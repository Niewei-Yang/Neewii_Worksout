import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import usePageTracking from '../hooks/usePageTracking';
import ReactGA from 'react-ga4';
import { USE_GOOGLE_ANALYTICS } from './const';
const TrackPageRoute = ({ children, }) => {
    if (ReactGA.isInitialized) {
        usePageTracking();
    }
    return _jsx(_Fragment, { children: children });
};
export const withOptionalGAPageTracking = (element) => {
    if (USE_GOOGLE_ANALYTICS) {
        return _jsx(TrackPageRoute, { children: element });
    }
    return element;
};
