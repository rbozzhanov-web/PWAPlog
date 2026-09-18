export type AimsCrewMember = { id?: string; name: string; role: 'Flight deck' | 'Cabin'; position?: string; deadhead?: boolean };
export type AimsFlight = { flightNumber: string; date: string; origin: string; destination: string; departure: string; arrival: string; arrivalDate?: string; deadhead: boolean; /** The sector has operated, so its printed times are the ones flown. */ actualTimes: boolean; aircraftType?: string; crew?: AimsCrewMember[] };
export type AimsDuty = { date: string; start?: string; end?: string; report?: string; release?: string; flights: AimsFlight[] };
export type AimsHotel = { station: string; name?: string; address?: string; phone?: string; locator?: string };
export type AimsAbsence = { code: 'SICK' | 'UFF' | 'VAC' | 'CHLD'; date: string };
export type AimsActivity = { date: string; code: string; title?: string; type: string; location?: string; start?: string; end?: string };
export type AimsRoster = {
  /** What the import this roster last took in was about — the period printed on it. */
  period: { start: string; end: string };
  /**
   * Every day the stored roster can answer for, across the imports merged into it.
   *
   * It is wider than `period` whenever a PDF and a Web Archive cover different months. Absent on
   * rosters stored before imports were merged, where the one import is the whole roster.
   */
  coverage?: { start: string; end: string };
  /** Which kind of file the latest import read. Absent on rosters stored before the PDF importer. */
  source?: 'webarchive' | 'pdf';
  duties: AimsDuty[];
  hotels: AimsHotel[];
  absences: AimsAbsence[];
  activities: AimsActivity[];
  totals: { blockMinutes?: number; nightMinutes?: number };
  importedAt: string;
};

type RecordValue = Record<string, unknown>;
const storageKey = 'pwaplog.aims-roster.v1';
const sectorPattern = /\b(?:KC\s*)?(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})((?:⁺¹|\+\s*1)?)\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})((?:⁺¹|\+\s*1)?)\)/g;

export function loadAimsRoster(): AimsRoster | undefined {
  try { const value = localStorage.getItem(storageKey); return value ? healRoster(JSON.parse(value) as AimsRoster) : undefined; } catch { return undefined; }
}

/** What makes two entries the same real sector, whichever file each of them arrived in. */
export function flightIdentity(flight: AimsFlight) {
  return `${flight.date}|${flight.flightNumber}|${flight.origin}|${flight.destination}`;
}

/**
 * Repairs what a stored roster cannot repair by itself.
 *
 * A roster is parsed once and then lives in local storage for months. Fixing a parser therefore
 * fixes nothing already imported, and a pilot is not going to re-import last month because the
 * release date was a day out. So the same repairs run on every load, and a roster carrying either
 * of the two faults found so far heals the next time the app opens.
 */
export function healRoster(roster: AimsRoster): AimsRoster {
  const deduped = dedupeRoster(roster);
  return { ...deduped, duties: deduped.duties.map(repairDuty) };
}

/**
 * Puts a release back on the day it happens.
 *
 * AIMS gives a debrief as a bare clock and the parser used to hang it on the day the duty started,
 * which is a day early for every duty ending after midnight: a 00:35 release on a duty reporting
 * at 18:25 the evening before landed eighteen hours before its own report. Nothing printed the
 * date, so it went unseen until the hero subtracted the two for a duty length.
 *
 * A release is after the report and after the last sector is on blocks. One of those being false
 * means the date is a day short, never that the duty ran backwards.
 */
function repairDuty(duty: AimsDuty): AimsDuty {
  const release = duty.release;
  if (!release) return duty;
  const last = duty.flights.at(-1);
  const landed = last ? `${last.arrivalDate ?? last.date}T${last.arrival}` : undefined;
  const after = [dutyStartBoundary(duty), landed].filter(Boolean).sort().at(-1);
  if (!after || release >= after) return duty;
  return { ...duty, release: `${addDays(release.slice(0, 10), 1)}${release.slice(10)}` };
}
function dutyStartBoundary(duty: AimsDuty) {
  return duty.report ?? duty.start;
}

