import { ExtractedPage, TextItem } from '../pdf-import/types';

import { EMPTY_MONTHLY_DAYS, MonthlyDays, PaySector } from './payPeriod';

export interface ParsedCrewSchedule {
  month: string;
  days: MonthlyDays;
  /** Codes that affected pay, retained for an auditable import summary. */
  matchedCodes: { date: string; code: string; payItem: 'vacation' | 'training' | 'medicalExam' }[];
  /**
   * Every flight leg on the roster, departure and arrival airport only — no block time, since the
   * report prints each leg's times in the *local time of whichever station the item sits under*,
   * and turning that into real elapsed minutes needs a timezone lookup this parser doesn't do.
   * Harmless for a route on the published norms list (`normsTable.ts`), which is priced on the
   * norm regardless of actual time; a route missing from it will show as an unlisted sector with
   * 0 actual minutes instead of a real figure — see `PayHoursSummary.unlistedSectors`.
   */
  sectors: PaySector[];
}

interface DayColumn {
  day: number;
  month: number;
  x: number;
}

const DATE_RANGE = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/;
const DAY_HEADER = /^\d{2}\/\d{2}$/;
const TRAINING_CODES = /^(GRTC|ASM\d*|SIMT|OPC)$/i;
const MEDICAL_CODES = /^MED[A-Z0-9]*$/i;

/**
 * Air Astana pays a training event (OPC/SIMT/GRTC/ASM*) as the whole away-from-base trip it
 * falls in -- positioning flight out, the training day(s) themselves, and the trip back -- not
 * just the single calendar day the training code is printed on. Confirmed against a real June
 * 2026 payslip: OPC on the 7th and SIMT on the 8th, with the trip running 6th-10th (positioning
 * to Frankfurt on the 6th, training on the 7th-8th, return on the 9th-10th), paid 5 training
 * days. This only applies to training -- vacation and medical-exam days are never travel trips.
 */
const HOME_BASE = 'ALA';
const AIRPORT_CODE = /^\*?[A-Z]{3}$/;
const HOME_DUTY_CODES = new Set(['OFF', 'HOMX', 'AVLB']);
// DOFF = "Day Off Downroute" per the report's own legend: a rest day away from base, mid-trip.
const AWAY_DUTY_CODES = new Set(['DOFF']);

function reportMonth(items: TextItem[]): string | undefined {
  const text = items.map((item) => item.str).join(' ');
  const match = text.match(DATE_RANGE);
  if (!match) return undefined;

  const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = match;
  if (startMonth !== endMonth || startYear !== endYear || startDay !== '01') return undefined;
  return `${startYear}-${startMonth}`;
}

function isWithinMonth(column: DayColumn, month: string): boolean {
  return column.month === Number(month.slice(5, 7));
}

/** Every day column on the page, whichever month it belongs to — de-duplicated by (day, month)
 *  pair, not day alone, since a spillover column can legitimately share a day number with a
 *  same-month column (June's own 01/06 and the next month's spillover 01/07 both have day 1). */
