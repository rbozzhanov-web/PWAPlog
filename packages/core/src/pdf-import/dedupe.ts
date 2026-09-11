import { FlightLogEntry } from '../logbook/types';
import { ParsedCandidate } from './types';

export interface AnnotatedCandidate extends ParsedCandidate {
  isDuplicate: boolean;
}

/**
 * Flags candidates that already exist in the logbook (same date + departure + arrival airport,
 * and matching registration/timeOut when both sides have one). Airline reports commonly cover
 * overlapping periods — e.g. two monthly downloads sharing a few days — so re-importing must not
 * silently double-count hours. Repeats later in the same candidate list are also flagged so a
 * caller can keep the first occurrence and remove the rest before review.
 */
export function annotateDuplicates(
  candidates: ParsedCandidate[],
  existingEntries: FlightLogEntry[],
): AnnotatedCandidate[] {
  return candidates.map((candidate, index) => {
    const isDuplicate = existingEntries.some((existing) =>
      isLikelyDuplicateFields(candidate.fields, existing),
    ) || candidates.slice(0, index).some((previous) =>
      isLikelyDuplicateFields(candidate.fields, previous.fields),
    );
    return { ...candidate, isDuplicate };
  });
}

function isLikelyDuplicateFields(
  fields: Partial<FlightLogEntry>,
  existing: Partial<FlightLogEntry>,
): boolean {
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
