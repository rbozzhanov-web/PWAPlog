export type AimsFlight = { flightNumber: string; date: string; origin: string; destination: string; departure: string; arrival: string; arrivalDate?: string; deadhead: boolean; actualTimes: boolean };
export type AimsDuty = { date: string; start?: string; end?: string; flights: AimsFlight[] };
export type AimsRoster = { period: { start: string; end: string }; duties: AimsDuty[]; importedAt: string };

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
  const events = Array.isArray(result.SchedulerEvents) ? result.SchedulerEvents : [];
  const duties: AimsDuty[] = [];
  for (const event of events) {
    if (!record(event)) continue;
    const dutyDate = datePart(text(event.start));
    if (!dutyDate) continue;
    const flights = sectors(event, dutyDate);
    if (flights.length) duties.push({ date: flights[0].date, start: boundary(text(event.start)), end: boundary(text(event.end)), flights });
  }
  if (!duties.length) throw new Error('The saved AIMS schedule contains no flight sectors. Make sure the calendar was fully loaded before saving it.');
  duties.sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date));
  return { period: { start: periodStart, end: periodEnd }, duties, importedAt: new Date().toISOString() };
}

function sectors(event: RecordValue, dutyDate: string): AimsFlight[] {
  const parsed: AimsFlight[] = []; sectorPattern.lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = sectorPattern.exec(text(event.details)))) {
    const [, flightNumber, origin, outPrefix, out, outNext, destination, inPrefix, incoming, inNext] = match;
    const date = addDays(dutyDate, outNext ? 1 : 0); const arrivalDate = addDays(dutyDate, inNext ? 1 : 0);
    if (!date || !arrivalDate) continue;
    parsed.push({ flightNumber: /^KC/i.test(flightNumber) ? flightNumber : `KC${flightNumber}`, date, origin, destination, departure: time(out), arrival: time(incoming), arrivalDate: arrivalDate !== date ? arrivalDate : undefined, deadhead: Boolean(event.IsDeadhead), actualTimes: outPrefix === 'A' && inPrefix === 'A' });
  }
  return parsed;
}
function assignedJson(source: string): RecordValue { const marker = /var\s+initialResult\s*=/.exec(source); if (!marker) throw new Error('Could not find AIMS data in this saved file.'); const start = source.indexOf('{', marker.index); let depth = 0, quoted = false, escaped = false; for (let i = start; i < source.length; i += 1) { const char = source[i]; if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; } if (char === '"') { quoted = true; continue; } if (char === '{') depth += 1; if (char === '}' && --depth === 0) { const parsed: unknown = JSON.parse(source.slice(start, i + 1)); if (record(parsed)) return parsed; } } throw new Error('AIMS schedule data is incomplete.'); }
function decodeArchive(data: ArrayBuffer) { const bytes = new Uint8Array(data); const probe = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256 * 1024)); const declared = /charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(probe)?.[1]?.toLowerCase(); return new TextDecoder(declared === 'windows-1251' || declared === 'cp1251' ? 'windows-1251' : 'utf-8').decode(bytes); }
function readLocalStorage(source: string, key: string) { return new RegExp(`localStorage\\[['"]${key}['"]\\]\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1]; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function record(value: unknown): value is RecordValue { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function datePart(value: string) { const result = /^\d{4}-\d{2}-\d{2}/.exec(value); return result?.[0]; }
function boundary(value: string) { const result = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value); return result?.slice(1, 3).join('T'); }
function time(value: string) { return `${value.slice(0, 2)}:${value.slice(2, 4)}`; }
function addDays(value: string, days: number) { const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d + days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
