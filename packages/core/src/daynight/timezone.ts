import { DateTime } from 'luxon';

/**
 * Parses a flight's date + "HH:MM" clock time into a UTC instant.
 *
 * Airline flight-time reports (confirmed against the real Air Astana sample: every row's
 * raw arrival-minus-departure clock difference equals its reported block time exactly, even
 * across departure/arrival airports in different timezones) record times in UTC/Zulu, which is
 * also standard professional pilot-logbook practice. So both PDF-imported and manually-entered
 * times are treated as Zulu — no per-airport timezone/DST lookup is needed or performed.
 */
export function zuluTimeToUtc(date: string, hhmm: string): DateTime {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return DateTime.utc(year, month, day, hour, minute);
}
