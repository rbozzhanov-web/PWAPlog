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

test('measures a sector from its own clocks', () => {
  expect(sectorMinutes(flight())).toBe(115);
});

test('carries an overnight sector into the next day', () => {
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '07:05', arrivalDate: '2026-09-03' }))).toBe(475);
  // ...and without an explicit arrival date, a wrapped clock still means the next morning.
  expect(sectorMinutes(flight({ departure: '23:10', arrival: '01:10' }))).toBe(120);
});

test('totals a month the pilot is rostered to fly but has not yet logged', () => {
  const totals = monthTotals([], roster([flight(), flight({ flightNumber: 'KC932', origin: 'NQZ', destination: 'ALA', departure: '09:30', arrival: '11:20' })]), '2026-09');

  expect(totals.flights).toBe(2);
  expect(totals.minutes).toBe(115 + 110);
});

// This is the month's full schedule, matching what AIMS itself publishes as the period's Block
// Hours — a sector due later in the month still counts today, it just isn't in the logbook yet.
// Deadheads are travel, not flying, and never count.
test('counts every scheduled sector this month, deadheads aside', () => {
  const totals = monthTotals([], roster([
    flight({ date: '2026-09-28' }),
    flight({ flightNumber: 'KC940', deadhead: true }),
  ]), '2026-09');

  expect(totals).toEqual({ flights: 1, minutes: 115 });
});

test('counts a sector once when Import AIMS wrote the logbook entry itself', () => {
  const sector = flight();
  const logged = logEntry({ id: aimsSectorId(sector), source: 'aims_import' });

  expect(monthTotals([logged], roster([sector]), '2026-09')).toEqual({ flights: 1, minutes: 115 });
});

// The actual bug report: a pilot who logs a flight some other way — by hand, or through the PDF
// flight-time importer — still had it counted a second time as "not yet logged" from the roster,
// because dedup compared the entry's id against the id only Import AIMS ever writes. A manual
// entry or a PDF import both carry an id with nothing to do with that scheme.
test('counts a sector once even when the logbook entry was not written by Import AIMS', () => {
  const sector = flight();
  const manual = logEntry({ id: crypto.randomUUID(), source: 'manual' });
  const pdfImported = logEntry({ id: crypto.randomUUID(), source: 'pdf_import' });

  expect(monthTotals([manual], roster([sector]), '2026-09')).toEqual({ flights: 1, minutes: 115 });
  expect(monthTotals([pdfImported], roster([sector]), '2026-09')).toEqual({ flights: 1, minutes: 115 });
});

test('still counts a genuinely different sector on the same day separately', () => {
  const logged = logEntry({ id: 'entry-1', departureAirport: 'ALA', arrivalAirport: 'ICN', totalTimeMinutes: 400 });
  const sector = flight(); // ALA -> NQZ, unrelated to the logged ALA -> ICN entry

  const totals = monthTotals([logged], roster([sector]), '2026-09');
  expect(totals).toEqual({ flights: 2, minutes: 400 + 115 });
});

test('leaves other months out of the total', () => {
  expect(monthTotals([], roster([flight({ date: '2026-08-02' })]), '2026-09').flights).toBe(0);
});

// The actual bug report: two logbook entries had ended up claiming the same real flight — an
// id-based dedup upstream (in Import AIMS) let it write a second row for a sector already logged
// by hand, so the month's total came out exactly doubled. monthTotals only used to dedupe the
// roster against the logbook, never the logbook against itself.
test('counts a sector once even when the logbook itself has a duplicate row for it', () => {
  const first = logEntry({ id: 'entry-1', source: 'manual' });
  const second = logEntry({ id: 'entry-2', source: 'aims_import', totalTimeMinutes: 115 });

  expect(monthTotals([first, second], roster([]), '2026-09')).toEqual({ flights: 1, minutes: 115 });
});