function allDayColumns(items: TextItem[]): DayColumn[] {
  const columns: DayColumn[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const label = item.str.trim();
    if (!DAY_HEADER.test(label)) continue;
    const [day, month] = label.split('/').map(Number);
    const key = `${month}-${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push({ day, month, x: item.x });
  }
  return columns.sort((a, b) => a.x - b.x);
}

function dayColumns(items: TextItem[], month: string): DayColumn[] {
  // The report includes the previous or next month's spillover day at an edge — keep only the
  // named month for everything except flight-sector extraction, which needs that spillover column
  // to recover an overnight flight's other end (see extractFlightSectors).
  return allDayColumns(items).filter((column) => isWithinMonth(column, month));
}

function nearestColumn(columns: DayColumn[], x: number): DayColumn | undefined {
  let nearest: DayColumn | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    const candidate = Math.abs(column.x - x);
    if (candidate < distance) {
      nearest = column;
      distance = candidate;
    }
  }
  // Day columns are approximately 25 PDF points wide. A wider match belongs to a different table.
  return distance <= 16 ? nearest : undefined;
}

function dateFor(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

function isPaidVacationDay(month: string, day: number): boolean {
  // Air Astana's roster/payroll example 06-12 May counts six VAC days: Sunday is excluded.
  return new Date(`${dateFor(month, day)}T12:00:00`).getDay() !== 0;
}

function daysInReportedMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

type DayPresence = 'home' | 'away' | 'unknown';

/**
 * The calendar grid sits between the day-of-week header row and the "Total Hours and Statistics"
 * section; the "Other Crew" table below it repeats plenty of 3-letter tokens (PIC, DHC, FJ crew
 * codes) and 4-digit crew IDs that must never be mistaken for airports or flight numbers.
 *
 * "Total Hours and Statistics" isn't reliably one shape: a real export prints it as a single text
 * item, but pdf.js can also hand it back split word-by-word ("Total" / "Hours" / "and" /
 * "Statistics" as four separate items) -- matching only a whole-item "Total"/"Statistics" would
 * silently miss the single-item form, leaving `bottom` at +Infinity and letting the Other Crew
 * table's 4-digit crew IDs get mistaken for flight numbers.
 */
function gridBounds(items: TextItem[]): { top: number; bottom: number } {
  const headerY = Math.min(
    ...items.filter((item) => DAY_HEADER.test(item.str.trim())).map((item) => item.y),
    Number.POSITIVE_INFINITY
  );
  const sectionBoundary = items.find((item) => {
    const text = item.str.trim();
    return text === 'Total' || text === 'Statistics' || (text.includes('Total') && text.includes('Statistics'));
  });
  return { top: headerY + 5, bottom: sectionBoundary ? sectionBoundary.y : Number.POSITIVE_INFINITY };
}

/**
 * Finds, for each calendar day, whether the pilot's duty that day ends at base (home), away from
 * base, or gives no signal either way. Used only to extend a training day into its full trip --
 * see the comment on HOME_BASE above.
 */
function classifyDays(
  items: TextItem[],
  columns: DayColumn[],
  month: string,
  trainingCodeDays: Set<number>
): (day: number) => DayPresence {
  const { top: gridTop, bottom: gridBottom } = gridBounds(items);

  const lastAirportByDay = new Map<number, string>();
  const lastAirportY = new Map<number, number>();
  const dutyPresenceByDay = new Map<number, DayPresence>();

  for (const item of items) {
    if (item.y <= gridTop || item.y >= gridBottom) continue;
    const code = item.str.trim().toUpperCase();
    const column = nearestColumn(columns, item.x);
    if (!column || !isWithinMonth(column, month)) continue;

    if (HOME_DUTY_CODES.has(code)) {
      dutyPresenceByDay.set(column.day, 'home');
    } else if (AWAY_DUTY_CODES.has(code)) {
      dutyPresenceByDay.set(column.day, 'away');
    } else if (code !== 'VAC' && AIRPORT_CODE.test(code)) {
      const existingY = lastAirportY.get(column.day);
      if (existingY === undefined || item.y > existingY) {
        lastAirportY.set(column.day, item.y);
        lastAirportByDay.set(column.day, code.replace('*', ''));
      }
    }
  }

  return (day: number): DayPresence => {
    if (trainingCodeDays.has(day)) return 'away';
    const airport = lastAirportByDay.get(day);
    if (airport) return airport === HOME_BASE ? 'home' : 'away';
    const duty = dutyPresenceByDay.get(day);
    return duty ?? 'unknown';
  };
}

const FLIGHT_NUMBER = /^\d{3,4}$/;
// Duty-code strings that would otherwise false-match AIRPORT_CODE's bare-three-letters shape
// (OFF, THD) or a training code's own three-letter form (OPC) — checked before treating a token
// as an airport, the same way classifyDays checks HOME_DUTY_CODES/AWAY_DUTY_CODES first.
const NON_AIRPORT_CODES = new Set(['VAC', 'THD', ...HOME_DUTY_CODES, ...AWAY_DUTY_CODES]);

function isNonAirportCode(code: string): boolean {
  return NON_AIRPORT_CODES.has(code) || TRAINING_CODES.test(code) || MEDICAL_CODES.test(code);
}

/** Keys a (date, flight number) pair the same way in both extractFlightSectors and findDeadheadFlights. */
function flightKey(date: string, flightNumber: string): string {
  return `${date}:${flightNumber}`;
}

/**
 * Reads every flight leg off the calendar grid: departure and arrival airport only (see
 * `ParsedCrewSchedule.sectors` for why not the block time too) — skipping any leg the pilot
 * deadheaded on rather than operated (see `findDeadheadFlights`): riding along earns no flight
 * pay.
 *
 * The grid is read as one continuous stream in calendar order (day, then top-to-bottom within
 * that day), not day-by-day independently — a flight landing after midnight has its arrival
 * airport printed at the *top* of the next day's column, after a "↓" continuation marker, not
 * under the day it departed. Reading day-by-day would silently drop that airport. Unlike the
 * vacation/training extraction above, this also has to look *past* the target month: a flight
 * departing the month's last day can land in the following month's spillover column (confirmed
 * against a real June 2026 payslip — CrewPay norm hours only reconcile once a flight departing
 * 30/06 and landing in the 01/07 column is counted). A flight is only kept if the day it
 * *departed* is in the target month; where it landed doesn't matter for that.
 */
function extractFlightSectors(items: TextItem[], month: string, deadheadFlights: Set<string>): PaySector[] {
  const { top: gridTop, bottom: gridBottom } = gridBounds(items);
  const columns = allDayColumns(items);

  const stream: { column: DayColumn; y: number; code: string }[] = [];
  for (const item of items) {
    if (item.y <= gridTop || item.y >= gridBottom) continue;
    const column = nearestColumn(columns, item.x);
    if (!column) continue;
    stream.push({ column, y: item.y, code: item.str.trim().toUpperCase() });
  }
  // By x (true calendar order across a month boundary), not by day-of-month — a spillover day at
  // the start or end of the grid can have a smaller or equal day number to the month's own days.
  stream.sort((a, b) => (a.column.x !== b.column.x ? a.column.x - b.column.x : a.y - b.y));

  const sectors: PaySector[] = [];
  let current: { column: DayColumn; flightNumber: string; dep?: string; arr?: string } | undefined;

  for (const { column, code } of stream) {
    if (FLIGHT_NUMBER.test(code)) {
      current = { column, flightNumber: code };
      continue;
    }
    if (isNonAirportCode(code)) continue;
    if (!current || !AIRPORT_CODE.test(code)) continue;

    const airport = code.replace('*', '');
    if (!current.dep) {
      current.dep = airport;
    } else if (!current.arr) {
      if (isWithinMonth(current.column, month)) {
        const date = dateFor(month, current.column.day);
        if (!deadheadFlights.has(flightKey(date, current.flightNumber))) {
          sectors.push({ date, departureAirport: current.dep, arrivalAirport: airport, totalTimeMinutes: 0 });
        }
      }
      current = undefined;
    }
  }

  return sectors;
}

// "9871 BOZZHANOV RAMIL ALA-CP-763" -- the crew ID is what identifies the pilot's own line in the
// "Other Crew" table below, since names alone aren't guaranteed unique.
const CREW_HEADER = /^(\d{3,6})\s+[A-Z][A-Z .'-]+?\s+ALA-[A-Z]+-\d+$/;
const OTHER_CREW_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
// "Other Crew" always lists the flight's actual commander first, e.g. "CP - PIC - 9871 -
// BOZZHANOV RAMIL | FO - 5112 - ...". Used to split the table's wrapped, multi-line detail text
// back into one block per flight.
const CREW_BLOCK_START = /^CP\s*-\s*PIC\s*-/;
// A crew-position qualifier meaning "rode along, didn't operate": PAX (passenger) or DHC
// (deadhead crew) — see the report's own legend.
const DEADHEAD_QUALIFIERS = new Set(['PAX', 'DHC']);

function findCrewId(pages: ExtractedPage[]): string | undefined {
  for (const page of pages) {
    for (const item of page.items) {
      const match = CREW_HEADER.exec(item.str.trim());
      if (match) return match[1];
    }
  }
  return undefined;
}

/**
 * Finds every flight the pilot appears on in the "Other Crew" table as PAX or DHC rather than
 * PIC — riding along, not operating it, and so earning no flight pay for it. Confirmed against a
 * real June 2026 payslip: the 45.95 CrewPay-norm hours it paid only reconcile once the three
 * positioning legs of that month's training trip (flown as PAX, per this same table) are excluded
 * — with them counted the roster implies 57.93 hours, 26% over what was actually paid.
 *
 * The table spans an unpredictable number of pages, with no calendar-grid columns to key off of,
 * so this reads it as one continuous stream instead: each row is `date`, `flight number`, then a
 * multi-line details block whose *first* line is always "CP - PIC - <id> - <name>" — a reliable
 * split point pdf.js's wrapped text otherwise gives no other signal for. Rows and detail blocks
 * are collected separately, then paired up by their shared chronological order — confirmed to
 * line up 1:1 against two real rosters (June and January 2026) once the "Block/Night Hours" and
 * "Date/Duty/Details" table-header text above the first real block (which never starts with
 * "CP - PIC -") is dropped as noise rather than paired with anything.
 */
function findDeadheadFlights(pages: ExtractedPage[], crewId: string): Set<string> {
  interface Row {
    date: string;
    flightNumber: string;
    order: number;
  }
  const rows: Row[] = [];
  const detailLines: { order: number; text: string }[] = [];
  let order = 0;

  for (const page of pages) {
    const items = page.items.filter((item) => item.str.trim());
    // Below the calendar grid only, on whichever page actually has one -- the "Other Crew" table
    // reuses plenty of bare 3-4 digit crew IDs that would otherwise be mistaken for flight numbers
    // if matched against the grid's own day columns.
    const { bottom: gridBottom } = gridBounds(items);
    const below = Number.isFinite(gridBottom) ? items.filter((item) => item.y > gridBottom) : items;

    const byRoundedY = new Map<number, TextItem[]>();
    for (const item of below) {
      const key = Math.round(item.y * 10);
      const bucket = byRoundedY.get(key);
      if (bucket) bucket.push(item);
      else byRoundedY.set(key, [item]);
    }

    for (const item of below) {
      const text = item.str.trim();
      if (OTHER_CREW_DATE.test(text) && item.x < 30) {
        const sameLine = byRoundedY.get(Math.round(item.y * 10)) ?? [];
        const flightItem = sameLine.find((candidate) => {
          const s = candidate.str.trim();
          return FLIGHT_NUMBER.test(s) && candidate.x > 80 && candidate.x < 120;
        });
        if (!flightItem) continue;
        const [dd, mm, yyyy] = text.split('/');
        rows.push({ date: `${yyyy}-${mm}-${dd}`, flightNumber: flightItem.str.trim(), order: order++ });
        continue;
      }
      if (item.x > 150) detailLines.push({ order: order++, text });
    }
  }

  detailLines.sort((a, b) => a.order - b.order);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const { text } of detailLines) {
    if (CREW_BLOCK_START.test(text) && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    current.push(text);
  }
  if (current.length > 0) blocks.push(current);
  // The table-header text ("Block Hours" / "Night Hours" / "Date" / "Duty" / "Details") sits above
  // the first real flight's block and never starts with "CP - PIC -" itself, so it collects into
  // its own leading block here — drop it rather than pairing it with a real row.
  const flightBlocks = blocks.filter((block) => CREW_BLOCK_START.test(block[0]));

  const deadheads = new Set<string>();
  rows.sort((a, b) => a.order - b.order);
  for (let i = 0; i < rows.length && i < flightBlocks.length; i += 1) {
    const text = flightBlocks[i].join(' ');
    const match = new RegExp(`([A-Z]+)\\s*-\\s*(?:([A-Z]+)\\s*-\\s*)?${crewId}\\s*-`).exec(text);
    if (match && match[2] && DEADHEAD_QUALIFIERS.has(match[2])) {
      deadheads.add(flightKey(rows[i].date, rows[i].flightNumber));
    }
  }
  return deadheads;
}

function isScheduleReportPage(items: TextItem[]): boolean {
  // pdf.js sometimes hands back the title as one text item, but a real export of this report
  // splits it word-by-word ("Personal" / "Crew" / "Schedule" / "Report" as four separate items) --
  // matching only a single-item substring would reject every real PDF of this kind. Join the
  // page's text in extraction order (already reading order, same trick reportMonth relies on for
  // DATE_RANGE) and match the title across item boundaries instead.
  const text = items.map((item) => item.str).join(' ');
  return /Personal\s+Crew\s+Schedule\s+Report/i.test(text);
}

/**
 * Extracts salary facts from Air Astana's Personal Crew Schedule Report — the day counts behind
 * the three per-day accruals, and every flight leg flown, so the pay screen never needs a
 * separately-imported logbook. A parser either produces deterministic results or rejects the
 * document; salary screens never ask the pilot to retype these days.
 */
export function parseCrewSchedule(pages: ExtractedPage[]): ParsedCrewSchedule {
  const firstPage = pages.find((page) => isScheduleReportPage(page.items));
  if (!firstPage) throw new Error('Это не Personal Crew Schedule Report Air Astana');

  const month = reportMonth(firstPage.items);
  if (!month) throw new Error('Не удалось определить месяц расписания');

  const columns = dayColumns(firstPage.items, month);
  if (columns.length < 28) throw new Error('Не удалось прочитать календарную сетку расписания');

  const matchedCodes: ParsedCrewSchedule['matchedCodes'] = [];
  const seen = new Set<string>();
  const days = { ...EMPTY_MONTHLY_DAYS };
  const trainingCodeDays = new Set<number>();

  for (const item of firstPage.items) {
    const code = item.str.trim().toUpperCase();
    const column = nearestColumn(columns, item.x);
    if (!column) continue;
    const date = dateFor(month, column.day);

    if (code === 'VAC') {
      const key = `${date}:vacation`;
      if (!seen.has(key)) {
        seen.add(key);
        // Every calendar vacation day shrinks accrued salary the same way a training or
        // medical-exam day does; only the ones Air Astana actually pays for (Sunday excluded —
        // see isPaidVacationDay) also add to the vacationPay line.
        days.vacationDays += 1;
        if (isPaidVacationDay(month, column.day)) days.paidVacationDays += 1;
        matchedCodes.push({ date, code, payItem: 'vacation' });
      }
    } else if (MEDICAL_CODES.test(code)) {
      const key = `${date}:medicalExam`;
      if (!seen.has(key)) {
        seen.add(key);
        days.medicalExamDays += 1;
        matchedCodes.push({ date, code, payItem: 'medicalExam' });
      }
    } else if (TRAINING_CODES.test(code)) {
      trainingCodeDays.add(column.day);
      const key = `${date}:training`;
      if (!seen.has(key)) {
        seen.add(key);
        matchedCodes.push({ date, code, payItem: 'training' });
      }
    }
  }

  // Expand each training day into the full trip it belongs to (see HOME_BASE comment above).
  const classify = classifyDays(firstPage.items, columns, month, trainingCodeDays);
  const daysInMonth = daysInReportedMonth(month);
  const tripDays = new Set<number>();

  for (const trainingDay of trainingCodeDays) {
    if (tripDays.has(trainingDay)) continue;

    let start = trainingDay;
    while (start > 1 && classify(start - 1) === 'away') start -= 1;

    let end = trainingDay;
    while (end < daysInMonth) {
      const next = classify(end + 1);
      if (next === 'away') {
        end += 1;
        continue;
      }
      if (next === 'home') end += 1;
      break;
    }

    for (let day = start; day <= end; day += 1) tripDays.add(day);
  }

  days.trainingDays = tripDays.size;
  for (const day of tripDays) {
    if (!trainingCodeDays.has(day)) {
      matchedCodes.push({ date: dateFor(month, day), code: 'TRIP', payItem: 'training' });
    }
  }
  matchedCodes.sort((a, b) => a.date.localeCompare(b.date));

  const crewId = findCrewId(pages);
  const deadheadFlights = crewId ? findDeadheadFlights(pages, crewId) : new Set<string>();
  const sectors = extractFlightSectors(firstPage.items, month, deadheadFlights);

  return { month, days, matchedCodes, sectors };
}
