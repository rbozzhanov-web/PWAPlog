import type { FlightLogEntry } from '@pilot-logbook/core';

import type { AimsFlight, AimsRoster } from './aims';

/**
 * What the pilot has actually flown, from the roster rather than only from the logbook.
 *
 * Home used to total the logbook alone, so a pilot with a freshly imported roster and an empty
 * logbook was told they had flown nothing this month — while the same screen showed them their
 * next sector. The roster already knows the sectors; counting them is not a claim about the
 * logbook, it is the honest answer to "this month".
 */

/** Stable across re-imports, so a sector already written to the logbook is never counted twice. */
export function aimsSectorId(flight: AimsFlight): string {
  return `aims-${flight.date}-${flight.flightNumber}-${flight.origin}-${flight.destination}`;
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

/** True once the sector has landed. Deadhead legs are travel, not flying, and never count. */
export function isFlownSector(flight: AimsFlight, now: number): boolean {
  if (flight.deadhead) return false;
  const arrival = Date.parse(`${flight.arrivalDate ?? flight.date}T${flight.arrival}:00Z`);
  return Number.isFinite(arrival) && arrival <= now;
}

export function flownSectors(roster: AimsRoster | undefined, now: number): AimsFlight[] {
  return (roster?.duties ?? [])
    .flatMap((duty) => duty.flights)
    .filter((flight) => isFlownSector(flight, now));
}

export interface MonthTotals {
  minutes: number;
  flights: number;
}

/**
 * One month's flying: every logbook entry for the month, plus any sector the roster shows as flown
 * that has not been written to the logbook yet. Deduplicated on `aimsSectorId`, which is the id the
 * logbook import assigns, so importing later moves a sector between the two sources without
 * changing the total.
 */
export function monthTotals(
  entries: FlightLogEntry[],
  roster: AimsRoster | undefined,
  month: string,
  now: number,
): MonthTotals {
  const logged = entries.filter((entry) => entry.date.startsWith(month));
  const loggedIds = new Set(logged.map((entry) => entry.id));

  const unlogged = flownSectors(roster, now).filter(
    (flight) => flight.date.startsWith(month) && !loggedIds.has(aimsSectorId(flight)),
  );

  return {
    minutes:
      logged.reduce((total, entry) => total + entry.totalTimeMinutes, 0) +
      unlogged.reduce((total, flight) => total + sectorMinutes(flight), 0),
    flights: logged.length + unlogged.length,
  };
}
