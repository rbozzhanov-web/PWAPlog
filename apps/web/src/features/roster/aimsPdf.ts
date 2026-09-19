import type { ExtractedPage, TextItem } from '@pilot-logbook/core/pdf-import';

import { crewRole, withinADay, type AimsAbsence, type AimsActivity, type AimsCrewMember, type AimsDuty, type AimsFlight, type AimsRoster } from './aims';

/**
 * Reads Air Astana's "Personal Crew Schedule Report" PDF into the same `AimsRoster` the Web
 * Archive importer produces.
 *
 * The two sources carry the same roster by different routes. The Web Archive is whatever period
 * AIMS happens to have open, saved from the browser; the PDF is the month AIMS publishes as a
 * document, which is how a pilot gets next month's roster before it is browsable. Producing one
 * shape from both is the whole point: every screen downstream — Home's next duty, the Roster
 * timeline, Pay's day counts, the logbook's "already flown" matching — keeps working without
 * knowing which file the pilot happened to have.
 *
 * Matching the Web Archive's *values*, not just its shape, is what stops the same sector arriving
 * twice. Flight numbers get the same `KC` prefix, dates are the departure station's local date,
 * and airport codes are as printed — so `sectorIdentity` and `aimsSectorId` in completedSectors.ts
 * recognise a PDF sector and an archive sector as the one flight.
 */

const PERIOD_RE = /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;
const DATE_DDMMYYYY_RE = /^([0-3]\d)\/([01]\d)\/(\d{4})$/;
const DAY_HEADING_RE = /^([0-3]\d)\/([01]\d)$/;
const CELL_TIME_RE = /^(A?)([0-2]\d):([0-5]\d)$/;
const PLAIN_TIME_RE = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
const STATION_RE = /^(\*?)([A-Z]{3,4})$/;
const AIRCRAFT_RE = /^\[([A-Z0-9]{2,6})\]$/;
const FLIGHT_NUMBER_RE = /^\d{1,5}$/;
/** "M" for a memo, "R" for a requested day — printed in the grid, but not part of the duty. */
const INDICATOR_RE = /^[MR](,[MR])*$/;
/** A sector that runs past midnight is printed twice: "→" on the day it leaves, "↓" where it lands. */
const CONTINUES = '→';
const CONTINUED = '↓';
const GRID_END_HEADINGS = ['Total Hours', 'Other Crew', 'Expiry Dates'];
/** Everything AIMS prints in the grid that is not a duty: days off, standby, leave, sickness. */
const NON_DUTY_CODES = new Set(['OFF', 'DOFF', 'UFF', 'SICK', 'AVLB', 'LVE', 'VAC', 'ULV', 'ROFF', 'NR', 'HOMS', 'HOMX', 'CHLD', 'BOFF']);
const ABSENCE_CODES: AimsAbsence['code'][] = ['SICK', 'UFF', 'VAC', 'CHLD'];
/** A ground duty is a code with its own start and end time — training, office, a simulator slot. */
const GROUND_DUTY_CODE_RE = /^[A-Z][A-Z0-9_]{1,7}$/;

