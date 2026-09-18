import { EMPTY_MONTHLY_DAYS, type MonthlyDays, type PaySector } from '@pilot-logbook/core';

import type { AimsRoster } from '../roster/aims';
import type { MonthSource } from './payInputs';

/**
 * Everything Pay needs about a month, read off the roster.
 *
 * Pay used to have an importer of its own: the same "Personal Crew Schedule Report" PDF, parsed a
 * second time into day counts and sectors and kept in its own table. Once the Roster tab learned
 * to read that PDF there was no reason for a second reading of the same document — only for two
 * answers to the same question, and a screen asking the pilot which of them to believe. The rules
 * that parser had earned are the ones below; what they now read is the roster.
 */
const HOME_BASE = 'ALA';
/** Air Astana's training events, as they are coded on the roster. */
const TRAINING_CODE = /^(GRTC|ASM|SIMT|SIM|OPC|LPC|TRN)/i;
const MEDICAL_CODE = /^MED/i;
/** Codes that say the day was spent at base, and the one that says it was spent away. */
const HOME_CODES = new Set(['OFF', 'HOMX', 'HOMS', 'AVLB']);
// DOFF = "Day Off Downroute" per the report's own legend: a rest day away from base, mid-trip.
const AWAY_CODES = new Set(['DOFF']);

/**
 * One source per month the roster says anything about, ready for `buildPayInputs`.
 *
 * Every month, not just the one on screen: ИПН bands on cumulative income, so core replays the
 * year, and a roster that now holds several months can answer for all of them.
 */
export function payMonthsFromRoster(roster: AimsRoster | undefined): MonthSource[] {
  if (!roster) return [];
  const sectors = operatingSectors(roster);
  const months = new Set<string>([
    ...roster.duties.map((duty) => duty.date.slice(0, 7)),
    ...roster.duties.flatMap((duty) => duty.flights.map((flight) => flight.date.slice(0, 7))),
    ...roster.absences.map((absence) => absence.date.slice(0, 7)),
    ...(roster.activities ?? []).map((activity) => activity.date.slice(0, 7)),
  ].filter((month) => /^\d{4}-\d{2}$/.test(month)));

  return [...months].sort().map((month) => ({
    month,
    days: payDaysForMonth(roster, month),
    sectors: sectors.filter((sector) => sector.date.startsWith(month)),
  }));
}

/** The legs that earn flight pay: the ones the pilot operated, not the ones they rode on. */
function operatingSectors(roster: AimsRoster | undefined): PaySector[] {
  return (roster?.duties ?? [])
    .flatMap((duty) => duty.flights)
    .filter((flight) => !flight.deadhead)
    .map((flight) => ({
      date: flight.date,
      departureAirport: flight.origin,
      arrivalAirport: flight.destination,
      // The roster prints each leg's times in the local clock of whichever station it sits under,
      // so real elapsed minutes need a timezone lookup this does not do. Harmless for a route on
      // the published norms list, which is priced on the norm whatever the actual time; a route
      // missing from it shows as an unlisted sector — see `PayHoursSummary.unlistedSectors`.
      totalTimeMinutes: 0,
    }));
}

export function payDaysForMonth(roster: AimsRoster | undefined, month: string): MonthlyDays {
  if (!roster) return { ...EMPTY_MONTHLY_DAYS };
  const inMonth = (date: string) => date.startsWith(month);
  const activities = (roster.activities ?? []).filter((activity) => inMonth(activity.date));

  const vacation = roster.absences.filter((absence) => absence.code === 'VAC' && inMonth(absence.date)).map((absence) => absence.date);
  const vacationDays = new Set(vacation);
  const medicalExamDays = new Set(activities.filter((activity) => MEDICAL_CODE.test(activity.code)).map((activity) => activity.date));
  const codedTraining = new Set(activities.filter((activity) => TRAINING_CODE.test(activity.code)).map((activity) => activity.date));

  return {
    vacationDays: vacationDays.size,
    // Air Astana's own per-day vacation rule excludes Sundays — its roster/payroll example of
    // 06–12 May counts six VAC days, not seven. Every calendar day still shrinks accrued salary;
    // only the paid ones add to the vacationPay line.
    paidVacationDays: [...vacationDays].filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0).length,
    medicalExamDays: medicalExamDays.size,
    trainingDays: trainingTrip(roster, month, codedTraining).size,
  };
}