/** Drops anything the roster is holding twice — see `healRoster` for why this runs on load. */
export function dedupeRoster(roster: AimsRoster): AimsRoster {
  const flights = new Set<string>();
  const duties = roster.duties.filter((duty) => {
    const identities = duty.flights.map(flightIdentity);
    if (identities.length && identities.every((identity) => flights.has(identity))) return false;
    for (const identity of identities) flights.add(identity);
    return true;
  });
  return {
    ...roster,
    duties,
    absences: unique(roster.absences, (absence) => `${absence.date}|${absence.code}`),
    activities: unique(roster.activities ?? [], (activity) => `${activity.date}|${activity.code}|${activity.start ?? ''}`),
  };
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; });
}
export function saveAimsRoster(roster: AimsRoster) { localStorage.setItem(storageKey, JSON.stringify(roster)); }

/**
 * Which side of the flight deck door a rank sits on.
 *
 * Shared with the PDF importer so one colleague is filed the same way whichever file they arrive
 * in. "3P" is the third pilot on a long sector — flight deck, not cabin.
 */
export function crewRole(rank: string): AimsCrewMember['role'] {
  return ['CP', 'FO', 'LI', '3P'].includes(rank.trim().toUpperCase()) ? 'Flight deck' : 'Cabin';
}

/** Parses an AIMS Crew Schedule saved locally as HTML or Safari Web Archive. No network/session data is used. */
export async function parseAimsArchive(file: File): Promise<AimsRoster> {
  const source = await file.arrayBuffer();
  const html = decodeArchive(source);
  if (!/\/eCrew\/CrewSchedule|CrewSchedule/i.test(html) || !/initialResult/.test(html)) throw new Error('Unsupported AIMS file. Save the fully loaded Crew Schedule as a Web Archive, then import it here.');
  const result = assignedJson(html);
  const periodStart = readLocalStorage(html, 'PeriodStart');
  const periodEnd = readLocalStorage(html, 'PeriodEnd');
  if (!validDate(periodStart) || !validDate(periodEnd)) throw new Error('Could not read the roster period from this AIMS archive.');
  const events = Array.isArray(result.SchedulerEvents) ? result.SchedulerEvents : assignedArray(html, /var\s+Events\s*=/);
  const duties: AimsDuty[] = [];
  const absences: AimsAbsence[] = [];
  const activities: AimsActivity[] = [];
  for (const event of events) {
    if (!record(event)) continue;
    const dutyDate = datePart(text(event.start));
    if (!dutyDate) continue;
    const absence = absenceCode(event); if (absence) absences.push({ code: absence, date: dutyDate });
    const flights = sectors(event, dutyDate);
    if (flights.length) duties.push({ date: flights[0].date, start: boundary(text(event.start)), end: boundary(text(event.end)), report: boundary(text(event.report), dutyDate), release: releaseBoundary(text(event.debrief), flights, dutyDate), flights });
    else {
      const code = eventCode(event);
      if (code) activities.push({
        date: dutyDate,
        code,
        title: activityTitle(event, code),
        type: text(event.type),
        location: text(event.location).trim() || undefined,
        start: boundary(text(event.start)),
        end: boundary(text(event.end)),
      });
    }
  }
  if (!duties.length) throw new Error('The saved AIMS schedule contains no flight sectors. Make sure the calendar was fully loaded before saving it.');
  duties.sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date));
  attachCrew(duties, findElement(result.elementList, 'members'), selfCrewId(events));
  const hours = findElement(result.elementList, 'hours');
  const totals = Array.isArray(hours?.data) ? hours.data.reduce<{ blockMinutes?: number; nightMinutes?: number }>((summary, row) => {
    if (!record(row)) return summary; const value = minutes(text(row.hours)); const label = text(row.desc).toLowerCase();
    if (value !== undefined && label.includes('block')) summary.blockMinutes = value;
    if (value !== undefined && label.includes('night')) summary.nightMinutes = value;
    return summary;
  }, {}) : {};
  const period = { start: periodStart, end: periodEnd };
  return { period, coverage: period, source: 'webarchive', duties, hotels: hotels(findElement(result.elementList, 'hotels')), absences, activities, totals, importedAt: new Date().toISOString() };
}

