import type { AimsDuty } from './aims';

/**
 * A duty's own boundaries, and how to print a clock that falls on a different day from the duty.
 *
 * A duty is filed under the day its flying starts, which is the day every screen shows it on. Its
 * report can be the evening before and its release the morning after, and printing those as bare
 * clocks under that one date says something untrue: "27 OCT, report 22:35" reads as an evening
 * report on the 27th when the pilot is in fact due at the airport the night before.
 *
 * So a clock that belongs to another day carries the day offset, the way AIMS itself marks a
 * sector arriving after midnight.
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
  /** "⁺¹" the day after the duty's own day, "⁻¹" the day before, empty on the day itself. */
  offset: string;
}

/** The clock at a boundary, with the day offset from the duty's own day where there is one. */
export function dutyClock(boundary: string | undefined, dutyDate: string): DutyClock | undefined {
  if (!boundary || boundary.length < 16) return undefined;
  return { time: boundary.slice(11, 16), offset: dayOffset(boundary.slice(0, 10), dutyDate) };
}

const DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function dayOffset(date: string, dutyDate: string) {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dutyDate}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days === 0) return '';
  const magnitude = Math.abs(days).toString().split('').map((digit) => DIGITS[Number(digit)]).join('');
  return (days > 0 ? '⁺' : '⁻') + magnitude;
}
