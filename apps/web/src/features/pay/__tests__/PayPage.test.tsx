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

const EUR_FEED = `<?xml version="1.0" encoding="utf-8"?><rates>
  <item><fullname>Euro</fullname><title>EUR</title><description>541.36</description><quant>1</quant></item>
</rates>`;

/**
 * The rate a pilot would otherwise look up by hand. It is a fact rather than a preference — the
 * National Bank's figure for the month's last calendar day, which is what the euro contract
 * converts at — so the screen fetches it, and only when nothing is saved for that month.
 */
describe('PayPage exchange rate', () => {
  afterEach(() => vi.useRealTimers());

  it('asks the National Bank for the month-end rate once the month has closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 5)); // 5 October — September is settled
    rosterForSeptember();
    const request = vi.fn(async () => new Response(EUR_FEED, { status: 200 }));
    vi.stubGlobal('fetch', request);

    render(<PayPage db={db} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Rate')).toHaveValue('541.36'));
    // Through this app's own proxy: the bank's feed carries no CORS header.
    expect(request).toHaveBeenCalledWith('/api/nbrk-rate?fdate=30.09.2026');
    expect(await screen.findByText(/Official National Bank rate for 30\.09\.2026/)).toBeVisible();
  });

  it('marks the rate provisional while the month is still being flown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17)); // mid-September: no month-end rate exists yet
    rosterForSeptember();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(EUR_FEED, { status: 200 })));

    render(<PayPage db={db} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Rate')).toHaveValue('541.36'));
    expect(await screen.findByText(/Provisional.*17\.09\.2026.*30\.09\.2026/)).toBeVisible();
  });

  it('leaves a saved rate alone rather than overwriting it', async () => {
    rosterForSeptember();
    await db.exchangeRates.put({ month: '2026-09', rate: 530, source: 'manual', updatedAt: '2026-09-01T00:00:00.000Z' });
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    render(<PayPage db={db} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Rate')).toHaveValue('530'));
    expect(request).not.toHaveBeenCalled();
  });

  it('falls back to typing it when the bank cannot be reached', async () => {
    rosterForSeptember();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));

    render(<PayPage db={db} />);

    expect(await screen.findByText(/Could not reach the National Bank/)).toBeVisible();
    expect(screen.getByPlaceholderText('Rate')).toHaveValue('');
  });
});
