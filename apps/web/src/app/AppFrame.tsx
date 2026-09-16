import type { UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import type { PilotLogbookDb } from '../db/database';
import { HomePage } from '../features/home/HomePage';
import { LogbookPage } from '../features/logbook/LogbookPage';
import { PayPage } from '../features/pay/PayPage';
import { loadAimsRoster } from '../features/roster/aims';
import { RosterPage } from '../features/roster/RosterPage';
import { SettingsPage } from '../features/settings/SettingsPage';

type ThemePreference = 'system' | 'light' | 'dark';

const themeStorageKey = 'escrew.theme-preference.v1';

const items = [
  { to: '/', label: 'Home', title: 'eScrew', icon: '⌂', end: true },
  { to: '/roster', label: 'Roster', title: 'Roster', icon: '✈' },
  { to: '/pay', label: 'Pay', title: 'Pay', icon: '₸' },
  { to: '/logbook', label: 'Logbook', title: 'Logbook', ariaLabel: 'Open flight records', icon: '◷' },
  { to: '/settings', label: 'More', title: 'More', icon: '•••' },
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
  const verticalAnimations = useRef<Array<number | undefined>>([]);
  const lastProgress = useRef(0);
  const preparedPage = useRef<number | undefined>(undefined);
  const nearestIndex = useRef(0);
  const routeIndex = items.findIndex((item) => item.to === location.pathname);
  const isPrimaryRoute = routeIndex >= 0;
  const fallbackIndex = location.pathname.startsWith('/flight/') ? 1
    : location.pathname.startsWith('/pay') ? 2
      : location.pathname.startsWith('/logbook') || location.pathname.startsWith('/import/') ? 3
        : location.pathname.startsWith('/settings') ? 4 : 0;
  const [visualIndex, setVisualIndex] = useState(routeIndex >= 0 ? routeIndex : fallbackIndex);
  const [hasAimsRoster, setHasAimsRoster] = useState(() => Boolean(loadAimsRoster()));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const value = window.localStorage.getItem(themeStorageKey);
      return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  const usesDarkTheme = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);
  const launchRouteHandled = useRef(false);
  // Only a genuine deep link and an unsaved draft survive the reset. Opening back into a saved
  // logbook entry doesn't carry the same "you'd lose real work" risk a fresh draft does, and it
  // was the actual bug report: a pilot who'd last been on that entry kept reopening onto it,
  // which reads as the app always landing on the Logbook tab rather than Home.
  const isDirectTaskRoute = location.pathname.startsWith('/import/')
    || location.pathname.startsWith('/flight/')
    || location.pathname === '/logbook/new';
  const resetToHome = useCallback(() => {
    if (location.pathname !== '/' && !isDirectTaskRoute) navigate('/', { replace: true });
  }, [isDirectTaskRoute, location.pathname, navigate]);

  // A fresh PWA/document launch always starts at Home.
  //
  // Deliberately an effect and not a layout effect: useNavigate arms itself in a passive effect,
  // so a navigate() issued during the layout phase of the first render is dropped with only a
  // console warning, and the launch route survived untouched.
  useEffect(() => {
    if (launchRouteHandled.current) return;
    launchRouteHandled.current = true;
    resetToHome();
  }, [resetToHome]);

  // Backgrounding rather than quitting is the common case on a phone, and it never re-mounts this
  // component, so the effect above alone left the app reopening on whatever tab it was backgrounded
  // on. Resetting while hidden, rather than when it becomes visible again, means the tab has already
  // changed by the time the pilot looks at the screen instead of it flashing in front of them.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetToHome();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [resetToHome]);

  const displayProgress = useCallback((value: number) => {
    navRef.current?.style.setProperty('--tab-progress', String(value));
  }, []);

  const resetPage = useCallback((index: number, behavior: ScrollBehavior = 'auto') => {
    const page = pageRefs.current[index];
    if (index === 1 || !page) return;
    const activeAnimation = verticalAnimations.current[index];
    if (activeAnimation !== undefined) window.cancelAnimationFrame(activeAnimation);
    if (behavior === 'auto' || page.scrollTop < 1) {
      page.scrollTop = 0;
      return;
    }

    const start = page.scrollTop;
    const duration = Math.min(780, Math.max(500, start * 0.65));
    const startedAt = performance.now();
    const easeInOut = (progress: number) => progress < .5
      ? 4 * progress * progress * progress
      : 1 - ((-2 * progress + 2) ** 3) / 2;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      page.scrollTop = start * (1 - easeInOut(progress));
      if (progress < 1) verticalAnimations.current[index] = window.requestAnimationFrame(animate);
    };
    verticalAnimations.current[index] = window.requestAnimationFrame(animate);
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
    lastProgress.current = routeIndex;
    preparedPage.current = undefined;
    pager.scrollLeft = routeIndex * pager.clientWidth;
    setVisualIndex(routeIndex);
    displayProgress(routeIndex);
  }, [displayProgress, fallbackIndex, isPrimaryRoute, routeIndex]);

  useEffect(() => () => {
    window.clearTimeout(settleTimer.current);
    verticalAnimations.current.forEach((frame) => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    });
  }, []);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', usesDarkTheme);
    try {
      window.localStorage.setItem(themeStorageKey, themePreference);
    } catch {
      // Theme preference is optional; the view still follows the current selection.
    }
  }, [themePreference, usesDarkTheme]);

  useEffect(() => {
    const refreshAimsState = () => setHasAimsRoster(Boolean(loadAimsRoster()));
    window.addEventListener('aims-roster-updated', refreshAimsState);
    return () => window.removeEventListener('aims-roster-updated', refreshAimsState);
  }, []);

  const handlePagerScroll = (event: UIEvent<HTMLDivElement>) => {
    const pager = event.currentTarget;
    if (!pager.clientWidth) return;
    const nextProgress = Math.max(0, Math.min(items.length - 1, pager.scrollLeft / pager.clientWidth));
    const nextNearest = Math.round(nextProgress);
    displayProgress(nextProgress);
    const direction = Math.sign(nextProgress - lastProgress.current);
    const destination = direction > 0 ? Math.ceil(nextProgress) : direction < 0 ? Math.floor(nextProgress) : undefined;
    if (destination !== undefined && destination !== preparedPage.current && destination !== nearestIndex.current) {
      preparedPage.current = destination;
      resetPage(destination, 'smooth');
    }
    lastProgress.current = nextProgress;
    if (nextNearest !== nearestIndex.current) {
      nearestIndex.current = nextNearest;
      setVisualIndex(nextNearest);
      resetPage(nextNearest, 'smooth');
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
    resetPage(index, 'smooth');
    scrollElement(pager, { left: index * pager.clientWidth, behavior: 'smooth' });
  };

  const openTabFromTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  return (
    <div className={'app-frame' + (usesDarkTheme ? ' app-frame--dark' : '')}>
      <div className="app-wallpaper" aria-hidden="true" />
      {isPrimaryRoute ? <header className="primary-tab-header">
        <h1 className="primary-tab-header__accessible-title">{items[visualIndex].title}</h1>
        <div aria-hidden="true" className="primary-tab-header__titles">
          {items.map((item, index) => <span className={visualIndex === index ? 'is-visible' : ''} key={item.to}>{item.title}</span>)}
        </div>
        {visualIndex === 1 ? <button className="primary-tab-header__aims" onClick={() => window.dispatchEvent(new Event('open-aims-import'))} type="button">
          <span aria-hidden="true">{hasAimsRoster ? '↻' : '+'}</span>{hasAimsRoster ? 'Replace AIMS' : 'Add AIMS'}
        </button> : null}
      </header> : null}
      <div className="app-frame__content">
        {isPrimaryRoute ? <div className="primary-tab-pager" onScroll={handlePagerScroll} ref={pagerRef}>
          <div aria-hidden={visualIndex !== 0} className="primary-tab-pager__page" inert={visualIndex !== 0} ref={(element) => { pageRefs.current[0] = element; }}><HomePage /></div>
          <div aria-hidden={visualIndex !== 1} className="primary-tab-pager__page" inert={visualIndex !== 1} ref={(element) => { pageRefs.current[1] = element; }}><RosterPage isActive={visualIndex === 1} /></div>
          <div aria-hidden={visualIndex !== 2} className="primary-tab-pager__page" inert={visualIndex !== 2} ref={(element) => { pageRefs.current[2] = element; }}><PayPage db={db} /></div>
          <div aria-hidden={visualIndex !== 3} className="primary-tab-pager__page" inert={visualIndex !== 3} ref={(element) => { pageRefs.current[3] = element; }}><LogbookPage db={db} /></div>
          <div aria-hidden={visualIndex !== 4} className="primary-tab-pager__page" inert={visualIndex !== 4} ref={(element) => { pageRefs.current[4] = element; }}><SettingsPage db={db} theme={themePreference} onThemeChange={setThemePreference} /></div>
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
