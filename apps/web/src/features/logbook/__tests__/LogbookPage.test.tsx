/// <reference types="vitest/globals" />

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { MemoryRouter } from 'react-router-dom';

import { LogbookPage } from '../LogbookPage';
import type { PilotLogbookDb } from '../../../db/database';
import { createPilotLogbookDb } from '../../../db/database';
import { createFlightEntry } from '../../../db/repositories/flightEntries';
import { saveAimsRoster } from '../../roster/aims';

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
    localStorage.clear();
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

  // Rendered directly rather than through AppRoutes at /logbook: a launch on a bare tab route is
  // sent to Home by design (see AppFrame), and nothing asserted below is about routing — the link
  // targets these tests check resolve under MemoryRouter either way.
  function renderLogbook() {
    render(
      <MemoryRouter>
        <LogbookPage db={db!} />
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

  // The actual bug report: Import AIMS only skipped a sector already carrying its own id scheme,
  // so a sector already logged some other way (here: by hand) got written a second time under a
  // fresh id, and Home's month total came out doubled. It has to recognise the sector by identity
  // (date + airport pair), not by id, whichever way it already reached the logbook.
  test('Import AIMS does not duplicate a sector already logged under a different id', async () => {
    db = createPilotLogbookDb('import-aims-existing-sector-test');
    await seedEntries([
      entry({ id: 'manual-1', date: '2020-01-02', departureAirport: 'UAAA', arrivalAirport: 'UACC', totalTimeMinutes: 90 }),
    ]);
    saveAimsRoster({
      period: { start: '2020-01-01', end: '2020-01-31' },
      duties: [{
        date: '2020-01-02',
        flights: [{
          flightNumber: 'KC100', date: '2020-01-02', origin: 'UAAA', destination: 'UACC',
          departure: '08:00', arrival: '09:30', deadhead: false, actualTimes: true,
        }],
      }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: '2020-01-01T00:00:00.000Z',
    });

    renderLogbook();
    // Wait for the seeded entry to actually be loaded into the page's own state — clicking Import
    // AIMS before that would race the read and see no existing entries at all.
    await screen.findByRole('link', { name: /UAAA to UACC/i });
    fireEvent.click(screen.getByRole('button', { name: 'Import AIMS' }));

    expect(await screen.findByText('No new completed AIMS sectors to add.')).toBeVisible();
    await expect(db.flightEntries.count()).resolves.toBe(1);
  });

  // Sectors this importer wrote before the station-local block-time fix carry a total that is out
  // by the offset between their endpoints. Re-importing skipped them, because the sector was
  // already in the logbook, so the wrong figure stayed in the permanent record forever.
  test('Import AIMS corrects a block time it wrote wrongly before, without touching a manual one', async () => {
    db = createPilotLogbookDb('import-aims-correction-test');
    await seedEntries([
      // 4:37 is what subtracting the printed clocks used to give for this sector; it blocks 7:37.
      entry({ id: 'aims-2026-09-04-921-NQZ-FRA', date: '2026-09-04', departureAirport: 'NQZ', arrivalAirport: 'FRA', totalTimeMinutes: 277, source: 'aims_import' }),
      entry({ id: 'manual-1', date: '2026-09-05', departureAirport: 'FRA', arrivalAirport: 'NQZ', totalTimeMinutes: 400, source: 'manual' }),
    ]);
    saveAimsRoster({
      period: { start: '2026-09-01', end: '2026-09-30' },
      duties: [{
        date: '2026-09-04',
        flights: [
          { flightNumber: '921', date: '2026-09-04', origin: 'NQZ', destination: 'FRA', departure: '12:17', arrival: '16:54', deadhead: false, actualTimes: true },
          { flightNumber: '922', date: '2026-09-05', origin: 'FRA', destination: 'NQZ', departure: '18:28', arrivalDate: '2026-09-06', arrival: '04:15', deadhead: false, actualTimes: true },
        ],
      }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00.000Z',
    });

    renderLogbook();
    await screen.findByRole('link', { name: /NQZ to FRA/i });
    fireEvent.click(screen.getByRole('button', { name: 'Import AIMS' }));

    expect(await screen.findByText('1 block time corrected.')).toBeVisible();
    await expect(db.flightEntries.get('aims-2026-09-04-921-NQZ-FRA')).resolves.toMatchObject({ totalTimeMinutes: 7 * 60 + 37 });
    // The pilot's own figure is theirs, however wrong this importer thinks it is.
    await expect(db.flightEntries.get('manual-1')).resolves.toMatchObject({ totalTimeMinutes: 400 });
    await expect(db.flightEntries.count()).resolves.toBe(2);
  });
});
