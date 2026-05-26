import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages';
import NotFound from './pages/404';
import ReactGA from 'react-ga4';
import { GOOGLE_ANALYTICS_TRACKING_ID, USE_GOOGLE_ANALYTICS, } from './utils/const';
import '@/styles/index.css';
import { withOptionalGAPageTracking } from './utils/trackRoute';
import HomePage from '@/pages/total';
if (USE_GOOGLE_ANALYTICS) {
    ReactGA.initialize(GOOGLE_ANALYTICS_TRACKING_ID);
}
const routes = createBrowserRouter([
    {
        path: '/',
        element: withOptionalGAPageTracking(_jsx(Index, {})),
    },
    {
        path: 'summary',
        element: withOptionalGAPageTracking(_jsx(HomePage, {})),
    },
    {
        path: '*',
        element: withOptionalGAPageTracking(_jsx(NotFound, {})),
    },
], { basename: import.meta.env.BASE_URL });
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(HelmetProvider, { children: _jsx(RouterProvider, { router: routes }) }) }));
