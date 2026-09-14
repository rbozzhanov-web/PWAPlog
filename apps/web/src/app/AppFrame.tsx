import { NavLink, Outlet } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/roster', label: 'Roster', icon: '✈' },
  { to: '/pay', label: 'Pay', icon: '₸' },
  { to: '/logbook', label: 'Logbook', ariaLabel: 'Open flight records', icon: '◷' },
  { to: '/settings', label: 'More', icon: '•••' },
];

export function AppFrame() {
  const openTabFromTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  return (
    <div className="app-frame">
      <div className="app-wallpaper" aria-hidden="true" />
      <div className="app-frame__content"><Outlet /></div>
      <nav className="tab-dock tab-dock--five" aria-label="Primary navigation">
        {items.map((item) => (
          <NavLink
            className={({ isActive }) => `tab-dock__item${isActive ? ' tab-dock__item--active' : ''}`}
            end={item.end}
            key={item.to}
            to={item.to}
            aria-label={item.ariaLabel}
            onClick={item.to === '/roster' ? undefined : openTabFromTop}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span aria-hidden={Boolean(item.ariaLabel)}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
