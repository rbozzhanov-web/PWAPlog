/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HomePage } from '../HomePage';
import { saveAimsRoster } from '../../roster/aims';
import type { AimsFlight, AimsRoster } from '../../roster/aims';

/**
 * Home used to format its date header in UTC while the roster highlighted today from the device
 * calendar. Five hours ahead in Almaty, that meant the header named yesterday every evening and
 * "This month" rolled over a day after the header did.
 */
const ALMATY_EVENING = new Date('2026-09-16T20:30:00Z'); // 01:30 on the 17th in Almaty
const ALMATY_MONTH_ROLLOVER = new Date('2026-09-30T20:30:00Z'); // 01:30 on 1 Oct in Almaty

function sector(date: string, flightNumber: string, departure: string, arrival: string): AimsFlight {
  return { date, flightNumber, origin: 'NQZ', destination: 'ALA', departure, arrival, deadhead: false, actualTimes: false };
}

function rosterWith(...flights: AimsFlight[]): AimsRoster {
  return {
    period: { start: '2026-09-01', end: '2026-10-31' },
    duties: flights.map((flight) => ({ date: flight.date, flights: [flight] })),
    hotels: [],
    absences: [],
    activities: [],
    totals: {},
    importedAt: '2026-09-01T00:00:00.000Z',
  };
}

let originalTz: string | undefined;

beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'Asia/Almaty';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // The weather panel is not what these assert. A request that never settles keeps it off the
  // network without landing a state update after the test has finished.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HomePage date header', () => {
  it('names the day the device is on, not the UTC day', () => {
    vi.setSystemTime(ALMATY_EVENING);
    saveAimsRoster(rosterWith(sector('2026-09-17', 'KC931', '09:00', '10:30')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(screen.getByText('THU, SEP 17, 26')).toBeVisible();
    expect(screen.queryByText('WED, SEP 16, 26')).toBeNull();
  });

  it('rolls "This month" over with the header rather than five hours later', () => {
    vi.setSystemTime(ALMATY_MONTH_ROLLOVER);
    saveAimsRoster(rosterWith(
      sector('2026-09-20', 'KC931', '09:00', '10:30'), // last month — must not be counted
      sector('2026-10-02', 'KC932', '09:00', '11:00'),
    ));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(screen.getByText('THU, OCT 1, 26')).toBeVisible();
    const overview = screen.getByRole('region', { name: 'Logbook overview' });
    expect(overview).toHaveTextContent('2h 0m');
    expect(overview).not.toHaveTextContent('1h 30m');
  });
});
