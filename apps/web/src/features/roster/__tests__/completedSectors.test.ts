/// <reference types="vitest/globals" />
import type { FlightLogEntry } from '@pilot-logbook/core';

import { aimsSectorId, monthTotals, sectorMinutes } from '../completedSectors';
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

const NOW = Date.parse('2026-09-15T12:00:00Z');

test('measures a sector from its own clocks', () => {
  expect(sectorMinutes(flight())).toBe(115);
});

test('carries an overnight sector into the next day', () => {
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '07:05', arrivalDate: '2026-09-03' }))).toBe(475);
  // ...and without an explicit arrival date, a wrapped clock still means the next morning.
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '01:10' }))).toBe(120);
});

test('totals a month the pilot has flown but not yet logged', () => {
  const totals = monthTotals([], roster([flight(), flight({ flightNumber: 'KC932', origin: 'NQZ', destination: 'ALA', departure: '09:30', arrival: '11:20' })]), '2026-09', NOW);

  expect(totals.flights).toBe(2);
  expect(totals.minutes).toBe(115 + 110);
});

test('ignores sectors that have not been flown yet, and deadheads', () => {
  const totals = monthTotals([], roster([
    flight({ date: '2026-09-28' }),
    flight({ flightNumber: 'KC940', deadhead: true }),
  ]), '2026-09', NOW);

  expect(totals).toEqual({ flights: 0, minutes: 0 });
});

test('counts a sector once when it is in both the logbook and the roster', () => {
  const sector = flight();
  const logged = {
    id: aimsSectorId(sector), date: sector.date, departureAirport: 'ALA', arrivalAirport: 'NQZ',
    totalTimeMinutes: 115, source: 'aims_import', createdAt: '', updatedAt: '',
    picMinutes: 0, sicMinutes: 0, dualReceivedMinutes: 0, dualGivenMinutes: 0, soloMinutes: 0,
    dayMinutes: 0, nightMinutes: 0, actualInstrumentMinutes: 0, simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0, simulatorMinutes: 0, dayTakeoffs: 0, nightTakeoffs: 0,
    dayLandings: 0, nightLandings: 0, instrumentApproaches: 0,
  } as FlightLogEntry;

  expect(monthTotals([logged], roster([sector]), '2026-09', NOW)).toEqual({ flights: 1, minutes: 115 });
});

test('leaves other months out of the total', () => {
  expect(monthTotals([], roster([flight({ date: '2026-08-02' })]), '2026-09', NOW).flights).toBe(0);
});
