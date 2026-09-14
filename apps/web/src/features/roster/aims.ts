export type AimsCrewMember = { id?: string; name: string; role: 'Flight deck' | 'Cabin'; position?: string; deadhead?: boolean };
export type AimsFlight = { flightNumber: string; date: string; origin: string; destination: string; departure: string; arrival: string; arrivalDate?: string; deadhead: boolean; actualTimes: boolean; aircraftType?: string; crew?: AimsCrewMember[] };
export type AimsDuty = { date: string; start?: string; end?: string; report?: string; release?: string; flights: AimsFlight[] };
export type AimsHotel = { station: string; name?: string; address?: string; phone?: string; locator?: string };
export type AimsAbsence = { code: 'SICK' | 'UFF' | 'VAC' | 'CHLD'; date: string };
export type AimsActivity = { date: string; code: string; title?: string; type: string; location?: string; start?: string; end?: string };
export type AimsRoster = { period: { start: string; end: string }; duties: AimsDuty[]; hotels: AimsHotel[]; absences: AimsAbsence[]; activities: AimsActivity[]; totals: { blockMinutes?: number; nightMinutes?: number }; importedAt: string };

type RecordValue = Record<string, unknown>;
const storageKey = 'pwaplog.aims-roster.v1';
const sectorPattern = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)/g;

export function loadAimsRoster(): AimsRoster | undefined {
  try { const value = localStorage.getItem(storageKey); return value ? JSON.parse(value) as AimsRoster : undefined; } catch { return undefined; }
}
export function saveAimsRoster(roster: AimsRoster) { localStorage.setItem(storageKey, JSON.stringify(roster)); }

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
    if (flights.length) duties.push({ date: flights[0].date, start: boundary(text(event.start)), end: boundary(text(event.end)), report: boundary(text(event.report), dutyDate), release: boundary(text(event.debrief), dutyDate), flights });
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
  attachCrew(duties, findElement(result.elementList, 'members'));
  const hours = findElement(result.elementList, 'hours');
  const totals = Array.isArray(hours?.data) ? hours.data.reduce<{ blockMinutes?: number; nightMinutes?: number }>((summary, row) => {
    if (!record(row)) return summary; const value = minutes(text(row.hours)); const label = text(row.desc).toLowerCase();
    if (value !== undefined && label.includes('block')) summary.blockMinutes = value;
    if (value !== undefined && label.includes('night')) summary.nightMinutes = value;
    return summary;
  }, {}) : {};
  return { period: { start: periodStart, end: periodEnd }, duties, hotels: hotels(findElement(result.elementList, 'hotels')), absences, activities, totals, importedAt: new Date().toISOString() };
}

function sectors(event: RecordValue, dutyDate: string): AimsFlight[] {
  const parsed: AimsFlight[] = []; sectorPattern.lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = sectorPattern.exec(text(event.details)))) {
    const [, flightNumber, origin, outPrefix, out, outNext, destination, inPrefix, incoming, inNext] = match;
    const date = addDays(dutyDate, outNext ? 1 : 0); const arrivalDate = addDays(dutyDate, inNext ? 1 : 0);
    if (!date || !arrivalDate) continue;
    parsed.push({ flightNumber: /^KC/i.test(flightNumber) ? flightNumber : `KC${flightNumber}`, date, origin, destination, departure: time(out), arrival: time(incoming), arrivalDate: arrivalDate !== date ? arrivalDate : undefined, deadhead: Boolean(event.IsDeadhead), actualTimes: outPrefix === 'A' && inPrefix === 'A', aircraftType: aircraft(event) });
  }
  return parsed;
}
function aircraft(event: RecordValue) { return ['aircraftType', 'AircraftType', 'aircraft', 'Aircraft', 'acType', 'ACType'].map((key) => scalar(event[key])).find(Boolean) || undefined; }
function absenceCode(event: RecordValue): AimsAbsence['code'] | undefined { const value = `${text(event.type)} ${text(event.text)} ${text(event.details)}`.toUpperCase(); return (['SICK', 'UFF', 'VAC', 'CHLD'] as const).find((code) => new RegExp(`\\b${code}\\b`).test(value)); }
function eventCode(event: RecordValue) { return /^([A-Z0-9]{2,8})\b/i.exec(text(event.text).trim())?.[1]?.toUpperCase(); }
function attachCrew(duties: AimsDuty[], members?: RecordValue) {
  const groups = Array.isArray(members?.data) ? members.data : [];
  for (const group of groups) {
    if (!record(group) || !Array.isArray(group.data)) continue;
    const key = /^(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*([A-Z]?\d{1,5})\s*\|\s*([A-Z]{3,4})\s*-\s*([A-Z]{3,4})/i.exec(text(group.value).replace(/&emsp;|&#8195;|&#x2003;|\u2003/gi, ' | ').replace(/\s+/g, ' '));
    if (!key) continue;
    const [, day, month, year, number, origin, destination] = key;
    const crew = group.data.flatMap((item): AimsCrewMember[] => {
      if (!record(item)) return []; const name = text(item.value2).trim(); const position = text(item.value4).trim(); if (!name || !position) return [];
      const rank = position.split('-')[0]?.trim().toUpperCase(); return [{ id: scalar(item.value3) || undefined, name, position, role: rank === 'CP' || rank === 'FO' || rank === 'LI' ? 'Flight deck' : 'Cabin', deadhead: /\bDHC\b/i.test(position) || undefined }];
    });
    if (!crew.length) continue;
    const date = `${year}-${month}-${day}`; const normalizedNumber = number.replace(/^KC/i, '');
    const flight = duties.flatMap((duty) => duty.flights).find((candidate) => candidate.date === date && candidate.flightNumber.replace(/^KC/i, '') === normalizedNumber && candidate.origin === origin.toUpperCase() && candidate.destination === destination.toUpperCase());
    if (flight) flight.crew = crew;
  }
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
function decodeArchive(data: ArrayBuffer) { const bytes = new Uint8Array(data); const probe = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256 * 1024)); const declared = /charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(probe)?.[1]?.toLowerCase(); return new TextDecoder(declared === 'windows-1251' || declared === 'cp1251' ? 'windows-1251' : 'utf-8').decode(bytes); }
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
function addDays(value: string, days: number) { const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d + days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
