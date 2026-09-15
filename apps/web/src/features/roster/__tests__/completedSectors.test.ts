/// <reference types="vitest/globals" />
import type { FlightLogEntry } from '@pilot-logbook/core';

import { aimsSectorId, isFlownSector, monthTotals, sectorMinutes } from '../completedSectors';
import type { AimsFlight, AimsRoster } from '../aims';

function flight(overrides: Partial<AimsFlight> = {}): AimsFlight {
  return {
    flightNumber: 'KC931', date: '2026-09-02', origin: 'ALA', destination: 'NQZ',
    departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: true, ...overrides,
  };
}

function logEntry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'entry-1', date: '2026-09-02', departureAirport: 'ALA', arrivalAirport: 'NQZ',
    totalTimeMinutes: 115, source: 'manual', createdAt: '', updatedAt: '',
    picMinutes: 0, sicMinutes: 0, dualReceivedMinutes: 0, dualGivenMinutes: 0, soloMinutes: 0,
    dayMinutes: 0, nightMinutes: 0, actualInstrumentMinutes: 0, simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0, simulatorMinutes: 0, dayTakeoffs: 0, nightTakeoffs: 0,
    dayLandings: 0, nightLandings: 0, instrumentApproaches: 0,
    ...overrides,
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

test('counts a sector once when Import AIMS wrote the logbook entry itself', () => {
  const sector = flight();
  const logged = logEntry({ id: aimsSectorId(sector), source: 'aims_import' });

  expect(monthTotals([logged], roster([sector]), '2026-09', NOW)).toEqual({ flights: 1, minutes: 115 });
});

// The actual bug report: a pilot who logs a flight some other way — by hand, or through the PDF
// flight-time importer — still had it counted a second time as "not yet logged" from the roster,
// because dedup compared the entry's id against the id only Import AIMS ever writes. A manual
// entry or a PDF import both carry an id with nothing to do with that scheme.
test('counts a sector once even when the logbook entry was not written by Import AIMS', () => {
  const sector = flight();
  const manual = logEntry({ id: crypto.randomUUID(), source: 'manual' });
  const pdfImported = logEntry({ id: crypto.randomUUID(), source: 'pdf_import' });

  expect(monthTotals([manual], roster([sector]), '2026-09', NOW)).toEqual({ flights: 1, minutes: 115 });
  expect(monthTotals([pdfImported], roster([sector]), '2026-09', NOW)).toEqual({ flights: 1, minutes: 115 });
});

test('still counts a genuinely different sector on the same day separately', () => {
  const logged = logEntry({ id: 'entry-1', departureAirport: 'ALA', arrivalAirport: 'ICN', totalTimeMinutes: 400 });
  const sector = flight(); // ALA -> NQZ, unrelated to the logged ALA -> ICN entry

  const totals = monthTotals([logged], roster([sector]), '2026-09', NOW);
  expect(totals).toEqual({ flights: 2, minutes: 400 + 115 });
});

test('leaves other months out of the total', () => {
  expect(monthTotals([], roster([flight({ date: '2026-08-02' })]), '2026-09', NOW).flights).toBe(0);
});

describe('isFlownSector', () => {
  test('is false before departure and true once landed', () => {
    const sector = flight({ date: '2026-09-02', departure: '06:10', arrival: '08:05' });
    expect(isFlownSector(sector, Date.parse('2026-09-02T05:00:00Z'))).toBe(false);
    expect(isFlownSector(sector, Date.parse('2026-09-02T09:00:00Z'))).toBe(true);
  });

  test('never counts a deadhead leg as flown', () => {
    const sector = flight({ deadhead: true });
    expect(isFlownSector(sector, Date.parse('2026-12-31T00:00:00Z'))).toBe(false);
  });

  // The bug this guards: without the rollover, an overnight sector's arrival clock (07:05) sits
  // *before* its own departure clock (23:10) on the same calendar date, so it read as already
  // landed the moment the duty was still hours from even starting.
  test('rolls an overnight sector without an explicit arrivalDate to the next day', () => {
    const sector = flight({ date: '2026-09-02', departure: '23:10', arrival: '07:05' });
    expect(isFlownSector(sector, Date.parse('2026-09-02T23:30:00Z'))).toBe(false);
    expect(isFlownSector(sector, Date.parse('2026-09-03T07:30:00Z'))).toBe(true);
  });
});