/**
 * Air Astana pays a training event as the whole away-from-base trip it falls in — the positioning
 * flight out, the training itself, and the journey back — not just the days the training code is
 * printed on.
 *
 * Confirmed against a real June 2026 payslip: OPC on the 7th and SIMT on the 8th, with the trip
 * running the 6th to the 10th (positioning to Frankfurt on the 6th, training on the 7th and 8th,
 * Day Off Downroute on the 9th, home overnight on the 9th–10th), paid as 5 training days. This is
 * training only; vacation and medical-exam days are never travel trips.
 */
function trainingTrip(roster: AimsRoster, month: string, codedTraining: Set<string>): Set<string> {
  const trip = new Set<string>();
  if (!codedTraining.size) return trip;
  const where = whereabouts(roster);
  const lastDay = daysInMonth(month);

  for (const date of codedTraining) {
    trip.add(date);
    // A training day the pilot spent at base is a day, not a trip: there is no journey either side
    // of it to pay for. Only a day away from base pulls in the travel around it.
    if (where(date) !== 'away') continue;

    let start = date;
    while (dayOfMonth(start) > 1 && where(addDays(start, -1)) === 'away') start = addDays(start, -1);

    let end = date;
    while (dayOfMonth(end) < lastDay) {
      const next = where(addDays(end, 1));
      if (next === 'away') { end = addDays(end, 1); continue; }
      // One home day is still part of the trip: it is the day the pilot got back.
      if (next === 'home') end = addDays(end, 1);
      break;
    }
    for (let day = start; day <= end; day = addDays(day, 1)) trip.add(day);
  }
  return trip;
}

type Presence = 'home' | 'away' | 'unknown';

/**
 * Where the pilot ended each day, as far as the roster can tell.
 *
 * A day is read from the last sector to land on it — a flight that leaves on the 9th and lands on
 * the 10th places the pilot on the 10th, not the 9th, which is exactly the shape of a trip's
 * overnight leg home. A day with no landing carries forward from the day before, because a pilot
 * who does not fly is where they already were; a duty code that names the day OFF, on standby or
 * downroute overrides that carry.
 *
 * Carrying forward is what the report's calendar grid could not do. Pay's own parser read each
 * column on its own and had to call every coded training day "away" to make the trip walk work,
 * which meant it could not tell a Frankfurt simulator slot from a ground refresher at base.
 */
function whereabouts(roster: AimsRoster) {
  const landings = new Map<string, { at: string; station: string }>();
  for (const duty of roster.duties) {
    for (const flight of duty.flights) {
      const date = flight.arrivalDate ?? flight.date;
      const at = `${date}T${flight.arrival}`;
      const known = landings.get(date);
      if (!known || at >= known.at) landings.set(date, { at, station: flight.destination });
    }
  }
  const coded = new Map<string, Presence>();
  for (const activity of roster.activities ?? []) {
    const code = activity.code.toUpperCase();
    if (HOME_CODES.has(code)) coded.set(activity.date, 'home');
    else if (AWAY_CODES.has(code)) coded.set(activity.date, 'away');
  }

  const dated = [...new Set([...landings.keys(), ...coded.keys()])].sort();
  const presence = new Map<string, Presence>();
  let carried: Presence = 'unknown';
  for (const [index, date] of dated.entries()) {
    const landing = landings.get(date);
    carried = landing ? (landing.station === HOME_BASE ? 'home' : 'away') : coded.get(date) ?? carried;
    presence.set(date, carried);
    // Fill the gap up to the next dated day, so a run of unrostered days keeps the position.
    const next = dated[index + 1];
    for (let day = addDays(date, 1); next && day < next; day = addDays(day, 1)) presence.set(day, carried);
  }

  return (date: string): Presence => presence.get(date) ?? 'unknown';
}

function dayOfMonth(date: string) { return Number(date.slice(8, 10)); }
function daysInMonth(month: string) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}
function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
