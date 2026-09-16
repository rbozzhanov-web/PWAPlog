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
