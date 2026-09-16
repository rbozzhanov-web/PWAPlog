import packedZones from './assets/airportTimezones.json';

/**
 * Turning an AIMS roster into real block times.
 *
 * AIMS prints every time on the clock of the station it happens at — a departure from Frankfurt is
 * German local, its arrival in Astana is Kazakh local — so subtracting one printed clock from the
 * other is only correct when both stations share an offset. Reading them as one clock made KC921
 * NQZ→FRA block 4:37 and its return KC922 FRA→NQZ block 9:47: a five-hour-twelve spread on the
 * same route in opposite directions, which no aeroplane does.
 *
 * Three readings were tested against the archive AIMS itself publishes totals for. All three
 * reproduce its Block Hours of 47:20, because this roster is a balanced out-and-back and the
 * ±3h errors cancel across the month. Its *Night Hours* of 20:50 separate them, night depending
 * on the real sun rather than on any clock:
 *
 *     printed times are Zulu, block = clock difference   →  23:43
 *     printed times are base local, block = difference   →  22:13
 *     printed times are station local                    →  20:10
 *
 * Only the station-local reading lands near AIMS's own figure (the remaining gap is the night
 * boundary convention: the same sectors come to 21:18 measured from sunset/sunrise rather than
 * civil twilight, so 20:50 falls inside that bracket).
 *
 * A station's offset is a timezone question, not a longitude one: Kazakhstan runs a single offset
 * across 20° of longitude, and Germany changes its twice a year. So this resolves through the IANA
 * zone and applies the rules for the flight's own date.
 *
 * Deliberately built on `Intl` rather than luxon, which core already depends on: this module is in
 * the app's entry chunk, and pulling luxon in with it cost 25 KB gzipped for one conversion the
 * platform already knows how to do.
 */

const zoneOf = new Map<string, string>();
for (const [zone, codes] of Object.entries(packedZones as Record<string, string>)) {
  for (let at = 0; at < codes.length; at += 3) zoneOf.set(codes.slice(at, at + 3), zone);
}

/** The IANA zone a station keeps its clocks on, or undefined if the station isn't known. */
export function stationTimezone(code: string): string | undefined {
  return zoneOf.get(code.trim().toUpperCase());
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      // h23 rather than hour12: false — the latter still reports midnight as hour "24" on some
      // engines, which parses as the following day.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock reading in `zone` at `instant`, as "YYYY-MM-DDTHH:MM". */
function wallClockAt(zone: string, instant: number): string {
  const parts: Record<string, string> = {};
  for (const part of zoneFormatter(zone).formatToParts(new Date(instant))) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Minutes `zone` is ahead of UTC at `instant`. */
function offsetMinutesAt(zone: string, instant: number): number {
  return (Date.parse(`${wallClockAt(zone, instant)}:00Z`) - instant) / 60_000;
}

/**
 * Reads a printed "YYYY-MM-DD" + "HH:MM" as the clock at `code` and returns the real instant.
 *
 * Returns undefined when the station is unknown or the zone has no such local time — the hour a
 * spring-forward transition skips. Both are cases where a fallback is honest and a guessed offset
 * is not.
 */
export function stationLocalToUtc(date: string, hhmm: string, code: string): Date | undefined {
  const zone = stationTimezone(code);
  if (!zone) return undefined;

  const wallClock = `${date}T${hhmm}`;
  const asIfUtc = Date.parse(`${wallClock}:00Z`);
  if (!Number.isFinite(asIfUtc)) return undefined;

  // Solve for the instant whose local reading is the printed one. The first subtraction uses the
  // offset in force at the wrong moment, which only matters within a few hours of a transition;
  // the second uses the offset at the candidate answer and settles it.
  let instant = asIfUtc - offsetMinutesAt(zone, asIfUtc) * 60_000;
  instant = asIfUtc - offsetMinutesAt(zone, instant) * 60_000;

  // A local time the zone skips has no instant at all, and the solve above would land on one that
  // reads back as a different clock. Say so rather than returning an hour that never happened.
  return wallClockAt(zone, instant) === wallClock ? new Date(instant) : undefined;
}
