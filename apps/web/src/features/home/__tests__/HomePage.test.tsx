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

function leg(date: string, flightNumber: string, origin: string, destination: string, departure: string, arrival: string, arrivalDate?: string): AimsFlight {
  return { date, flightNumber, origin, destination, departure, arrival, arrivalDate, deadhead: false, actualTimes: false };
}

function dutyRoster(report: string, ...flights: AimsFlight[]): AimsRoster {
  return {
    period: { start: '2026-09-01', end: '2026-10-31' },
    duties: [{ date: flights[0].date, report, flights }],
    hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00.000Z',
  };
}

const BEFORE_THE_DUTY = new Date('2026-09-25T06:00:00Z');

describe('HomePage hero', () => {
  it('shows the whole day the pilot flies, not just the leg in front of them', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster(
      '2026-09-25T18:25',
      leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25'),
      leg('2026-09-25', 'KC856', 'NQZ', 'ALA', '22:25', '00:05', '2026-09-26'),
    ));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const route = document.querySelector('.home-route');
    expect([...route!.querySelectorAll('.home-route__stop strong')].map((node) => node.textContent))
      .toEqual(['ALA', 'NQZ', 'ALA']);
    expect([...route!.querySelectorAll('.home-route__flight strong')].map((node) => node.textContent))
      .toEqual(['KC855', 'KC856']);
  });

  it('spans the day with its times: report, first off-blocks, last on-blocks', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster(
      '2026-09-25T18:25',
      leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25'),
      leg('2026-09-25', 'KC856', 'NQZ', 'ALA', '22:25', '00:05', '2026-09-26'),
    ));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const times = [...document.querySelectorAll('.home-time-grid > div')].map((cell) => cell.textContent);
    // 00:05 is the second leg's arrival — the first leg's 21:25 would only describe half the day.
    expect(times).toEqual(['Report18:25L', 'Departure19:40L', 'Landing00:05L']);
    // The clock carries an L rather than a LOCAL caption under every column.
    expect(screen.queryByText('LOCAL')).toBeNull();
  });

  it('reads a single-sector day as a plain pair', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster('2026-09-25T10:40', leg('2026-09-25', 'KC921', 'NQZ', 'FRA', '12:17', '16:54')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const route = document.querySelector('.home-route');
    expect([...route!.querySelectorAll('.home-route__stop strong')].map((node) => node.textContent))
      .toEqual(['NQZ', 'FRA']);
    // The chain modifier is what steps the code size down; a two-stop day does not need it.
    expect(route).not.toHaveClass('home-route--chain');
  });

  it('puts the destination and its weather on one line', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster('2026-09-25T18:25', leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const strip = document.querySelector('.home-destination-weather strong');
    expect(strip?.textContent).toMatch(/^NQZ • /);
    expect(document.querySelector('.home-destination-weather')?.textContent).not.toMatch(/DESTINATION/);
  });
});
