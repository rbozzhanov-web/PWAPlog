import type { AimsDuty } from './aims';

/**
 * A duty's own boundaries, and how to print a clock that falls on a different day from the duty.
 *
 * A duty spans days: it can report one evening, depart after midnight and release the morning
 * after that. Whichever of those days a screen shows it under, printing the rest as bare clocks
 * says something untrue — "report 22:35" under a date reads as an evening report on that date.
 *
 * So every clock is shown against the day it is being displayed under, and one belonging to
 * another day carries the offset, the way AIMS itself marks a sector arriving after midnight.
 */

/** When the duty begins: the report AIMS printed, or the first off-blocks if it printed none. */
export function dutyReportBoundary(duty: AimsDuty) {
  return duty.report ?? duty.start ?? `${duty.date}T${duty.flights[0]?.departure ?? '00:00'}`;
}

/**
 * When the pilot is actually free — AIMS' debriefing time, which is what the roster's own release
 * column shows. The last leg's on-blocks is only a fallback for a duty AIMS gave no boundary for:
 * it is the wrong figure to plan an evening around, being half an hour or so early.
 */
export function dutyReleaseBoundary(duty: AimsDuty) {
  const last = duty.flights.at(-1);
  const onBlocks = last ? `${last.arrivalDate ?? last.date}T${last.arrival}` : dutyReportBoundary(duty);
  return duty.release ?? duty.end ?? onBlocks;
}

export interface DutyClock {
  time: string;
  /** "⁺¹" the day after the one being shown, "⁻¹" the day before, empty on the day itself. */
  offset: string;
}

/** The clock at a boundary, with the day offset from whichever day it is being shown under. */
export function dutyClock(boundary: string | undefined, onDate: string): DutyClock | undefined {
  if (!boundary || boundary.length < 16) return undefined;
  return clockAt(boundary.slice(0, 10), boundary.slice(11, 16), onDate);
}

/** The same, for a clock whose date is carried separately — a sector's own departure or arrival. */
export function clockAt(date: string, time: string, onDate: string): DutyClock {
  return { time, offset: dayOffset(date, onDate) };
}

const DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function dayOffset(date: string, onDate: string) {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${onDate}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days === 0) return '';
  const magnitude = Math.abs(days).toString().split('').map((digit) => DIGITS[Number(digit)]).join('');
  return (days > 0 ? '⁺' : '⁻') + magnitude;
}
