/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HomePage } from '../HomePage';
import { parseAimsArchive, saveAimsRoster } from '../../roster/aims';
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

function dutyRoster(report: string, release: string | undefined, ...flights: AimsFlight[]): AimsRoster {
  return {
    period: { start: '2026-09-01', end: '2026-10-31' },
    duties: [{ date: flights[0].date, report, release, flights }],
    hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00.000Z',
  };
}

const BEFORE_THE_DUTY = new Date('2026-09-25T06:00:00Z');

describe('HomePage hero', () => {
  it('shows the whole day the pilot flies, not just the leg in front of them', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster(
      '2026-09-25T18:25', '2026-09-26T00:35',
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

  it('spans the day with its times: report, first off-blocks, release', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster(
      '2026-09-25T18:25', '2026-09-26T00:35',
      leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25'),
      leg('2026-09-25', 'KC856', 'NQZ', 'ALA', '22:25', '00:05', '2026-09-26'),
    ));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const times = [...document.querySelectorAll('.home-time-grid > div')].map((cell) => cell.textContent);
    // 19:40 is the first leg's off-blocks; the second leg's would only describe half the day. The
    // last column is the duty's release, not the 00:05 the aeroplane arrives — the pilot is not
    // free for another half hour.
    expect(times).toEqual(['Report18:25L', 'Dep19:40L', 'Rel00:35L', 'Duty6:10']);
    // The clock carries an L rather than a LOCAL caption under every column. The duty length has
    // none: it is elapsed time, and belongs to no station's clock.
    expect(screen.queryByText('LOCAL')).toBeNull();
  });

  it('falls back to the last on-blocks when AIMS gave the duty no release', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster(
      '2026-09-25T18:25', undefined,
      leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25'),
      leg('2026-09-25', 'KC856', 'NQZ', 'ALA', '22:25', '00:05', '2026-09-26'),
    ));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(document.querySelectorAll('.home-time-grid > div')[2]?.textContent).toBe('Rel00:05L');
  });

  it('names the day the duty starts, and the weekday with it', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    // Reports at 22:35 on the 26th for a departure at 00:05 on the 27th. The date on the card is
    // the day the pilot has to be at the airport, which is the report's — the sector's would send
    // them a day late.
    saveAimsRoster(dutyRoster('2026-10-26T22:35', '2026-10-27T10:25', leg('2026-10-27', 'KC909', 'ALA', 'ICN', '00:05', '09:55')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(screen.getByText('26 OCT · MON')).toBeVisible();
  });

  it('measures the duty as elapsed time, not as one clock minus another', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    // Report in Almaty, release in Seoul, four zones east. Subtracting the printed clocks gives
    // 11:50 and counts those four hours as duty the pilot never worked.
    saveAimsRoster(dutyRoster('2026-10-26T22:35', '2026-10-27T10:25', leg('2026-10-27', 'KC909', 'ALA', 'ICN', '00:05', '09:55')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(document.querySelectorAll('.home-time-grid > div')[3]?.textContent).toBe('Duty7:50');
  });

  it('says nothing about the duty length when it cannot place a station', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    // A guessed offset would be a figure a pilot might plan rest around, so a dash is the answer.
    saveAimsRoster(dutyRoster('2026-09-25T10:40', '2026-09-25T17:24', leg('2026-09-25', 'KC921', 'NQZ', 'ZZZ', '12:17', '16:54')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(document.querySelectorAll('.home-time-grid > div')[3]?.textContent).toBe('Duty—');
  });

  /**
   * End to end, through the parser the roster actually arrives from. AIMS gives the debrief as a
   * bare clock, and hanging it on the duty's start date put a 00:35 release eighteen hours before
   * its 18:25 report. The card printed both times and looked right; the duty length was the first
   * thing to subtract them, and showed a dash.
   */
  it('measures a duty that ends after midnight, as the Web Archive delivers it', async () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    const initialResult = {
      SchedulerEvents: [{
        id: '1234on2026-09-25T18:25:00_x',
        start: '2026-09-25T18:25:00', end: '2026-09-26T00:35:00',
        report: '18:25', debrief: '00:35', type: 'Flight', IsDeadhead: false,
        details: '855  - ALA  (1940) - NQZ  (2125) \r\n856  - NQZ  (2225) - ALA  (0005\u207a\u00b9) ',
      }],
    };
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = ${JSON.stringify(initialResult)};</script>CrewSchedule`;
    saveAimsRoster(await parseAimsArchive({ arrayBuffer: async () => new TextEncoder().encode(archive).buffer } as File));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const times = [...document.querySelectorAll('.home-time-grid > div')].map((cell) => cell.textContent);
    expect(times).toEqual(['Report18:25L', 'Dep19:40L', 'Rel00:35L', 'Duty6:10']);
  });

  it('reads a single-sector day as a plain pair', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster('2026-09-25T10:40', '2026-09-25T17:24', leg('2026-09-25', 'KC921', 'NQZ', 'FRA', '12:17', '16:54')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const route = document.querySelector('.home-route');
    expect([...route!.querySelectorAll('.home-route__stop strong')].map((node) => node.textContent))
      .toEqual(['NQZ', 'FRA']);
    // The chain modifier is what steps the code size down; a two-stop day does not need it.
    expect(route).not.toHaveClass('home-route--chain');
  });

  it('puts the destination and its weather on one line', () => {
    vi.setSystemTime(BEFORE_THE_DUTY);
    saveAimsRoster(dutyRoster('2026-09-25T18:25', '2026-09-25T21:55', leg('2026-09-25', 'KC855', 'ALA', 'NQZ', '19:40', '21:25')));

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const strip = document.querySelector('.home-destination-weather strong');
    expect(strip?.textContent).toMatch(/^NQZ • /);
    expect(document.querySelector('.home-destination-weather')?.textContent).not.toMatch(/DESTINATION/);
  });
});
