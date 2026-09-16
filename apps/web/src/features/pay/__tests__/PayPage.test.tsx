/// <reference types="vitest/globals" />

import { NEW_ENTRY_DEFAULTS, type FlightLogEntry } from '@pilot-logbook/core';
import { render, screen, waitFor } from '@testing-library/react';

import { createPilotLogbookDb, type PilotLogbookDb } from '../../../db/database';
import { PayPage } from '../PayPage';
import { saveAimsRoster } from '../../roster/aims';

const RATE = 530;

function logged(date: string, from: string, to: string): FlightLogEntry {
  return {
    ...NEW_ENTRY_DEFAULTS,
    id: `entry-${date}-${from}-${to}`, date, departureAirport: from, arrivalAirport: to,
    totalTimeMinutes: 105, source: 'manual', createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
  };
}

function rosterForSeptember() {
  saveAimsRoster({
    period: { start: '2026-09-01', end: '2026-09-30' },
    duties: [{
      date: '2026-09-04',
      flights: [
        { flightNumber: '855', date: '2026-09-04', origin: 'ALA', destination: 'NQZ', departure: '19:40', arrival: '21:25', deadhead: false, actualTimes: true },
        { flightNumber: '856', date: '2026-09-05', origin: 'NQZ', destination: 'ALA', departure: '22:25', arrivalDate: '2026-09-06', arrival: '00:05', deadhead: false, actualTimes: true },
      ],
    }],
    hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00.000Z',
  });
}

let db: PilotLogbookDb;
let dbIndex = 0;

beforeEach(() => {
  localStorage.clear();
  db = createPilotLogbookDb(`pay-page-test-${(dbIndex += 1)}`);
});

describe('PayPage year-to-date inputs', () => {
  it('replays the year on every stored rate, and says nothing was borrowed', async () => {
    rosterForSeptember();
    await db.exchangeRates.bulkPut(
      Array.from({ length: 9 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, '0')}`, rate: RATE, source: 'manual' as const, updatedAt: '2026-09-01T00:00:00.000Z',
      })),
    );
    // A month with no roster and no PDF still has the logbook to price it.
    await db.flightEntries.bulkPut(
      Array.from({ length: 8 }, (_, index) => logged(`2026-${String(index + 1).padStart(2, '0')}-04`, 'ALA', 'NQZ')),
    );

    render(<PayPage db={db} />);

    await waitFor(() => expect(screen.getByText(/EUR \/ KZT/)).toBeVisible());
    // Every month of the year was priced from a rate of its own.
    await waitFor(() => expect(screen.queryByText(/No EUR\/KZT rate saved for/)).toBeNull());
    await waitFor(() => expect(screen.queryByText(/No roster, PDF or logbook entries for/)).toBeNull());
  });

  it('warns when a month of the year had no rate, instead of quietly borrowing one', async () => {
    rosterForSeptember();
    // Only the month on screen — which is exactly what the screen used to send for every month.
    await db.exchangeRates.put({ month: '2026-09', rate: RATE, source: 'manual', updatedAt: '2026-09-01T00:00:00.000Z' });
    await db.flightEntries.bulkPut(
      Array.from({ length: 8 }, (_, index) => logged(`2026-${String(index + 1).padStart(2, '0')}-04`, 'ALA', 'NQZ')),
    );

    render(<PayPage db={db} />);

    expect(await screen.findByText(/No EUR\/KZT rate saved for 2026-01, 2026-02/)).toBeVisible();
  });

  it('warns about a month the year-to-date has no source for at all', async () => {
    rosterForSeptember();
    await db.exchangeRates.bulkPut(
      Array.from({ length: 9 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, '0')}`, rate: RATE, source: 'manual' as const, updatedAt: '2026-09-01T00:00:00.000Z',
      })),
    );
    await db.flightEntries.put(logged('2026-08-04', 'ALA', 'NQZ'));

    render(<PayPage db={db} />);

    const warning = await screen.findByText(/No roster, PDF or logbook entries for/);
    expect(warning).toHaveTextContent('2026-01');
    expect(warning).toHaveTextContent('2026-07');
    expect(warning).not.toHaveTextContent('2026-08');
  });
});