/**
 * When the pilot is released, for a debrief AIMS gives as a bare clock.
 *
 * The clock has to be hung on a date, and the duty's start date is the wrong one for every duty
 * that ends after midnight: a 00:35 debrief on a duty that reported at 18:25 the evening before
 * came out eighteen hours *before* the report. Nothing on screen showed it, because every reader
 * of the release printed the time and dropped the date — until one of them subtracted the two and
 * got a negative duty. It also cut such a duty off Home a day early, `dutyEndTimestamp` being the
 * test for whether a duty is still ahead of the pilot.
 *
 * So the clock hangs on the day the last sector lands, and rolls forward if it still reads earlier
 * than that landing: release comes after on-blocks.
 */
function releaseBoundary(value: string, flights: AimsFlight[], dutyDate: string) {
  const dated = boundary(value);
  if (dated) return dated;
  if (!/^\d{2}:\d{2}/.test(value)) return undefined;
  const clock = value.slice(0, 5);
  const last = flights.at(-1);
  if (!last) return `${dutyDate}T${clock}`;
  const landed = last.arrivalDate ?? last.date;
  return clock >= last.arrival ? `${landed}T${clock}` : `${addDays(landed, 1)}T${clock}`;
}

function sectors(event: RecordValue, dutyDate: string): AimsFlight[] {
  const parsed: AimsFlight[] = [];
  const dutyStartClock = clock(boundary(text(event.report), dutyDate)) ?? clock(boundary(text(event.start), dutyDate));
  let rollingDate = dutyDate;
  let previousDeparture: string | undefined;
  const details = sectorDetails(event);
  sectorPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = sectorPattern.exec(details))) {
    const [, flightNumber, origin, outPrefix, out, outNext, destination, inPrefix, incoming, inNext] = match;
    const departure = time(out);
    const arrival = time(incoming);
    if (outNext) rollingDate = addDays(dutyDate, 1);
    else if (previousDeparture ? departure < previousDeparture : Boolean(dutyStartClock && departure < dutyStartClock)) rollingDate = addDays(rollingDate, 1);
    const date = rollingDate;
    let arrivalDate = inNext ? addDays(dutyDate, 1) : date;
    if (arrivalDate < date) arrivalDate = date;
    if (arrivalDate === date && arrival < departure) arrivalDate = addDays(date, 1);
    parsed.push({
      flightNumber: /^KC/i.test(flightNumber) ? flightNumber : 'KC' + flightNumber,
      date,
      origin,
      destination,
      departure,
      arrival,
      arrivalDate: arrivalDate !== date ? arrivalDate : undefined,
      deadhead: Boolean(event.IsDeadhead),
      // AIMS marks a time with "A" only when it differs from the schedule: the three sectors in
      // the sample that pushed back exactly on time print a bare departure and carry no "Flight
      // delay" line, while a delayed one prints both. A bare time on a sector that has operated is
      // therefore the actual time, not a timetable entry — confirmed against the real days flown.
      //
      // So the arrival is what says a sector is complete. It can never match its schedule to the
      // minute in practice, and it is the last thing to happen: a flight that has departed late
      // but not yet landed prints an actual departure and a scheduled arrival, and is still in the
      // air rather than ready for the logbook.
      actualTimes: inPrefix === 'A',
      aircraftType: aircraft(event),
    });
    previousDeparture = departure;
  }
  return parsed;
}
function sectorDetails(event: RecordValue) {
  return clean(text(event.details))
    .replace(/&#(?:8195|x2003);/gi, ' ')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\b(\d{2}):(\d{2})\b/g, '$1$2');
}
function aircraft(event: RecordValue) { return ['aircraftType', 'AircraftType', 'aircraft', 'Aircraft', 'acType', 'ACType'].map((key) => scalar(event[key])).find(Boolean) || undefined; }
function absenceCode(event: RecordValue): AimsAbsence['code'] | undefined { const value = `${text(event.type)} ${text(event.text)} ${text(event.details)}`.toUpperCase(); return (['SICK', 'UFF', 'VAC', 'CHLD'] as const).find((code) => new RegExp(`\\b${code}\\b`).test(value)); }
function eventCode(event: RecordValue) { return /^([A-Z0-9]{2,8})\b/i.exec(text(event.text).trim())?.[1]?.toUpperCase(); }
/**
 * A duty's own `IsDeadhead` flag applies to the whole event, but a multi-sector duty can have the
 * pilot operate one leg and deadhead home on another \u2014 AIMS still marks both sectors with the same
 * flag. The per-sector crew list carries the true, per-leg answer for whoever is "self" in it, so
 * once we know self's crew id we prefer that over the event-level flag wherever it's available.
 */
function attachCrew(duties: AimsDuty[], members: RecordValue | undefined, self: string | undefined) {
  const groups = Array.isArray(members?.data) ? members.data : [];
  for (const group of groups) {
    if (!record(group) || !Array.isArray(group.data)) continue;
    const key = /^(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*([A-Z]?\d{1,5})\s*\|\s*([A-Z]{3,4})\s*-\s*([A-Z]{3,4})/i.exec(text(group.value).replace(/&emsp;|&#8195;|&#x2003;|\u2003/gi, ' | ').replace(/\s+/g, ' '));
    if (!key) continue;
    const [, day, month, year, number, origin, destination] = key;
    const crew = group.data.flatMap((item): AimsCrewMember[] => {
      if (!record(item)) return []; const name = text(item.value2).trim(); const position = text(item.value4).trim(); if (!name || !position) return [];
      const rank = position.split('-')[0]?.trim().toUpperCase(); return [{ id: scalar(item.value3) || undefined, name, position, role: crewRole(rank), deadhead: /\bDHC\b/i.test(position) || undefined }];
    });
    if (!crew.length) continue;
    const date = `${year}-${month}-${day}`; const normalizedNumber = number.replace(/^KC/i, '');
    const flight = duties.flatMap((duty) => duty.flights).find((candidate) => candidate.date === date && candidate.flightNumber.replace(/^KC/i, '') === normalizedNumber && candidate.origin === origin.toUpperCase() && candidate.destination === destination.toUpperCase());
    if (!flight) continue;
    flight.crew = crew;
    const own = crew.find((member) => member.id === self);
    if (own) flight.deadhead = Boolean(own.deadhead);
  }
}
/** The crew id every event in a personal AIMS schedule is filed under \u2014 AIMS names each event
 *  `<crewId>on<timestamp>_...`, so any event's id reveals whose schedule this is. */
function selfCrewId(events: unknown[]): string | undefined {
  for (const event of events) {
    if (!record(event)) continue;
    const match = /^(\d+)on/.exec(scalar(event.id));
    if (match) return match[1];
  }
  return undefined;
}
function hotels(element?: RecordValue): AimsHotel[] {
  return (Array.isArray(element?.data) ? element.data : []).flatMap((row): AimsHotel[] => {
    if (!record(row)) return [];
    const station = clean(text(row.port));
    if (!station) return [];
    const rawAddress = clean(text(row.addresses));
    const addressLines = rawAddress.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const declaredName = firstValue(row, ['hotel', 'hotelName', 'name', 'property', 'title', 'description']);
    const inferredName = addressLines[0] && looksLikeHotelName(addressLines[0]) ? addressLines[0] : undefined;
    const name = declaredName || inferredName;
    const address = (name && inferredName === name ? addressLines.slice(1).join(' · ') : rawAddress) || undefined;
    return [{
      station,
      name,
      address,
      phone: clean(text(row.phones)) || undefined,
      locator: clean(text(row.locators)) || undefined,
    }];
  });
}
function firstValue(row: RecordValue, keys: string[]) {
  return keys.map((key) => clean(text(row[key]))).find(Boolean);
}
function looksLikeHotelName(value: string) {
  return /\b(hotel|inn|resort|suites|marriott|hilton|radisson|wyndham|ibis|crowne|novotel|sheraton|hyatt|mercure|palace)\b/i.test(value);
}
function activityTitle(event: RecordValue, code: string) {
  const lines = clean(text(event.text)).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !new RegExp('^' + code + '\\b', 'i').test(line) && !/^(hotel|rest|accommodation)$/i.test(line)) || undefined;
}
function findElement(value: unknown, id: string): RecordValue | undefined { if (Array.isArray(value)) return value.map((child) => findElement(child, id)).find(Boolean); if (!record(value)) return undefined; if (value.id === id) return value; return Object.values(value).map((child) => findElement(child, id)).find(Boolean); }
function assignedJson(source: string): RecordValue { const marker = /var\s+initialResult\s*=/.exec(source); if (!marker) throw new Error('Could not find AIMS data in this saved file.'); const start = source.indexOf('{', marker.index); let depth = 0, quoted = false, escaped = false; for (let i = start; i < source.length; i += 1) { const char = source[i]; if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; } if (char === '"') { quoted = true; continue; } if (char === '{') depth += 1; if (char === '}' && --depth === 0) { const parsed: unknown = JSON.parse(source.slice(start, i + 1)); if (record(parsed)) return parsed; } } throw new Error('AIMS schedule data is incomplete.'); }
function assignedArray(source: string, pattern: RegExp): unknown[] { const marker = pattern.exec(source); if (!marker) return []; const start = source.indexOf('[', marker.index); let depth = 0, quoted = false, escaped = false; for (let i = start; i < source.length; i += 1) { const char = source[i]; if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; } if (char === '"') { quoted = true; continue; } if (char === '[') depth += 1; if (char === ']' && --depth === 0) { const parsed: unknown = JSON.parse(source.slice(start, i + 1)); return Array.isArray(parsed) ? parsed : []; } } return []; }
/** AIMS pages sometimes declare `charset=windows-1251` while the bytes they actually served are
 *  UTF-8 (a stale meta tag, not the real encoding) — trusting that declaration silently mangles
 *  every multi-byte character, including the ⁺¹ overnight-rollover mark a sector's own regex
 *  depends on, which drops the whole duty into "activities" instead of counting it as a flight.
 *  Real UTF-8 almost never also decodes as valid UTF-8 by accident, so verifying it strictly first
 *  is reliable; the declared charset is only trusted once that verification fails. */
function decodeArchive(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* not UTF-8 */ }
  const probe = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256 * 1024));
  const declared = /charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(probe)?.[1]?.toLowerCase();
  return new TextDecoder(declared === 'windows-1251' || declared === 'cp1251' ? 'windows-1251' : 'utf-8').decode(bytes);
}
function readLocalStorage(source: string, key: string) { return new RegExp(`localStorage\\[['"]${key}['"]\\]\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1]; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function scalar(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function clean(value: string) { return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim(); }
function minutes(value: string) { const match = /^(\d{1,3}):(\d{2})$/.exec(value.trim()); return match && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : undefined; }
function record(value: unknown): value is RecordValue { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function datePart(value: string) { const result = /^\d{4}-\d{2}-\d{2}/.exec(value); return result?.[0]; }
function boundary(value: string, date?: string) { const result = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value); if (result) return result.slice(1, 3).join('T'); return date && /^\d{2}:\d{2}/.test(value) ? `${date}T${value.slice(0, 5)}` : undefined; }
function time(value: string) { return `${value.slice(0, 2)}:${value.slice(2, 4)}`; }
function clock(value?: string) { return value?.includes('T') ? value.slice(11, 16) : undefined; }
function addDays(value: string, days: number) { const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d + days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
