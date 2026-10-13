import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import styles from './style.module.css';

const HomeViewSwitch = () => {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const dashboard = pathname.startsWith('/dashboard');
  const summary = pathname.endsWith('/summary') || pathname === '/summary';
  const classicPath = summary ? '/classic/summary' : '/classic';
  const dashboardPath = summary ? '/dashboard/summary' : '/dashboard';
  const switchView = (event: MouseEvent<HTMLAnchorElement>, next: string) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    // The classic map updates activity hashes through the History API.
    navigate({
      pathname: next,
      search: window.location.search,
      hash: window.location.hash,
    });
  };

  return (
    <div className={styles.switch} role="group" aria-label="主页版本">
      <Link
        to={{ pathname: classicPath, search, hash }}
        onClick={(event) => switchView(event, classicPath)}
        aria-current={dashboard ? undefined : 'page'}
      >
        经典版
      </Link>
      <Link
        to={{ pathname: dashboardPath, search, hash }}
        onClick={(event) => switchView(event, dashboardPath)}
        aria-current={dashboard ? 'page' : undefined}
      >
        新版
      </Link>
    </div>
  );
};

export default HomeViewSwitch;
