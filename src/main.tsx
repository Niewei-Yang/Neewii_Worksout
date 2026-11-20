import React, { lazy, Suspense, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useRouteError,
} from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ReactGA from 'react-ga4';
import loadRecords from 'virtual:activity-downloads';
import { ActivityRecords } from './hooks/useActivityRecords';
import { ActivityDownloadError } from './utils/downloadActivities';
import {
  GOOGLE_ANALYTICS_TRACKING_ID,
  USE_GOOGLE_ANALYTICS,
} from './utils/const';
import { withOptionalGAPageTracking } from './utils/trackRoute';
import { getHomeView } from './hooks/useHomeView';
import '@/styles/index.css';

let records: ReturnType<typeof loadRecords> | undefined;
let downloadStatus = '';
const progress = new EventTarget();
function reportProgress(message: string) {
  downloadStatus = message;
  progress.dispatchEvent(new Event('change'));
}
function subscribe(listener: () => void) {
  progress.addEventListener('change', listener);
  return () => progress.removeEventListener('change', listener);
}

function activityPage(
  loadPage: () => Promise<{ default: React.ComponentType }>
) {
  return lazy(async () => {
    records ??= loadRecords(reportProgress)
      .then((activities) => {
        reportProgress('');
        return activities;
      })
      .catch((error) => {
        reportProgress('');
        records = undefined;
        throw error;
      });
    const [{ default: Page }, activities] = await Promise.all([
      loadPage(),
      records,
    ]);
    return {
      default: () => (
        <ActivityRecords.Provider value={activities}>
          <Page />
        </ActivityRecords.Provider>
      ),
    };
  });
}

const Classic = activityPage(() => import('./pages'));
const Summary = activityPage(() => import('./pages/total'));
const Dashboard = activityPage(() => import('./pages/dashboard'));
const NotFound = lazy(() => import('./pages/404'));

function PreferredPage({ summary = false }: { summary?: boolean }) {
  const { search, hash } = useLocation();
  if (getHomeView() === 'dashboard') {
    return (
      <Navigate
        to={{
          pathname: summary ? '/dashboard/summary' : '/dashboard',
          search,
          hash,
        }}
        replace
      />
    );
  }
  return summary ? <Summary /> : <Classic />;
}

function LoadingStatus({ error }: { error?: unknown }) {
  const status = useSyncExternalStore(subscribe, () => downloadStatus);
  const check = new URL(
    import.meta.env.BASE_URL + 'connection-check.html',
    location.origin
  );
  if (error instanceof ActivityDownloadError)
    check.searchParams.set('file', error.url);
  return (
    <main className="mx-auto mt-24 max-w-lg p-6">
      <p role="status">
        {error ? '页面未能打开。' : '正在加载页面和运动记录…'}
      </p>
      {!error && status && <p>{status}</p>}
      {error instanceof Error && <p className="break-words">{error.message}</p>}
      <p className="mt-3">
        <button type="button" onClick={() => location.reload()}>
          重新加载
        </button>
        {' · '}
        <a href={check.href}>检查页面资源连接</a>
      </p>
    </main>
  );
}

function RouteError() {
  return <LoadingStatus error={useRouteError()} />;
}

if (USE_GOOGLE_ANALYTICS) ReactGA.initialize(GOOGLE_ANALYTICS_TRACKING_ID);

const routes = createBrowserRouter(
  [
    {
      element: (
        <Suspense fallback={<LoadingStatus />}>
          {withOptionalGAPageTracking(<Outlet />)}
        </Suspense>
      ),
      errorElement: <RouteError />,
      children: [
        { index: true, element: <PreferredPage /> },
        { path: 'classic', element: <Classic /> },
        { path: 'dashboard/:section?', element: <Dashboard /> },
        { path: 'summary', element: <PreferredPage summary /> },
        { path: 'classic/summary', element: <Summary /> },
        { path: '*', element: <NotFound /> },
      ],
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
