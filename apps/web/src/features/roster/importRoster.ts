import { dedupeRoster, flightIdentity, parseAimsArchive, type AimsDuty, type AimsHotel, type AimsRoster } from './aims';

/**
 * One way in for a roster, whichever file the pilot has to hand.
 *
 * AIMS gives the same schedule out two ways: a Safari Web Archive of the Crew Schedule page,
 * which is whatever period the browser had open, and the "Personal Crew Schedule Report" PDF,
 * which is how a published month arrives before it is browsable. A pilot uses whichever they have,
 * so the app takes either — sniffing the file rather than asking, and folding the result into the
 * one stored roster instead of keeping a second copy beside it.
 */
export async function parseAimsFile(file: File): Promise<AimsRoster> {
  const head = new TextDecoder('ascii').decode((await file.slice(0, 5).arrayBuffer()));
  if (head !== '%PDF-') return parseAimsArchive(file);
  // pdf.js and the report parser are only worth their download once a PDF is actually chosen.
  const [{ extractPdfText }, { parseAimsSchedulePdf }] = await Promise.all([
    import('../../platform/pdf/extractText'),
    import('./aimsPdf'),
  ]);
  return parseAimsSchedulePdf(await extractPdfText(file));
}

/**
 * Folds a fresh import into the roster already stored, so the two file types build one schedule
 * between them rather than overwriting each other.
 *
 * An import owns every day from its first entry to its last, and replaces those days outright:
 * that is what stops a day appearing twice when the same week arrives first as a PDF and then in
 * an archive, and it is also what lets a correction land — a duty that was cancelled since the
 * last import is gone from the new one, and so it goes from the roster.
 *
 * Days outside that span are left alone. The import is not evidence about them: an archive saved
 * with only September loaded declares a period running into October but says nothing about it,
 * and taking the declared period at its word would delete an October the pilot had imported from
 * a PDF minutes earlier.
 */
export function mergeAimsRoster(existing: AimsRoster | undefined, incoming: AimsRoster): AimsRoster {
  const coverage = coverageOf(incoming);
  const merged: AimsRoster = { ...incoming, coverage };
  if (!existing) return merged;

  const outside = (date: string) => date < coverage.start || date > coverage.end;
  // A sector the incoming import carries is that import's to describe, whatever the spans say.
  // Coverage decides which *days* the old roster keeps; this decides that it never keeps a second
  // copy of a flight the new file already has.
  const arriving = new Set(incoming.duties.flatMap((duty) => duty.flights.map(flightIdentity)));
  const superseded = (duty: AimsDuty) => duty.flights.some((flight) => arriving.has(flightIdentity(flight)));
  // What the stored roster already covers is its own recorded span, not its period: after a merge
  // the period is only the last import's, while the days it can answer for run wider.
  const previous = existing.coverage ?? coverageOf(existing);
  merged.coverage = { start: min(previous.start, coverage.start), end: max(previous.end, coverage.end) };
  merged.duties = sortDuties([...existing.duties.filter((duty) => outside(duty.date) && !superseded(duty)), ...incoming.duties]);
  merged.absences = [...existing.absences.filter((absence) => outside(absence.date)), ...incoming.absences].sort((a, b) => a.date.localeCompare(b.date));
  merged.activities = [...(existing.activities ?? []).filter((activity) => outside(activity.date)), ...(incoming.activities ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  // Hotels are a per-station address book with no date on them, so a source that carries none —
  // the PDF, whose report prints no hotel section — keeps the ones already known rather than
  // clearing them.
  merged.hotels = mergeHotels(existing.hotels ?? [], incoming.hotels ?? []);
  return dedupeRoster(merged);
}

/**
 * The span an import actually says something about: the days its own entries fall on, first to
 * last.
 *
 * Not the period printed on it, which is only where AIMS' calendar window happened to be — an
 * archive saved with one month loaded declares that month whether or not it loaded all of it, and
 * carries the first days of the next month besides. Clamping the entries to that declared period
 * is what let a September archive add its 2 and 4 October duties beside the ones an October PDF
 * had already supplied: its coverage stopped on the 30th, so October was not its to replace, and
 * both readings of those two days survived into the roster.
 */
function coverageOf(roster: AimsRoster): { start: string; end: string } {
  // Both ends of everything, not just the day each entry is filed under: a duty reporting at 22:35
  // for a midnight departure reaches back a day, and a standby running to 09:00 tomorrow reaches
  // forward one — and a source that covers a day is entitled to replace it.
  const dates = [
    ...roster.duties.flatMap((duty) => [
      duty.date, day(duty.report), day(duty.start), day(duty.release), day(duty.end),
      ...duty.flights.flatMap((flight) => [flight.date, flight.arrivalDate ?? flight.date]),
    ]),
    ...roster.absences.map((absence) => absence.date),
    ...(roster.activities ?? []).flatMap((activity) => [activity.date, day(activity.start), day(activity.end)]),
  ].filter((value): value is string => Boolean(value)).sort();
  if (!dates.length) return roster.period;
  return { start: dates[0], end: dates[dates.length - 1] };
}

function mergeHotels(existing: AimsHotel[], incoming: AimsHotel[]): AimsHotel[] {
  const byStation = new Map(existing.map((hotel) => [hotel.station.trim().toUpperCase(), hotel]));
  for (const hotel of incoming) byStation.set(hotel.station.trim().toUpperCase(), hotel);
  return [...byStation.values()];
}

function sortDuties(duties: AimsDuty[]): AimsDuty[] {
  return duties.sort((a, b) => (a.report ?? a.start ?? a.date).localeCompare(b.report ?? b.start ?? b.date));
}
function day(value?: string) { return value?.slice(0, 10); }
function min(a: string, b: string) { return a <= b ? a : b; }
function max(a: string, b: string) { return a >= b ? a : b; }
