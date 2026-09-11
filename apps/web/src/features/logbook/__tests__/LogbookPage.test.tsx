/// <reference types="vitest/globals" />

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  let intersectionCallback: IntersectionObserverCallback | undefined;
  let scrolledElements: Element[];

  beforeEach(() => {
    scrolledElements = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function scrollIntoView(this: Element) {
        scrolledElements.push(this);
      }),
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }

        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
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

    expect(await screen.findByText('2h 30m')).toBeVisible();
    expect(screen.getByRole('region', { name: 'January 2025' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'December 2024' })).toBeVisible();
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
  });

  test('renders a useful empty state', async () => {
    db = createPilotLogbookDb('empty-logbook-test');

    renderLogbook();

    expect(await screen.findByRole('heading', { name: 'No flights yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Log your first flight' })).toHaveAttribute(
      'href',
      '/logbook/new',
    );
  });

  test('selects December when present and falls back to the newest available month', async () => {
    db = createPilotLogbookDb('year-navigation-test');
    await seedEntries([
      entry({ id: 'latest', date: '2026-02-01' }),
      entry({ id: 'december', date: '2025-12-20' }),
      entry({ id: 'july', date: '2025-07-12' }),
      entry({ id: 'november', date: '2024-11-08' }),
      entry({ id: 'march', date: '2024-03-04' }),
    ]);
    renderLogbook();

    const december = await screen.findByRole('region', { name: 'December 2025' });
    const november = screen.getByRole('region', { name: 'November 2024' });
    scrolledElements.length = 0;

    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(scrolledElements).toContain(december);

    scrolledElements.length = 0;
    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(scrolledElements).toContain(november);
    expect(screen.queryByRole('region', { name: 'December 2024' })).toBeNull();
  });

  test('updates and horizontally reveals the active chip from visible month state', async () => {
    db = createPilotLogbookDb('active-year-scroll-test');
    await seedEntries([
      entry({ id: 'latest', date: '2026-08-01' }),
      entry({ id: 'older', date: '2024-04-10' }),
    ]);
    renderLogbook();

    const april = await screen.findByRole('region', { name: 'April 2024' });
    const year2024 = screen.getByRole('button', { name: '2024' });
    scrolledElements.length = 0;
    const bounds: DOMRectReadOnly = {
      bottom: 220,
      height: 100,
      left: 0,
      right: 320,
      top: 120,
      width: 320,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    };

    act(() => {
      intersectionCallback?.(
        [
          {
            boundingClientRect: bounds,
            intersectionRatio: 1,
            intersectionRect: bounds,
            isIntersecting: true,
            rootBounds: null,
            target: april,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => expect(year2024).toHaveAttribute('aria-pressed', 'true'));
    expect(scrolledElements).toContain(year2024);
  });
});
