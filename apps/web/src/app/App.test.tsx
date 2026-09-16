/// <reference types="vitest/globals" />

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

test('redirects an unknown location to the home shell', async () => {
  render(<MemoryRouter initialEntries={['/unknown']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'));
});

test('opens a new primary-tab session on Home', async () => {
  render(<MemoryRouter initialEntries={['/logbook']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'));
});

// Settings is a primary tab, so a launch there is sent to Home like any other tab — reach it the
// way a user does. This test only passed as a launch route while the redirect above was silently
// dropped; now that it fires, the tab is the honest entry point.
//
// The pager marks every inactive page aria-hidden and inert, so a role query cannot see Settings
// until it is the settled page. jsdom has no layout, so the pager is given a width and scrolled by
// hand — the same way the swipe test below drives it.
test('opens backup onboarding from the settings tab', async () => {
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);
  const pager = document.querySelector<HTMLElement>('.primary-tab-pager');
  Object.defineProperty(pager!, 'clientWidth', { configurable: true, value: 400 });
  pager!.scrollLeft = 4 * 400;
  fireEvent.scroll(pager!);

  expect(
    await screen.findByRole('heading', { name: 'Import existing PilotLogbook backup' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Export logbook backup' })).toBeVisible();
  expect(screen.getByText(/local to this browser and device/i)).toBeVisible();
});

test('moves between primary tabs smoothly while leaving Roster focus behavior intact', () => {
  const scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });

  render(<MemoryRouter><App /></MemoryRouter>);
  const pager = document.querySelector<HTMLElement>('.primary-tab-pager');
  Object.defineProperty(pager!, 'clientWidth', { configurable: true, value: 390 });
  fireEvent.click(screen.getByRole('link', { name: 'Roster' }));
  expect(scrollTo).toHaveBeenCalledWith({ left: 390, behavior: 'smooth' });

  fireEvent.click(screen.getByRole('link', { name: 'Pay' }));

  expect(scrollTo).toHaveBeenCalledWith({ left: 780, behavior: 'smooth' });
});

// The actual bug report: backgrounding rather than quitting never re-mounts AppFrame, so the
// once-only launch redirect above never got a second chance to fire, and reopening the app
// showed whatever tab it had been backgrounded on instead of Home.
function backgroundApp() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

test('resets to Home when the app is backgrounded from another primary tab', async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  const pager = document.querySelector<HTMLElement>('.primary-tab-pager');
  Object.defineProperty(pager!, 'clientWidth', { configurable: true, value: 400 });
  pager!.scrollLeft = 400; // index 1: Roster
  fireEvent.scroll(pager!);
  await waitFor(() => expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page'));

  backgroundApp();

  await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'));
});

test('leaves a dedicated task route alone when the app is backgrounded', async () => {
  render(<MemoryRouter initialEntries={['/logbook/new']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'New flight' })).toBeVisible();

  backgroundApp();

  expect(screen.getByRole('heading', { name: 'New flight' })).toBeVisible();
});

// The actual bug report, precisely: a pilot who'd last opened a specific saved logbook entry kept
// reopening the app onto that entry — which reads as "it always lands on the Logbook tab" — even
// after the fix above, because /logbook/:id was being treated the same as the still-unsaved draft
// at /logbook/new. Only the draft's route carries a real "lose your work" risk; a saved entry's
// own edit screen does not, so it resets to Home on launch like any other primary tab, the same
// way plain /logbook already did.
test('resets an existing logbook entry route to Home on launch, unlike a fresh draft', async () => {
  render(<MemoryRouter initialEntries={['/logbook/some-existing-id']}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'));
});

test('tracks a native horizontal swipe and settles on the final tab', async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  const pager = document.querySelector<HTMLElement>('.primary-tab-pager');
  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
  expect(pager).not.toBeNull();
  Object.defineProperty(pager!, 'clientWidth', { configurable: true, value: 400 });

  pager!.scrollLeft = 200;
  fireEvent.scroll(pager!);
  expect(navigation.style.getPropertyValue('--tab-progress')).toBe('0.5');

  pager!.scrollLeft = 800;
  fireEvent.scroll(pager!);
  expect(navigation.style.getPropertyValue('--tab-progress')).toBe('2');
  expect(screen.getByRole('link', { name: 'Pay' })).toHaveClass('tab-dock__item--active');
  await waitFor(() => expect(screen.getByRole('link', { name: 'Pay' })).toHaveAttribute('aria-current', 'page'));
});
