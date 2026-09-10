import { FlightLogEntry } from '../logbook/types';
import { ParsedCandidate } from './types';

export interface AnnotatedCandidate extends ParsedCandidate {
  isDuplicate: boolean;
}

/**
 * Flags candidates that already exist in the logbook (same date + departure + arrival airport,
 * and matching registration/timeOut when both sides have one). Airline reports commonly cover
 * overlapping periods — e.g. two monthly downloads sharing a few days — so re-importing must not
 * silently double-count hours. Flagged rows are still returned (never dropped): the review screen
 * default-excludes them but lets the user re-include a deliberate re-import.
 */
export function annotateDuplicates(
  candidates: ParsedCandidate[],
  existingEntries: FlightLogEntry[],
): AnnotatedCandidate[] {
  return candidates.map((candidate) => {
    const isDuplicate = existingEntries.some((existing) => isLikelyDuplicate(candidate, existing));
    return { ...candidate, isDuplicate };
  });
}

function isLikelyDuplicate(candidate: ParsedCandidate, existing: FlightLogEntry): boolean {
  const fields = candidate.fields;
  if (!fields.date || !fields.departureAirport || !fields.arrivalAirport) return false;

  if (fields.date !== existing.date) return false;
  if (fields.departureAirport !== existing.departureAirport) return false;
  if (fields.arrivalAirport !== existing.arrivalAirport) return false;

  if (fields.aircraftRegistration && existing.aircraftRegistration) {
    if (fields.aircraftRegistration !== existing.aircraftRegistration) return false;
  }

  if (fields.timeOut && existing.timeOut) {
    if (fields.timeOut !== existing.timeOut) return false;
  }

  // A training session and a real flight can share date and airport (a sim session is logged at
  // the training centre, e.g. ALA-ALA), so they must never collapse into each other; nor should
  // two sessions on different devices the same day.
  if ((fields.simulatorMinutes ?? 0) > 0 !== (existing.simulatorMinutes ?? 0) > 0) return false;
  if (fields.simulatorType && existing.simulatorType) {
    if (fields.simulatorType !== existing.simulatorType) return false;
  }

  return true;
}
