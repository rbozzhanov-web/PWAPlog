/// <reference types="vitest/globals" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('opens backup onboarding from the settings route', async () => {
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);

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
