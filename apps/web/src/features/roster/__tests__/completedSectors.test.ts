/// <reference types="vitest/globals" />

import { rosterMonthTotals, sectorMinutes } from '../completedSectors';
import type { AimsFlight, AimsRoster } from '../aims';

function flight(overrides: Partial<AimsFlight> = {}): AimsFlight {
  return {
    flightNumber: 'KC931', date: '2026-09-02', origin: 'ALA', destination: 'NQZ',
    departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: true, ...overrides,
  };
}

function roster(flights: AimsFlight[]): AimsRoster {
  return {
    period: { start: '2026-09-01', end: '2026-09-30' },
    duties: [{ date: flights[0]?.date ?? '2026-09-01', flights }],
    hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00Z',
  };
}

test('measures a sector from its own clocks', () => {
  expect(sectorMinutes(flight())).toBe(115);
});

test('carries an overnight sector into the next day', () => {
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '07:05', arrivalDate: '2026-09-03' }))).toBe(475);
  // ...and without an explicit arrival date, a wrapped clock still means the next morning.
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '01:10' }))).toBe(120);
});

test('totals a month straight from the roster', () => {
  const totals = rosterMonthTotals(roster([flight(), flight({ flightNumber: 'KC932', origin: 'NQZ', destination: 'ALA', departure: '09:30', arrival: '11:20' })]), '2026-09');

  expect(totals.flights).toBe(2);
  expect(totals.minutes).toBe(115 + 110);
});

// This is the month's full schedule, matching what AIMS itself publishes as the period's Block
// Hours — a sector due later in the month still counts today. Deadheads are travel, not flying,
// and never count.
test('counts every scheduled sector this month, deadheads aside', () => {
  const totals = rosterMonthTotals(roster([
    flight({ date: '2026-09-28' }),
    flight({ flightNumber: 'KC940', deadhead: true }),
  ]), '2026-09');

  expect(totals).toEqual({ flights: 1, minutes: 115 });
});

test('leaves other months out of the total', () => {
  expect(rosterMonthTotals(roster([flight({ date: '2026-08-02' })]), '2026-09').flights).toBe(0);
});

test('is empty with no roster loaded at all', () => {
  expect(rosterMonthTotals(undefined, '2026-09')).toEqual({ flights: 0, minutes: 0 });
});

describe('sectorMinutes reads AIMS clocks at their own station', () => {
  const nqzToFra = {
    date: '2026-09-04', flightNumber: '921', origin: 'NQZ', destination: 'FRA',
    departure: '12:17', arrival: '16:54', deadhead: false, actualTimes: true,
  };
  const fraToNqz = {
    date: '2026-09-05', flightNumber: '922', origin: 'FRA', destination: 'NQZ',
    departure: '18:28', arrivalDate: '2026-09-06', arrival: '04:15', deadhead: false, actualTimes: true,
  };

  it('blocks the same route symmetrically in both directions', () => {
    // Subtracting the printed clocks gave 4:37 out and 9:47 back — a 5h12m spread on one route.
    expect(sectorMinutes(nqzToFra)).toBe(7 * 60 + 37);
    expect(sectorMinutes(fraToNqz)).toBe(6 * 60 + 47);
    expect(Math.abs(sectorMinutes(nqzToFra) - sectorMinutes(fraToNqz))).toBeLessThan(60);
  });

  it('leaves a sector inside one offset unchanged', () => {
    // ALA and NQZ are both Asia/Almaty, so the clock difference was already right.
    expect(sectorMinutes({
      date: '2026-09-25', flightNumber: '855', origin: 'ALA', destination: 'NQZ',
      departure: '19:40', arrival: '21:25', deadhead: false, actualTimes: true,
    })).toBe(105);
  });

  it('still totals the month to the Block Hours AIMS publishes', () => {
    // The real September 2026 roster: AIMS's own totals panel reports 47:20.
    const sectors = [
      nqzToFra, fraToNqz,
      { date: '2026-09-07', flightNumber: '921', origin: 'NQZ', destination: 'FRA', departure: '11:55', arrival: '16:53', deadhead: false, actualTimes: true },
      { date: '2026-09-08', flightNumber: '922', origin: 'FRA', destination: 'NQZ', departure: '18:30', arrivalDate: '2026-09-09', arrival: '04:20', deadhead: false, actualTimes: true },
      { date: '2026-09-11', flightNumber: '921', origin: 'NQZ', destination: 'FRA', departure: '12:11', arrival: '16:49', deadhead: false, actualTimes: true },
      { date: '2026-09-12', flightNumber: '922', origin: 'FRA', destination: 'NQZ', departure: '18:30', arrivalDate: '2026-09-13', arrival: '04:35', deadhead: false, actualTimes: true },
      { date: '2026-09-12', flightNumber: '622', origin: 'NQZ', destination: 'ALA', departure: '07:09', arrivalDate: '2026-09-13', arrival: '08:54', deadhead: true, actualTimes: true },
      { date: '2026-09-25', flightNumber: '855', origin: 'ALA', destination: 'NQZ', departure: '19:40', arrival: '21:25', deadhead: false, actualTimes: true },
      { date: '2026-09-25', flightNumber: '856', origin: 'NQZ', destination: 'ALA', departure: '22:25', arrivalDate: '2026-09-26', arrival: '00:05', deadhead: false, actualTimes: true },
    ];
    const roster = {
      period: { start: '2026-09-01', end: '2026-09-30' },
      duties: sectors.map((flight) => ({ date: flight.date, flights: [flight] })),
      hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-01T00:00:00.000Z',
    };

    expect(rosterMonthTotals(roster, '2026-09')).toEqual({ minutes: 47 * 60 + 20, flights: 8 });
  });

  it('falls back to the clock difference for a station it has no zone for', () => {
    expect(sectorMinutes({
      date: '2026-09-04', flightNumber: '999', origin: 'ZZZ', destination: 'QQQ',
      departure: '10:00', arrival: '12:30', deadhead: false, actualTimes: false,
    })).toBe(150);
  });
});
