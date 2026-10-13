import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages';
import NotFound from './pages/404';
import ReactGA from 'react-ga4';
import {
  GOOGLE_ANALYTICS_TRACKING_ID,
  USE_GOOGLE_ANALYTICS,
} from './utils/const';
import '@/styles/index.css';
import { withOptionalGAPageTracking } from './utils/trackRoute';
import HomePage from '@/pages/total';
import { getHomeView } from '@/hooks/useHomeView';

const Dashboard = React.lazy(() => import('@/pages/dashboard'));

const HomeEntry = () => {
  const { search, hash } = useLocation();
  return getHomeView() === 'dashboard' ? (
    <Navigate to={{ pathname: '/dashboard', search, hash }} replace />
  ) : (
    <Index />
  );
};
const SummaryEntry = () => {
  const { search, hash } = useLocation();
  return getHomeView() === 'dashboard' ? (
    <Navigate to={{ pathname: '/dashboard/summary', search, hash }} replace />
  ) : (
    <HomePage />
  );
};

if (USE_GOOGLE_ANALYTICS) {
  ReactGA.initialize(GOOGLE_ANALYTICS_TRACKING_ID);
}

const routes = createBrowserRouter(
  [
    {
      path: '/',
      element: withOptionalGAPageTracking(<HomeEntry />),
    },
    {
      path: 'classic',
      element: withOptionalGAPageTracking(<Index />),
    },
    {
      path: 'dashboard/:section?',
      element: withOptionalGAPageTracking(
        <React.Suspense
          fallback={
            <div role="status" className="p-8">
              正在加载新版主页…
            </div>
          }
        >
          <Dashboard />
        </React.Suspense>
      ),
    },
    {
      path: 'summary',
      element: withOptionalGAPageTracking(<SummaryEntry />),
    },
    {
      path: 'classic/summary',
      element: withOptionalGAPageTracking(<HomePage />),
    },
    {
      path: '*',
      element: withOptionalGAPageTracking(<NotFound />),
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <RouterProvider router={routes} />
    </HelmetProvider>
  </React.StrictMode>
);