export function parseAimsSchedulePdf(pages: ExtractedPage[]): AimsRoster {
  const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ');
  if (!/AIR\s+ASTANA/i.test(text) || !/Personal\s+Crew\s+Schedule\s+Report/i.test(text)) {
    throw new Error('This is not an Air Astana Personal Crew Schedule Report. Export the report from AIMS and import that PDF.');
  }
  const period = parsePeriod(pages);
  if (!period) throw new Error('Could not read the roster period from this PDF.');

  const columns = dayColumns(pages, period);
  if (!columns.length) throw new Error('Could not read the calendar grid in this PDF.');
  const titles = dutyCodeTitles(pages);
  const reading = readGrid(columns, titles);
  if (!reading.duties.length && !reading.activities.length) {
    throw new Error('This report has no duties or days off on it. Export a fresh copy from AIMS.');
  }
  attachCrew(reading.duties, crewRecords(pages), selfStaffId(pages));

  return {
    period,
    coverage: period,
    source: 'pdf',
    duties: reading.duties,
    hotels: [],
    absences: reading.absences,
    activities: reading.activities,
    totals: reportTotals(pages),
    importedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------- header

function parsePeriod(pages: ExtractedPage[]) {
  for (const page of pages) {
    for (const line of lines(page)) {
      const match = PERIOD_RE.exec(line.text);
      const start = match && isoDate(match[1]);
      const end = match && isoDate(match[2]);
      if (start && end) return { start, end };
    }
  }
  return undefined;
}

/** "9871 BOZZHANOV RAMIL ALA-CP-763" — the id the pilot's own line in Other Crew is filed under. */
function selfStaffId(pages: ExtractedPage[]) {
  for (const page of pages) {
    for (const item of page.items) {
      const match = /^(\d{2,6})\s+[A-Z][A-Z' .-]+\s+[A-Z]{3}-[A-Z0-9]{2,3}-[A-Z0-9]{2,6}$/.exec(item.str.trim());
      if (match) return match[1];
    }
  }
  return undefined;
}

/** The report's own "Block Hours / Night Hours" summary, read by column rather than by position. */
function reportTotals(pages: ExtractedPage[]): AimsRoster['totals'] {
  for (const page of pages) {
    const pageLines = lines(page);
    const index = pageLines.findIndex((line) => line.text.startsWith('Block Hours'));
    const heading = pageLines[index];
    const values = pageLines[index + 1];
    if (!heading || !values) continue;
    return {
      blockMinutes: minutesUnder(values.items, heading.items.find((item) => item.str.trim().startsWith('Block'))?.x),
      nightMinutes: minutesUnder(values.items, heading.items.find((item) => item.str.trim().startsWith('Night'))?.x),
    };
  }
  return {};
}
function minutesUnder(items: TextItem[], headingX?: number) {
  if (headingX === undefined) return undefined;
  const item = items
    .filter((candidate) => /^\d{1,4}:[0-5]\d$/.test(candidate.str.trim()))
    .sort((a, b) => Math.abs(a.x - headingX) - Math.abs(b.x - headingX))[0];
  if (!item) return undefined;
  const [hours, mins] = item.str.trim().split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * The "Descriptions" section spells out every code the grid uses — "HOMS - Home Standby" — which
 * is what lets the roster say "Home Standby" rather than "HOMS".
 *
 * Read item by item rather than line by line: the section prints its "Indicators" key in a second
 * column, so the line through "HOMS - Home Standby" also carries "R - Requested" and reading the
 * line would name the day "Home Standby R - Requested".
 */
function dutyCodeTitles(pages: ExtractedPage[]) {
  const titles = new Map<string, string>();
  for (const page of pages) {
    const heading = lines(page).find((line) => line.text.startsWith('Descriptions'));
    if (!heading) continue;
    for (const item of page.items) {
      if (item.y <= heading.y) continue;
      const match = /^([A-Z][A-Z0-9_]{1,7})\s+-\s+([^-]+)$/.exec(item.str.trim());
      if (match && !titles.has(match[1])) titles.set(match[1], match[2].trim());
    }
  }
  return titles;
}

// ---------------------------------------------------------------------------- the calendar grid

interface DayColumn { date: string; cells: string[] }

/**
 * Slices the calendar grid into one column of cells per day, in reading order.
 *
 * A column is claimed by x-position: the grid has no ruling lines in the text layer, only the day
 * headings, so each heading owns the band from a quarter-column left of itself to a quarter-column
 * left of the next heading. That off-centre band is deliberate — AIMS prints a cell's flight
 * number, times and airports at slightly different x-offsets under the heading, and centring the
 * band on the heading cuts the left-most of them into the previous day.
 */
function dayColumns(pages: ExtractedPage[], period: { start: string; end: string }): DayColumn[] {
  const byDate = new Map<string, DayColumn>();
  for (const page of pages) {
    const heading = lines(page).find((line) => line.items.filter((item) => DAY_HEADING_RE.test(item.str.trim())).length >= 3);
    if (!heading) continue;
    const headings = heading.items.filter((item) => DAY_HEADING_RE.test(item.str.trim())).sort((a, b) => a.x - b.x);
    const top = heading.y + 12;
    const end = lines(page).find((line) => line.y > top && GRID_END_HEADINGS.some((marker) => line.text.startsWith(marker)));
    const bottom = end ? end.y - 2 : Number.POSITIVE_INFINITY;
    const pitch = headings.length > 1 ? headings[1].x - headings[0].x : page.width;
    const pad = pitch / 4;
    const body = page.items.filter((item) => item.str.trim() && item.y > top && item.y < bottom);

    headings.forEach((item, index) => {
      const date = gridDate(item.str.trim(), period);
      if (!date || byDate.has(date)) return;
      const from = item.x - pad;
      const to = (headings[index + 1]?.x ?? Number.POSITIVE_INFINITY) - pad;
      const cells = body
        .filter((cell) => cell.x >= from && cell.x < to)
        .sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? a.y - b.y : a.x - b.x))
        .map((cell) => cell.str.trim());
      byDate.set(date, { date, cells });
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** A heading is only "DD/MM" — the year comes from whichever end of the period it lands in. */
function gridDate(label: string, period: { start: string; end: string }) {
  const match = DAY_HEADING_RE.exec(label);
  if (!match) return undefined;
  const [, day, month] = match;
  for (const year of new Set([period.start.slice(0, 4), period.end.slice(0, 4)])) {
    const candidate = `${year}-${month}-${day}`;
    if (isRealDate(candidate) && candidate >= period.start && candidate <= addDays(period.end, 1)) return candidate;
  }
  return undefined;
}

interface GridReading { duties: AimsDuty[]; absences: AimsAbsence[]; activities: AimsActivity[] }

/**
 * Walks the grid day by day, cell by cell, turning it back into duties.
 *
 * The grid is a picture of a timeline, so reading it needs the same memory the picture assumes:
 * a duty's report time is printed above its first flight and its release below the last, a sector
 * that lands after midnight leaves its arrival in the next day's column, and a standby that runs
 * overnight ends in the next day's column too. Each of those is carried across the column
 * boundary rather than read twice, which is why a duty spanning midnight produces one duty here,
 * not two.
 */
function readGrid(columns: DayColumn[], titles: Map<string, string>): GridReading {
  const duties: AimsDuty[] = [];
  const absences: AimsAbsence[] = [];
  const activities: AimsActivity[] = [];
  let duty: AimsDuty | undefined;
  let carriedFlight: AimsFlight | undefined;
  let carriedActivity: AimsActivity | undefined;

  for (const { date, cells } of columns) {
    let i = 0;
    while (i < cells.length) {
      const cell = cells[i];

      if (cell === CONTINUED) {
        i += 1;
        if (carriedFlight) { i = landCarriedFlight(carriedFlight, cells, i, date); carriedFlight = undefined; continue; }
        if (carriedActivity && plainTime(cells[i])) { carriedActivity.end = `${date}T${cells[i]}`; carriedActivity = undefined; i += 1; }
        continue;
      }
      if (cell === CONTINUES || INDICATOR_RE.test(cell)) { i += 1; continue; }

      if (NON_DUTY_CODES.has(cell)) {
        const activity: AimsActivity = { date, code: cell, title: titles.get(cell), type: '' };
        i += 1;
        if (plainTime(cells[i])) { activity.start = `${date}T${cells[i]}`; i += 1; }
        if (plainTime(cells[i])) { activity.end = `${date}T${cells[i]}`; i += 1; }
        if (cells[i] === CONTINUES && !activity.end) carriedActivity = activity;
        activities.push(activity);
        if ((ABSENCE_CODES as string[]).includes(cell)) absences.push({ code: cell as AimsAbsence['code'], date });
        duty = undefined;
        continue;
      }

      if (FLIGHT_NUMBER_RE.test(cell)) {
        const open = duty ?? openDuty(duties, date);
        duty = open;
        const read = readSector(cells, i, date);
        if (!read) { i += 1; continue; }
        open.flights.push(read.flight);
        if (read.continues) carriedFlight = read.flight;
        i = read.next;
        continue;
      }

      if (plainTime(cell)) {
        i += 1;
        // A time on its own is a duty boundary: report when a flight follows it, release when the
        // duty it closes is already open. A report can sit alone in the column its duty starts in,
        // with the flight itself printed after midnight in the next one — so a trailing time with
        // no duty open opens one rather than being dropped.
        if (duty && !FLIGHT_NUMBER_RE.test(cells[i] ?? '')) { duty.release = `${date}T${cell}`; duty = undefined; }
        else { duty = openDuty(duties, date); duty.report = `${date}T${cell}`; }
        continue;
      }

      // A ground duty prints its code between its own two times: "SIMT 08:00 14:00".
      if (GROUND_DUTY_CODE_RE.test(cell) && plainTime(cells[i + 1]) && plainTime(cells[i + 2])) {
        activities.push({ date, code: cell, title: titles.get(cell), type: '', start: `${date}T${cells[i + 1]}`, end: `${date}T${cells[i + 2]}` });
        duty = undefined;
        i += 3;
        continue;
      }
      if (GROUND_DUTY_CODE_RE.test(cell)) { activities.push({ date, code: cell, title: titles.get(cell), type: '' }); i += 1; continue; }
      i += 1;
    }
  }

  // A duty is filed under the day its first sector leaves, the same as the Web Archive files it —
  // so an 22:35 report for a flight that leaves at 00:05 belongs to the flight's day, not the
  // report's. Duties that never picked up a sector (a lone standby boundary) are not duties.
  const flown = duties.filter((candidate) => candidate.flights.length > 0);
  for (const candidate of flown) candidate.date = candidate.flights[0].date;
  flown.sort((a, b) => (a.report ?? a.date).localeCompare(b.report ?? b.date));
  return { duties: flown, absences, activities };
}

function openDuty(duties: AimsDuty[], date: string): AimsDuty {
  const duty: AimsDuty = { date, flights: [] };
  duties.push(duty);
  return duty;
}

/** flight number, off-blocks, origin, destination, on-blocks, and the aircraft if it is printed. */
function readSector(cells: string[], start: number, date: string) {
  let i = start;
  const flightNumber = cells[i];
  i += 1;
  const departure = cellTime(cells[i]);
  if (!departure) return undefined;
  i += 1;
  const origin = station(cells[i]);
  if (!origin) return undefined;
  i += 1;

  const flight: AimsFlight = {
    flightNumber: `KC${flightNumber}`,
    date,
    origin: origin.code,
    destination: '',
    departure: departure.time,
    arrival: '',
    deadhead: origin.deadhead,
    actualTimes: false,
  };
  if (cells[i] === CONTINUES) return { flight, next: i + 1, continues: true };

  const destination = station(cells[i]);
  if (!destination) return undefined;
  i += 1;
  const arrival = cellTime(cells[i]);
  if (!arrival) return undefined;
  i += 1;
  flight.destination = destination.code;
  flight.arrival = arrival.time;
  flight.deadhead = flight.deadhead || destination.deadhead;
  // The Web Archive reads "has this sector operated?" off the arrival for the same reason: an
  // actual arrival is the last thing to be posted, so it is what says the flight is in the past.
  flight.actualTimes = arrival.actual;
  const aircraft = AIRCRAFT_RE.exec(cells[i] ?? '');
  if (aircraft) { flight.aircraftType = aircraft[1]; i += 1; }
  return { flight, next: i, continues: false };
}

/** Finishes a sector whose arrival is printed in the column of the day it landed on. */
function landCarriedFlight(flight: AimsFlight, cells: string[], start: number, date: string) {
  let i = start;
  const destination = station(cells[i]);
  if (destination) { flight.destination = destination.code; flight.deadhead = flight.deadhead || destination.deadhead; i += 1; }
  const arrival = cellTime(cells[i]);
  if (arrival) { flight.arrival = arrival.time; flight.actualTimes = arrival.actual; flight.arrivalDate = date; i += 1; }
  const aircraft = AIRCRAFT_RE.exec(cells[i] ?? '');
  if (aircraft) { flight.aircraftType = aircraft[1]; i += 1; }
  return i;
}

// ---------------------------------------------------------------------------- Other Crew

interface CrewRecord { date: string; flightNumber: string; members: AimsCrewMember[] }
/** "CP - PIC - 9871 - NAME", "FO - 12721 - NAME", "3P - 5112 - NAME" — rank, optional role, id, name. */
const CREW_MEMBER_RE = /^([A-Z0-9]{2,3})\s*-\s*(?:([A-Z]{2,4})\s*-\s*)?(\d{1,6})\s*-\s*(.+)$/;
/** The qualifiers that mean "rode along": deadhead crew, or carried as a passenger. */
const DEADHEAD_QUALIFIERS = new Set(['DHC', 'PAX']);
const CREW_END_HEADINGS = new Set(['Expiry Dates', 'Hotel Information', 'Memos', 'Descriptions']);

/**
 * Reads the "Other Crew" table, which lists who else was on each flight.
 *
 * The table has no grid to key off and pdf.js hands its Details column back as wrapped fragments,
 * so each fragment is assigned to whichever date row it sits closest to vertically. That is what
 * the printed table means — a row's details are the text beside it — and it survives the varying
 * number of lines a long cabin crew list wraps to, which pairing fragments to rows in order does
 * not.
 */
function crewRecords(pages: ExtractedPage[]): CrewRecord[] {
  const records: CrewRecord[] = [];
  let columns: { date: number; duty: number; details: number } | undefined;
  let inside = false;

  for (const page of pages) {
    const pageLines = lines(page);
    const heading = pageLines.find((line) => ['Date', 'Duty', 'Details'].every((label) => line.items.some((item) => item.str.trim() === label)));
    if (heading) {
      const at = (label: string) => heading.items.find((item) => item.str.trim() === label)?.x;
      const [date, duty, details] = [at('Date'), at('Duty'), at('Details')];
      columns = date === undefined || duty === undefined || details === undefined ? undefined : { date, duty, details };
      inside = columns !== undefined;
    }
    if (!inside || !columns) continue;

    const stop = pageLines.filter((line) => line.items.some((item) => CREW_END_HEADINGS.has(item.str.trim()))).sort((a, b) => a.y - b.y)[0];
    // The report repeats its title block at the top of every page and its "Generated on" line at
    // the bottom, both of them far enough right to sit in the Details column. On the page the
    // table's own heading is on they fall outside it anyway; on the pages the table continues
    // onto there is no heading, so they have to be cut here or the title and the reporting period
    // are read as the first flight's crew — which costs that flight its captain, the one name the
    // fragment they are glued to begins with.
    const top = Math.max(heading?.y ?? Number.NEGATIVE_INFINITY, pageHeaderBottom(pageLines));
    const bottom = Math.min(stop?.y ?? Number.POSITIVE_INFINITY, pageFooterTop(pageLines));
    const usable = page.items.filter((item) => item.str.trim() && item.y > top && item.y < bottom);
    const { date: dateX, duty: dutyX, details: detailsX } = columns;
    const anchors = usable.filter((item) => inColumn(item, dateX, dutyX) && isoDate(item.str)).sort((a, b) => a.y - b.y);
    const duties = usable.filter((item) => inColumn(item, dutyX, detailsX));
    const details = usable.filter((item) => item.x >= detailsX - 4);

    anchors.forEach((anchor, index) => {
      const flight = duties.slice().sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];
      if (!flight || Math.abs(flight.y - anchor.y) > 12) return;
      const text = details
        .filter((item) => nearestIndex(anchors, item.y) === index)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((item) => item.str.trim())
        .join(' ');
      const members = text.split('|').map(crewMember).filter((member): member is AimsCrewMember => member !== undefined);
      if (members.length) records.push({ date: isoDate(anchor.str)!, flightNumber: `KC${flight.str.trim()}`, members });
    });

    if (stop) inside = false;
  }
  return records;
}

function crewMember(raw: string): AimsCrewMember | undefined {
  const match = CREW_MEMBER_RE.exec(raw.trim());
  if (!match) return undefined;
  const [, rank, qualifier, id, name] = match;
  const position = qualifier ? `${rank} - ${qualifier}` : rank;
  return {
    id,
    name: name.replace(/\s+/g, ' ').trim(),
    role: crewRole(rank),
    position,
    deadhead: qualifier && DEADHEAD_QUALIFIERS.has(qualifier) ? true : undefined,
  };
}

/**
 * Hangs each flight's crew list off the flight.
 *
 * Other Crew dates a flight by its UTC departure while the grid dates it by the departure
 * station's local clock, so the two disagree by a day whenever a flight leaves late enough in the
 * evening east of Greenwich — every Almaty night departure, in practice. Matching on the exact
 * date first and then allowing a day either way keeps both readings pointing at one sector, and
 * consuming each record once stops a repeated flight number in the same week from taking a crew
 * list that belongs to another day.
 */
function attachCrew(duties: AimsDuty[], records: CrewRecord[], selfId: string | undefined) {
  const flights = duties.flatMap((duty) => duty.flights);
  const taken = new Set<CrewRecord>();
  for (const flight of flights) {
    const match =
      records.find((record) => !taken.has(record) && record.flightNumber === flight.flightNumber && record.date === flight.date)
      ?? records.find((record) => !taken.has(record) && record.flightNumber === flight.flightNumber && withinADay(record.date, flight.date));
    if (!match) continue;
    taken.add(match);
    flight.crew = match.members;
    // The pilot's own line says whether they operated this sector or rode on it, which the grid
    // only marks with a "*" it does not always print.
    const own = selfId ? match.members.find((member) => member.id === selfId) : undefined;
    if (own) flight.deadhead = Boolean(own.deadhead);
  }
}

// ---------------------------------------------------------------------------- small helpers

interface Line { y: number; items: TextItem[]; text: string }
function lines(page: ExtractedPage, tolerance = 2): Line[] {
  const grouped: Line[] = [];
  for (const item of page.items) {
    if (!item.str.trim()) continue;
    const line = grouped.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (line) { line.items.push(item); line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length; }
    else grouped.push({ y: item.y, items: [item], text: '' });
  }
  for (const line of grouped) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return grouped.sort((a, b) => a.y - b.y);
}

function pageHeaderBottom(pageLines: Line[]) {
  const header = pageLines.filter((line) => /Personal\s+Crew\s+Schedule\s+Report/i.test(line.text) || PERIOD_RE.test(line.text));
  return header.length ? Math.max(...header.map((line) => line.y)) : Number.NEGATIVE_INFINITY;
}
function pageFooterTop(pageLines: Line[]) {
  const footer = pageLines.filter((line) => /^Generated on\b/i.test(line.text) || /\bPage \d+ of \d+$/.test(line.text));
  return footer.length ? Math.min(...footer.map((line) => line.y)) : Number.POSITIVE_INFINITY;
}
function inColumn(item: TextItem, from: number, to: number) { return item.x >= from - 4 && item.x < to - 4; }
function nearestIndex(anchors: TextItem[], y: number) {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  anchors.forEach((anchor, index) => { const next = Math.abs(anchor.y - y); if (next < distance) { best = index; distance = next; } });
  return best;
}
function plainTime(value?: string) { return value !== undefined && PLAIN_TIME_RE.test(value); }
function cellTime(value?: string) {
  const match = CELL_TIME_RE.exec(value?.trim() ?? '');
  return match && Number(match[2]) <= 23 ? { time: `${match[2]}:${match[3]}`, actual: match[1] === 'A' } : undefined;
}
function station(value?: string) {
  const match = STATION_RE.exec(value?.trim() ?? '');
  return match ? { code: match[2], deadhead: match[1] === '*' } : undefined;
}
function isoDate(value: string) {
  const match = DATE_DDMMYYYY_RE.exec(value.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return isRealDate(iso) ? iso : undefined;
}
function isRealDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
