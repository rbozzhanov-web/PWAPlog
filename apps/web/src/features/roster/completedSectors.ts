import type { FlightLogEntry } from '@pilot-logbook/core';

import type { AimsFlight, AimsRoster } from './aims';

/**
 * What the pilot is rostered to fly this month, from the roster rather than only from the logbook.
 *
 * Home used to total the logbook alone, so a pilot with a freshly imported roster and an empty
 * logbook was told they had flown nothing this month — while the same screen showed them their
 * next sector. The roster already knows the sectors; counting them is not a claim about the
 * logbook, it is the honest answer to "this month".
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
function sectorIdentity(date: string, departure: string, arrival: string): string {
  return `${date}|${departure.trim().toUpperCase()}|${arrival.trim().toUpperCase()}`;
}

/**
 * Block minutes from the roster's own clocks.
 *
 * AIMS prints each leg in the local time of the station it sits under, so this is exact for a
 * sector that stays within one offset and drifts by the difference where it does not — the same
 * approximation the logbook's own AIMS import has always written. Good enough to total a month;
 * not good enough to pay on, which is why crew pay uses published norms instead.
 */
export function sectorMinutes(flight: AimsFlight): number {
  const out = Date.parse(`${flight.date}T${flight.departure}:00Z`);
  let incoming = Date.parse(`${flight.arrivalDate ?? flight.date}T${flight.arrival}:00Z`);
  if (!Number.isFinite(out) || !Number.isFinite(incoming)) return 0;
  if (incoming < out) incoming += 24 * 60 * 60 * 1000;
  return Math.round((incoming - out) / 60_000);
}

export interface MonthTotals {
  minutes: number;
  flights: number;
}

/**
 * One month's flying: every logbook entry for the month, plus every roster sector for the month
 * that has not been written to the logbook yet. This is the month's full scheduled total — the
 * same figure AIMS itself publishes as the period's Block Hours — not just what has landed so
 * far, so it matches the roster on day one rather than growing into it. Deadhead legs are travel,
 * not flying, and never count. Deduplicated by flight identity (date + airport pair) rather than
 * by id — a logbook entry can reach the logbook by hand, through the PDF flight-time importer, or
 * through Import AIMS, and only the last of those writes an id this module would otherwise
 * recognise. Matching by identity catches all three, so the same real sector is never added into
 * the total from both sides.
 */
export function monthTotals(
  entries: FlightLogEntry[],
  roster: AimsRoster | undefined,
  month: string,
): MonthTotals {
  const logged = entries.filter((entry) => entry.date.startsWith(month));
  const loggedSectors = new Set(
    logged.map((entry) => sectorIdentity(entry.date, entry.departureAirport, entry.arrivalAirport)),
  );

  const unlogged = (roster?.duties ?? [])
    .flatMap((duty) => duty.flights)
    .filter(
      (flight) =>
        !flight.deadhead &&
        flight.date.startsWith(month) &&
        !loggedSectors.has(sectorIdentity(flight.date, flight.origin, flight.destination)),
    );

  return {
    minutes:
      logged.reduce((total, entry) => total + entry.totalTimeMinutes, 0) +
      unlogged.reduce((total, flight) => total + sectorMinutes(flight), 0),
    flights: logged.length + unlogged.length,
  };
}
