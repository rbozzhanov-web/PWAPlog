import type { UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import type { PilotLogbookDb } from '../db/database';
import { HomePage } from '../features/home/HomePage';
import { LogbookPage } from '../features/logbook/LogbookPage';
import { PayPage } from '../features/pay/PayPage';
import { RosterPage } from '../features/roster/RosterPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const items = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/roster', label: 'Roster', icon: '✈' },
  { to: '/pay', label: 'Pay', icon: '₸' },
  { to: '/logbook', label: 'Logbook', ariaLabel: 'Open flight records', icon: '◷' },
  { to: '/settings', label: 'More', icon: '•••' },
];

function scrollElement(element: HTMLElement, options: ScrollToOptions) {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo(options);
    return;
  }
  if (options.top !== undefined) element.scrollTop = options.top;
  if (options.left !== undefined) element.scrollLeft = options.left;
}

interface AppFrameProps {
  db: PilotLogbookDb;
}

export function AppFrame({ db }: AppFrameProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const pagerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const settleTimer = useRef<number | undefined>(undefined);
  const nearestIndex = useRef(0);
  const routeIndex = items.findIndex((item) => item.to === location.pathname);
  const isPrimaryRoute = routeIndex >= 0;
  const fallbackIndex = location.pathname.startsWith('/flight/') ? 1
    : location.pathname.startsWith('/pay') ? 2
      : location.pathname.startsWith('/logbook') || location.pathname.startsWith('/import/') ? 3
        : location.pathname.startsWith('/settings') ? 4 : 0;
  const [visualIndex, setVisualIndex] = useState(routeIndex >= 0 ? routeIndex : fallbackIndex);

  const displayProgress = useCallback((value: number) => {
    navRef.current?.style.setProperty('--tab-progress', String(value));
  }, []);

  const resetPage = useCallback((index: number) => {
    const page = pageRefs.current[index];
    if (index !== 1 && page) scrollElement(page, { top: 0, behavior: 'auto' });
  }, []);

  const settleAtCurrentPage = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager?.clientWidth) return;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(pager.scrollLeft / pager.clientWidth)));
    nearestIndex.current = index;
    setVisualIndex(index);
    displayProgress(index);
    resetPage(index);
    if (location.pathname !== items[index].to) navigate(items[index].to);
  }, [displayProgress, location.pathname, navigate, resetPage]);

  useLayoutEffect(() => {
    if (!isPrimaryRoute) {
      setVisualIndex(fallbackIndex);
      displayProgress(fallbackIndex);
      return;
    }
    const pager = pagerRef.current;
    if (!pager) return;
    window.clearTimeout(settleTimer.current);
    nearestIndex.current = routeIndex;
    pager.scrollLeft = routeIndex * pager.clientWidth;
    setVisualIndex(routeIndex);
    displayProgress(routeIndex);
  }, [displayProgress, fallbackIndex, isPrimaryRoute, routeIndex]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const handlePagerScroll = (event: UIEvent<HTMLDivElement>) => {
    const pager = event.currentTarget;
    if (!pager.clientWidth) return;
    const nextProgress = Math.max(0, Math.min(items.length - 1, pager.scrollLeft / pager.clientWidth));
    const nextNearest = Math.round(nextProgress);
    displayProgress(nextProgress);
    if (nextNearest !== nearestIndex.current) {
      nearestIndex.current = nextNearest;
      setVisualIndex(nextNearest);
      resetPage(nextNearest);
    }
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settleAtCurrentPage, 90);
  };

  const selectTab = (index: number) => {
    if (!isPrimaryRoute) {
      if (index !== 1) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      navigate(items[index].to);
      return;
    }
    const pager = pagerRef.current;
    if (!pager) return;
    if (index === nearestIndex.current) {
      resetPage(index);
      return;
    }
    resetPage(index);
    scrollElement(pager, { left: index * pager.clientWidth, behavior: 'smooth' });
  };

  const openTabFromTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  return (
    <div className="app-frame">
      <div className="app-wallpaper" aria-hidden="true" />
      <div className="app-frame__content">
        {isPrimaryRoute ? <div className="primary-tab-pager" onScroll={handlePagerScroll} ref={pagerRef}>
          <div aria-hidden={visualIndex !== 0} className="primary-tab-pager__page" inert={visualIndex !== 0} ref={(element) => { pageRefs.current[0] = element; }}><HomePage db={db} /></div>
          <div aria-hidden={visualIndex !== 1} className="primary-tab-pager__page" inert={visualIndex !== 1} ref={(element) => { pageRefs.current[1] = element; }}><RosterPage isActive={routeIndex === 1} /></div>
          <div aria-hidden={visualIndex !== 2} className="primary-tab-pager__page" inert={visualIndex !== 2} ref={(element) => { pageRefs.current[2] = element; }}><PayPage db={db} /></div>
          <div aria-hidden={visualIndex !== 3} className="primary-tab-pager__page" inert={visualIndex !== 3} ref={(element) => { pageRefs.current[3] = element; }}><LogbookPage db={db} /></div>
          <div aria-hidden={visualIndex !== 4} className="primary-tab-pager__page" inert={visualIndex !== 4} ref={(element) => { pageRefs.current[4] = element; }}><SettingsPage db={db} /></div>
        </div> : <Outlet />}
      </div>
      <nav
        className="tab-dock tab-dock--five"
        aria-label="Primary navigation"
        ref={navRef}
      >
        <span className="tab-dock__indicator" aria-hidden="true" />
        {items.map((item, index) => (
          <NavLink
            className={`tab-dock__item${visualIndex === index ? ' tab-dock__item--active' : ''}`}
            end={item.end}
            key={item.to}
            to={item.to}
            aria-label={item.ariaLabel}
            onClick={(event) => {
              if (isPrimaryRoute) {
                event.preventDefault();
                selectTab(index);
              } else if (item.to === '/roster') {
                navigate(item.to);
                event.preventDefault();
              } else {
                openTabFromTop();
              }
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span aria-hidden={Boolean(item.ariaLabel)}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
