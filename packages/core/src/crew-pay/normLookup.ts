import { toNormIcaoCode } from './normAirports';
import { PUBLISHED_SECTORS } from './normsTable';

/**
 * The published table re-keyed into the codes the logbook actually stores.
 *
 * Built once at load: entries are canonicalised to ICAO on the way into the database, so a lookup
 * keyed on the published IATA would miss every flight. Putting both sides through the same
 * resolver also makes the retired codes it already knows line up with the table's current ones —
 * a logbook row saved as TSE and a published row saying NQZ both land on UACC.
 *
 * The resolver is `normAirports`, a generated subset covering only the airports this table names,
 * rather than `daynight/airportDb` and its 855 KB worldwide dataset: a code that resolves to an
 * airport outside the table cannot match a published sector however it is spelled, so the rest of
 * the dataset could only ever be parsed and discarded — on every app launch, since the core barrel
 * re-exports this module into the entry chunk. normAirports.test.ts holds the two in step.
 */
const byIcaoPair = new Map<string, number>();
for (const sector of PUBLISHED_SECTORS) {
  byIcaoPair.set(`${toNormIcaoCode(sector.dep)} ${toNormIcaoCode(sector.arr)}`, sector.minutes);
}

/** The normative block time published for exactly this direction, if there is one. */
export function lookupNormMinutes(departure: string, arrival: string): number | undefined {
  return byIcaoPair.get(`${toNormIcaoCode(departure)} ${toNormIcaoCode(arrival)}`);
}

/**
 * `norm`   published for this exact direction
 * `actual` not published — the block time flown, per the list's own rule
 */
export type PayTimeSource = 'norm' | 'actual';

export interface SectorPayTime {
  minutes: number;
  source: PayTimeSource;
}

/**
 * What a sector is paid on: its published norm, or the time actually operated when the sector is
 * not on the list — which is the rule the list states for itself.
 *
 * Strictly directional, with no borrowing from the reverse direction. An earlier version did
 * borrow, on the reasoning that a base airport could not plausibly have no departure norms; the
 * page carrying them turned up and disproved it outright — NQZ->ALA is published at 1:53 against
 * ALA->NQZ's 1:55, so substituting one for the other is simply wrong. Of the 98 pairs published
 * both ways, 97 differ.
 *
 * The tier used is still reported rather than folded away, so a sector paid on actual time is
 * visible when a payslip is being checked.
 */
export function sectorPayTime(
  departure: string,
  arrival: string,
  actualMinutes: number,
): SectorPayTime {
  const norm = lookupNormMinutes(departure, arrival);

  return norm === undefined
    ? { minutes: actualMinutes, source: 'actual' }
    : { minutes: norm, source: 'norm' };
}

export interface PayHoursSummary {
  /** What the month is paid on. */
  totalMinutes: number;
  /** How much of the above came from each source. */
  normMinutes: number;
  actualMinutes: number;
  sectorsOnNorm: number;
  sectorsOnActual: number;
  /** Distinct "DEP-ARR" pairs not on the published list, so they are visible rather than absorbed. */
  unlistedSectors: string[];
}

export interface PayableSector {
  departureAirport: string;
  arrivalAirport: string;
  totalTimeMinutes: number;
}

/**
 * Totals a month's flying the way it is paid.
 *
 * Reporting `unlistedSectors` is the point as much as the total is: a sector missing from the
 * table is indistinguishable from a sector the table never covered, and both silently change the
 * figure. Naming them lets the difference be checked against the published list.
 */
export function summarisePayHours(sectors: PayableSector[]): PayHoursSummary {
  const summary: PayHoursSummary = {
    totalMinutes: 0,
    normMinutes: 0,
    actualMinutes: 0,
    sectorsOnNorm: 0,
    sectorsOnActual: 0,
    unlistedSectors: [],
  };
  const unlisted = new Set<string>();

  for (const sector of sectors) {
    const { minutes, source } = sectorPayTime(
      sector.departureAirport,
      sector.arrivalAirport,
      sector.totalTimeMinutes,
    );
    const label = `${sector.departureAirport}-${sector.arrivalAirport}`;

    summary.totalMinutes += minutes;
    if (source === 'norm') {
      summary.normMinutes += minutes;
      summary.sectorsOnNorm += 1;
    } else {
      summary.actualMinutes += minutes;
      summary.sectorsOnActual += 1;
      unlisted.add(label);
    }
  }

  summary.unlistedSectors = [...unlisted].sort();
  return summary;
}
