import { NEW_ENTRY_DEFAULTS } from '../../../logbook/types';
import { calculateDayNight } from '../../../daynight/nightCalc';
import { hhmmToMinutes } from '../../../time';
import { resolveIcaoCode } from '../../../daynight/airportDb';
import { isAirportCodeToken, isTimeToken, parseDateDdMmYy, REGISTRATION_RE } from '../../patterns';
import { Line, tokenizeLines } from '../../tokenize';
import { CrossCheck, ExtractedPage, ParsedCandidate, ParseResult, ParserRule, TextItem } from '../../types';

const CREW_HEADER_RE = /^(\d{3,6})\s+([A-Z][A-Z .'-]+?)\s*\(([^)]+)\)$/;
const AIRCRAFT_TYPE_RE = /^\d{2,4}$/;
/**
 * A crew-name fragment. Spaces are allowed inside it because pdf.js often emits a full name as a
 * single text run ("KISSELEV ALEXANDR") rather than one run per word — requiring a single word
 * silently dropped every PIC name in real reports, while the synthetic fixture (which splits the
 * name across two runs) still passed. Must start with a letter so landing counts and times, which
 * follow the name on the row, don't get swallowed.
 */
const WORD_RE = /^[A-Za-z][A-Za-z .'-]*$/;

interface OperatedAsColumns {
  picX: number;
  coPltX: number;
  instrX: number;
}

interface SynthDeviceColumns {
  /** x of the "Time" sub-column under "SYNTH. DEVICES". */
  timeX: number;
  /** x of the "Type" sub-column under "SYNTH. DEVICES". */
  typeX: number;
}

/**
 * Finds the "Time"/"Type" sub-columns under the "SYNTH. DEVICES" group header, using the same
 * x-range technique as findOperatedAsColumns — both sub-labels are generic words that appear
 * several times across the header, so only their position under the group label identifies them.
 *
 * This is what separates a simulator session from a flight: a training row carries no "Flt time"
 * at all, its duration sits here instead. Reading it positionally (as the old code did) counted
 * simulator hours as flight hours.
 */
function findSynthDeviceColumns(groupHeaderLine: Line, subHeaderLine: Line): SynthDeviceColumns | undefined {
  const synthItem = groupHeaderLine.items.find((item) => item.str.trim().toUpperCase().startsWith('SYNTH'));
  if (!synthItem) return undefined;

  // SYNTH. DEVICES is the last group, so everything from its x rightwards belongs to it.
  const inRange = (x: number) => x >= synthItem.x - 5;
  const labelled = subHeaderLine.items
    .filter((item) => inRange(item.x))
    .sort((a, b) => a.x - b.x);

  const timeItem = labelled.find((item) => item.str.trim().toLowerCase() === 'time');
  const typeItem = labelled.find((item) => item.str.trim().toLowerCase() === 'type');
  if (!timeItem || !typeItem) return undefined;

  return { timeX: timeItem.x, typeX: typeItem.x };
}

/** x of the "Flt time" column, so a row's duration can be told apart from a simulator duration. */
function findFltTimeColumn(subHeaderLine: Line): number | undefined {
  const item = subHeaderLine.items.find((entry) => entry.str.trim().toLowerCase().startsWith('flt'));
  return item?.x;
}

interface ReportColumns {
  operatedAs?: OperatedAsColumns;
  synth?: SynthDeviceColumns;
  fltTimeX?: number;
}

/**
 * Decides whether the duration taken from a row is simulator time rather than flight time.
 *
 * Primary signal is the column it sits in. If the header couldn't be located (a report variant
 * we haven't seen), fall back to the absence of an aircraft registration — a real flight always
 * has a tail number, a training device never does.
 */
function isSimulatorDuration(
  durationItem: TextItem,
  aircraftRegistration: TextItem | undefined,
  columns: ReportColumns,
): boolean {
  if (columns.synth && columns.fltTimeX !== undefined) {
    const toSynth = Math.abs(durationItem.x - columns.synth.timeX);
    const toFlt = Math.abs(durationItem.x - columns.fltTimeX);
    return toSynth < toFlt;
  }
  return !aircraftRegistration;
}

/**
 * Finds the x-positions of "PIC", "Co-Plt", and "Instr" under the "OPERATED AS" group header —
 * used to disambiguate SIC vs. instructor time when the pilot wasn't PIC. Rather than matching
 * these labels by text alone (the standalone "Name PIC" column earlier in the row also contains
 * the word "PIC", and we can't rely on knowing whether the PDF tokenizes "Name PIC" as one text
 * run or two), this bounds the search to the x-range under the "OPERATED AS" group label on the
 * row above — the one part of the report layout that's unambiguous.
 */
function findOperatedAsColumns(groupHeaderLine: Line, subHeaderLine: Line): OperatedAsColumns | undefined {
  const operatedAsItem = groupHeaderLine.items.find((item) => item.str.trim().toUpperCase().startsWith('OPERATED'));
  if (!operatedAsItem) return undefined;

  const laterGroupX = groupHeaderLine.items
    .map((item) => item.x)
    .filter((x) => x > operatedAsItem.x + 1);
  const rangeEnd = laterGroupX.length ? Math.min(...laterGroupX) : Infinity;
  const inRange = (x: number) => x >= operatedAsItem.x - 5 && x < rangeEnd;

  let picX: number | undefined;
  let coPltX: number | undefined;
  let instrX: number | undefined;

  for (const item of subHeaderLine.items) {
    if (!inRange(item.x)) continue;
    const normalized = item.str.trim().toLowerCase().replace(/[.\s-]/g, '');
    if (normalized === 'pic') picX = item.x;
    else if (normalized === 'coplt') coPltX = item.x;
    else if (normalized.startsWith('instr')) instrX = item.x;
  }

  if (picX === undefined || coPltX === undefined || instrX === undefined) return undefined;
  return { picX, coPltX, instrX };
}

function isGroupHeaderLine(line: Line): boolean {
  return line.text.includes('OPERATED AS') && line.text.includes('SYNTH');
}

function isSubHeaderLine(line: Line): boolean {
  return line.text.includes('Name PIC') && line.text.includes('Flt time');
}

interface ParsedRow {
  date: string;
  depAirport: string;
  depTime: string;
  arrAirport: string;
  arrTime: string;
  aircraftType?: string;
  aircraftRegistration?: string;
  totalTimeMinutes: number;
  namePic: string;
  trailingTimeItem?: TextItem;
  /** Set only for training-device sessions; totalTimeMinutes is then 0. */
  simulatorMinutes?: number;
  simulatorType?: string;
  /** Airport codes the database couldn't resolve — surfaced for the pilot to check. */
  unresolvedAirports: string[];
}

/** Parses one data row (a line whose first item is a DD/MM/YY date) — a flight or a sim session. */
function parseFlightRow(line: Line, columns: ReportColumns): ParsedRow | undefined {
  const items = line.items;
  const date = parseDateDdMmYy(items[0]?.str ?? '');
  if (!date) return undefined;

  let idx = 1;
  const take = (predicate: (s: string) => boolean): TextItem | undefined => {
    const item = items[idx];
    if (item && predicate(item.str.trim())) {
      idx++;
      return item;
    }
    return undefined;
  };

  const depAirport = take(isAirportCodeToken);
  const depTime = take(isTimeToken);
  const arrAirport = take(isAirportCodeToken);
  const arrTime = take(isTimeToken);
  if (!depAirport || !depTime || !arrAirport || !arrTime) return undefined;

  const dep = resolveIcaoCode(depAirport.str);
  const arr = resolveIcaoCode(arrAirport.str);
  const unresolvedAirports = [dep, arr].filter((r) => !r.resolved).map((r) => r.code);

  const aircraftType = take((s) => AIRCRAFT_TYPE_RE.test(s));
  const aircraftRegistration = take((s) => REGISTRATION_RE.test(s));

  // Skip anything between the aircraft columns and the duration. On a training row the takeoff/
  // landing count sits there (e.g. a bare "3"), and stopping at it would drop the row entirely.
  while (items[idx] && !isTimeToken(items[idx].str.trim())) idx++;
  const fltTime = take(isTimeToken);
  if (!fltTime) return undefined;

  const totalTimeMinutes = hhmmToMinutes(fltTime.str.trim());
  if (totalTimeMinutes === null) return undefined;

  // A training row has no flight time: the duration we just took actually sits in the SYNTH.
  // DEVICES column. Decide by which column it lands in, corroborated by the registration — in
  // the real report all 325 rows agree on both signals, a flight always having a registration.
  if (isSimulatorDuration(fltTime, aircraftRegistration, columns)) {
    const typeItem = columns.synth
      ? items.find((item) => item.x >= columns.synth!.typeX - 8 && !isTimeToken(item.str.trim()))
      : items[idx];
    return {
      date,
      depAirport: dep.code,
      depTime: depTime.str.trim(),
      arrAirport: arr.code,
      arrTime: arrTime.str.trim(),
      aircraftType: aircraftType?.str.trim(),
      totalTimeMinutes: 0,
      namePic: '',
      unresolvedAirports,
      simulatorMinutes: totalTimeMinutes,
      simulatorType: typeItem?.str.trim(),
    };
  }

  const nameParts: string[] = [];
  while (items[idx] && WORD_RE.test(items[idx].str.trim())) {
    nameParts.push(items[idx].str.trim());
    idx++;
  }

  // Whatever remains (day/night takeoff/landing "1" flags) is skipped: night status is always
  // computed from real sun position (src/lib/daynight), never trusted from the report. Only the
  // final HH:MM-shaped token, if present, matters here — it echoes the role (PIC/Co-Plt/Instr)
  // time under "OPERATED AS", needed to disambiguate SIC vs. instructor time.
  let trailingTimeItem: TextItem | undefined;
  for (let i = idx; i < items.length; i++) {
    if (isTimeToken(items[i].str.trim())) trailingTimeItem = items[i];
  }

  return {
    date,
    depAirport: dep.code,
    depTime: depTime.str.trim(),
    arrAirport: arr.code,
    arrTime: arrTime.str.trim(),
    aircraftType: aircraftType?.str.trim(),
    aircraftRegistration: aircraftRegistration?.str.trim(),
    totalTimeMinutes,
    namePic: nameParts.join(' '),
    trailingTimeItem,
    unresolvedAirports,
  };
}

function assignRoleMinutes(
  row: ParsedRow,
  operatedAsColumns: OperatedAsColumns | undefined,
): { picMinutes: number; sicMinutes: number; dualGivenMinutes: number; roleConfident: boolean } {
  if (row.namePic.toLowerCase() === 'self') {
    return { picMinutes: row.totalTimeMinutes, sicMinutes: 0, dualGivenMinutes: 0, roleConfident: true };
  }

  // Someone else was PIC: the pilot flew as SIC or instructor. Disambiguate via the trailing
  // time value's x-position against the "OPERATED AS" sub-column headers when available.
  if (row.trailingTimeItem && operatedAsColumns) {
    const distances: [keyof OperatedAsColumns, number][] = [
      ['coPltX', Math.abs(row.trailingTimeItem.x - operatedAsColumns.coPltX)],
      ['instrX', Math.abs(row.trailingTimeItem.x - operatedAsColumns.instrX)],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    const nearest = distances[0][0];
    if (nearest === 'instrX') {
      return { picMinutes: 0, sicMinutes: 0, dualGivenMinutes: row.totalTimeMinutes, roleConfident: true };
    }
    return { picMinutes: 0, sicMinutes: row.totalTimeMinutes, dualGivenMinutes: 0, roleConfident: true };
  }

  // No column data to disambiguate — default to SIC (the more common case) and flag for review.
  return { picMinutes: 0, sicMinutes: row.totalTimeMinutes, dualGivenMinutes: 0, roleConfident: false };
}

function describeUnresolvedAirports(row: ParsedRow): string[] {
  return row.unresolvedAirports.map(
    (code) => `Airport "${code}" is not in the database — check the code.`,
  );
}

/**
 * A training-device session: no flight time, and no day/night — the sun's position over the
 * training centre says nothing about a session in a box, and the report has no such column for
 * these rows either.
 */
function buildSimulatorCandidate(row: ParsedRow, rawSourceLine: string): ParsedCandidate {
  const unmatchedFields = [
    ...describeUnresolvedAirports(row),
    ...(row.simulatorType ? [] : ['Training device type is missing — check the SYNTH. DEVICES column.']),
  ];

  return {
    rawSourceLine,
    confidence: unmatchedFields.length === 0 ? 'high' : 'medium',
    unmatchedFields,
    fields: {
      ...NEW_ENTRY_DEFAULTS,
      date: row.date,
      departureAirport: row.depAirport,
      arrivalAirport: row.arrAirport,
      aircraftType: row.aircraftType,
      timeOut: row.depTime,
      timeIn: row.arrTime,
      totalTimeMinutes: 0,
      simulatorMinutes: row.simulatorMinutes ?? 0,
      simulatorType: row.simulatorType,
      source: 'pdf_import',
    },
  };
}

function buildCandidate(row: ParsedRow, rawSourceLine: string, operatedAsColumns: OperatedAsColumns | undefined): ParsedCandidate {
  if (row.simulatorMinutes !== undefined) return buildSimulatorCandidate(row, rawSourceLine);

  const role = assignRoleMinutes(row, operatedAsColumns);
  const nightResult = calculateDayNight({
    date: row.date,
    departureAirport: row.depAirport,
    arrivalAirport: row.arrAirport,
    departureTime: row.depTime,
    totalTimeMinutes: row.totalTimeMinutes,
  });

  const unmatchedFields = describeUnresolvedAirports(row);
  if (!nightResult) {
    unmatchedFields.push(
      'Day/night could not be computed — check the date, airports and time out.',
    );
  }
  if (!role.roleConfident) {
    unmatchedFields.push('Role unclear — confirm whether this was SIC or instructor time.');
  }

  return {
    rawSourceLine,
    confidence: unmatchedFields.length === 0 ? 'high' : 'medium',
    unmatchedFields,
    fields: {
      ...NEW_ENTRY_DEFAULTS,
      date: row.date,
      departureAirport: row.depAirport,
      arrivalAirport: row.arrAirport,
      aircraftType: row.aircraftType,
      aircraftRegistration: row.aircraftRegistration,
      timeOut: row.depTime,
      timeIn: row.arrTime,
      totalTimeMinutes: row.totalTimeMinutes,
      picMinutes: role.picMinutes,
      sicMinutes: role.sicMinutes,
      dualGivenMinutes: role.dualGivenMinutes,
      pilotInCommandName: row.namePic.toLowerCase() === 'self' ? undefined : row.namePic,
      ...(nightResult ?? {}),
      source: 'pdf_import',
    },
  };
}

export const airAstanaRule: ParserRule = {
  id: 'air-astana-flight-time-report-v1',

  matches(pages: ExtractedPage[]): boolean {
    const text = pages
      .map((page) => tokenizeLines(page).map((line) => line.text).join('\n'))
      .join('\n');
    return (
      text.includes('AIR ASTANA') &&
      text.includes('DEPARTURE') &&
      text.includes('OPERATED AS') &&
      text.includes('TOFF') &&
      text.includes('LND')
    );
  },

  parse(pages: ExtractedPage[]): ParseResult {
    const candidates: ParsedCandidate[] = [];
    const crossChecks: CrossCheck[] = [];

    const columns: ReportColumns = {};
    let pendingGroupHeaderLine: Line | undefined;
    let sectionCandidates: ParsedCandidate[] = [];

    for (const page of pages) {
      const lines = tokenizeLines(page);

      for (const line of lines) {
        if (isGroupHeaderLine(line)) {
          pendingGroupHeaderLine = line;
          continue;
        }

        if (isSubHeaderLine(line)) {
          if (pendingGroupHeaderLine) {
            columns.operatedAs = findOperatedAsColumns(pendingGroupHeaderLine, line) ?? columns.operatedAs;
            columns.synth = findSynthDeviceColumns(pendingGroupHeaderLine, line) ?? columns.synth;
          }
          columns.fltTimeX = findFltTimeColumn(line) ?? columns.fltTimeX;
          continue;
        }

        if (CREW_HEADER_RE.test(line.text)) {
          sectionCandidates = [];
          continue;
        }

        if (/^Totals\s*:/i.test(line.text)) {
          const reportedMinutes = line.items
            .map((item) => item.str.trim())
            .filter(isTimeToken)
            .map((token) => hhmmToMinutes(token)!)[0];
          if (reportedMinutes !== undefined) {
            // Simulator sessions carry totalTimeMinutes 0, so they drop out of this sum
            // naturally — matching the report, which totals SYNTH. DEVICES separately.
            const parsedMinutes = sectionCandidates.reduce(
              (sum, candidate) => sum + (candidate.fields.totalTimeMinutes ?? 0),
              0,
            );
            crossChecks.push({
              label: 'Flt time total',
              parsedTotalMinutes: parsedMinutes,
              reportedTotalMinutes: reportedMinutes,
              matches: parsedMinutes === reportedMinutes,
            });
          }
          sectionCandidates = [];
          continue;
        }

        if (/^Generated on/i.test(line.text)) continue;

        const row = parseFlightRow(line, columns);
        if (!row) continue;

        const candidate = buildCandidate(row, line.text, columns.operatedAs);
        candidates.push(candidate);
        sectionCandidates.push(candidate);
      }
    }

    return { ruleId: this.id, candidates, crossChecks };
  },
};
