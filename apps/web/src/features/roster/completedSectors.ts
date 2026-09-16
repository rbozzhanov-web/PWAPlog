import { stationLocalToUtc } from '@pilot-logbook/core';

import type { AimsFlight, AimsRoster } from './aims';

/**
 * What the pilot is rostered to fly this month, from the roster alone.
 *
 * Home and Roster answer entirely from the currently loaded AIMS archive, with no logbook
 * involved: a pilot who has imported a roster but not yet written any of it to the logbook still
 * has this month's schedule, and the screen should say so without waiting on the logbook to agree.
 */

/** Stable across re-imports, so a sector already written to the logbook by Import AIMS specifically
 *  is never re-added as a duplicate logbook entry. */
export function aimsSectorId(flight: AimsFlight): string {
  return `aims-${flight.date}-${flight.flightNumber}-${flight.origin}-${flight.destination}`;
}

/**
 * What makes a logbook entry and a roster sector the same real flight, independent of how the
 * entry got there.
 *
 * `monthTotals` used to dedupe by comparing a logged entry's `id` against `aimsSectorId(flight)` —
 * which only ever matches an entry that Import AIMS itself wrote. A flight entered by hand, or
 * pulled in through the PDF flight-time importer (a random UUID), never carries that id, so the
 * same real sector was counted twice: once from the logbook, once again as "not yet logged" from
 * the roster. Matching on date and the airport pair instead recognises the flight whichever way it
 * reached the logbook.
 */
export function sectorIdentity(date: string, departure: string, arrival: string): string {
  return `${date}|${departure.trim().toUpperCase()}|${arrival.trim().toUpperCase()}`;
}

/**
 * Block minutes for one sector, reading each clock at the station it belongs to.
 *
 * This used to subtract the two printed clocks directly. That is only right when both stations
 * share an offset, and this pilot's month is mostly NQZ↔FRA, three hours apart: the outbound came
 * out at 4:37 and the identical return at 9:47. Across a balanced out-and-back the two errors
 * cancel, so the month still totalled AIMS's own 47:20 and the mistake stayed invisible in the
 * summary while every individual sector — including the ones Import AIMS writes into the permanent
 * logbook as `totalTimeMinutes` — was wrong by the offset between its endpoints.
 *
 * See `stationTime.ts` in core for the evidence that AIMS's clocks are station-local.
 *
 * When a station isn't in the zone table, this falls back to the old clock difference rather than
 * dropping the sector: a slightly wrong total beats a missing one, and for a domestic sector the
 * two readings agree anyway.
 */
export function sectorMinutes(flight: AimsFlight): number {
  const arrivalDate = flight.arrivalDate ?? flight.date;
  const out = stationLocalToUtc(flight.date, flight.departure, flight.origin);
  const incoming = stationLocalToUtc(arrivalDate, flight.arrival, flight.destination);
  if (out && incoming) {
    let minutes = Math.round((incoming.getTime() - out.getTime()) / 60_000);
    // An arrival with no explicit next-day marker that lands before its departure crossed midnight.
    if (minutes < 0) minutes += 24 * 60;
    return minutes;
  }
  return clockDifferenceMinutes(flight.date, flight.departure, arrivalDate, flight.arrival);
}

function clockDifferenceMinutes(
  outDate: string,
  outTime: string,
  inDate: string,
  inTime: string,
): number {
  const out = Date.parse(`${outDate}T${outTime}:00Z`);
  let incoming = Date.parse(`${inDate}T${inTime}:00Z`);
  if (!Number.isFinite(out) || !Number.isFinite(incoming)) return 0;
  if (incoming < out) incoming += 24 * 60 * 60 * 1000;
  return Math.round((incoming - out) / 60_000);
}

export interface MonthTotals {
  minutes: number;
  flights: number;
}

/**
 * One month's flying, straight from the roster: every non-deadhead sector for the month,
 * scheduled or already flown. This is the month's full scheduled total — the same figure AIMS
 * itself publishes as the period's Block Hours — not just what has landed so far, so it matches
 * the roster on day one rather than growing into it. Deadhead legs are travel, not flying, and
 * never count.
 */
export function rosterMonthTotals(roster: AimsRoster | undefined, month: string): MonthTotals {
  const sectors = (roster?.duties ?? [])
    .flatMap((duty) => duty.flights)
    .filter((flight) => !flight.deadhead && flight.date.startsWith(month));

  return {
    minutes: sectors.reduce((total, flight) => total + sectorMinutes(flight), 0),
    flights: sectors.length,
  };
}
