/// <reference types="vitest/globals" />

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../../../app/routes';
import type { PilotLogbookDb } from '../../../db/database';
import { createPilotLogbookDb } from '../../../db/database';
import { createFlightEntry } from '../../../db/repositories/flightEntries';

function entry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'entry-1',
    date: '2025-01-02',
    departureAirport: 'UAAA',
    arrivalAirport: 'UACC',
    totalTimeMinutes: 60,
    picMinutes: 0,
    sicMinutes: 60,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: 60,
    nightMinutes: 0,
    actualInstrumentMinutes: 0,
    simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0,
    simulatorMinutes: 0,
    dayTakeoffs: 1,
    nightTakeoffs: 0,
    dayLandings: 1,
    nightLandings: 0,
    instrumentApproaches: 0,
    source: 'manual',
    createdAt: '2025-01-02T10:00:00.000Z',
    updatedAt: '2025-01-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('LogbookPage', () => {
  let db: PilotLogbookDb | undefined;
  let scrolledElements: Element[];

  beforeEach(() => {
    scrolledElements = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function scrollIntoView(this: Element) {
        scrolledElements.push(this);
      }),
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db?.delete();
  });

  async function seedEntries(entries: FlightLogEntry[]) {
    await Promise.all(entries.map((flight) => createFlightEntry(db!, flight)));
  }

  function renderLogbook() {
    render(
      <MemoryRouter initialEntries={['/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );
  }

  test('shows grouped months, total time, and year chips without All', async () => {
    db = createPilotLogbookDb('grouped-logbook-test');
    await seedEntries([
      entry({ id: 'jan-2025', date: '2025-01-02', totalTimeMinutes: 60 }),
      entry({ id: 'dec-2024', date: '2024-12-30', totalTimeMinutes: 90 }),
    ]);

    renderLogbook();

    const summary = await screen.findByRole('region', { name: 'Logbook summary' });
    expect(within(summary).getByText('2h 30m')).toBeVisible();
    expect(screen.getByRole('region', { name: 'January 2025' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'December 2024' })).toBeNull();
    expect(screen.getByRole('link', { name: /UAAA to UACC.*January 2, 2025/i })).toHaveAttribute(
      'href',
      '/logbook/jan-2025',
    );
    expect(screen.getByRole('button', { name: '2025' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.getByRole('link', { name: 'New flight' })).toHaveAttribute(
      'href',
      '/logbook/new',
    );
    expect(screen.getByRole('link', { name: 'Import PDF' })).toHaveAttribute(
      'href',
      '/import/logbook',
    );
    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(await screen.findByRole('region', { name: 'December 2024' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'January 2025' })).toBeNull();
  });

  test('renders a useful empty state', async () => {
    db = createPilotLogbookDb('empty-logbook-test');

    renderLogbook();

    expect(await screen.findByRole('heading', { name: 'No flights yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'New flight' })).toHaveAttribute(
      'href',
      '/logbook/new',
    );
    expect(screen.queryByRole('link', { name: 'Log your first flight' })).toBeNull();
  });

  test('renders only the selected year to keep large logbooks responsive', async () => {
    db = createPilotLogbookDb('year-navigation-test');
    await seedEntries([
      entry({ id: 'latest', date: '2026-02-01' }),
      entry({ id: 'december', date: '2025-12-20' }),
      entry({ id: 'july', date: '2025-07-12' }),
      entry({ id: 'november', date: '2024-11-08' }),
      entry({ id: 'march', date: '2024-03-04' }),
    ]);
    renderLogbook();

    expect(await screen.findByRole('region', { name: 'February 2026' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'December 2025' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(await screen.findByRole('region', { name: 'December 2025' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'July 2025' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'February 2026' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(await screen.findByRole('region', { name: 'November 2024' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'March 2024' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'December 2024' })).toBeNull();
  });

  test('marks the newest year active and updates the active chip on selection', async () => {
    db = createPilotLogbookDb('active-year-scroll-test');
    await seedEntries([
      entry({ id: 'latest', date: '2026-08-01' }),
      entry({ id: 'older', date: '2024-04-10' }),
    ]);
    renderLogbook();

    expect(await screen.findByRole('region', { name: 'August 2026' })).toBeVisible();
    const year2024 = screen.getByRole('button', { name: '2024' });
    expect(screen.getByRole('button', { name: '2026' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(year2024);
    expect(await screen.findByRole('region', { name: 'April 2024' })).toBeVisible();
    expect(year2024).toHaveAttribute('aria-pressed', 'true');
    expect(scrolledElements).toContain(year2024);
  });
});
