import { calculateDayNight } from '../../daynight/nightCalc';
import { hhmmToMinutes } from '../../time';
import { NEW_ENTRY_DEFAULTS } from '../../logbook/types';
import { toIcaoCode } from '../../daynight/airportDb';
import { isAirportCodeToken, isTimeToken, parseDateDdMmYy, parseDateDdMmYyyy } from '../patterns';
import { tokenizeLines } from '../tokenize';
import { ExtractedPage, ParsedCandidate, ParseResult, ParserRule } from '../types';

function minutesBetween(timeOut: string, timeIn: string): number | undefined {
  const out = hhmmToMinutes(timeOut);
  const inn = hhmmToMinutes(timeIn);
  if (out === null || inn === null) return undefined;
  return inn >= out ? inn - out : 24 * 60 - out + inn;
}

/**
 * Best-effort fallback for any report we don't have a dedicated rule for: scans each line for a
 * date, two airport codes, and two HH:MM times, in no particular column order. Always registered
 * last and never reports 'high' confidence — every row it produces is meant to be checked on the
 * review screen rather than trusted outright.
 */
export const genericRule: ParserRule = {
  id: 'generic-v1',

  matches(): boolean {
    return true;
  },

  parse(pages: ExtractedPage[]): ParseResult {
    const candidates: ParsedCandidate[] = [];

    for (const page of pages) {
      for (const line of tokenizeLines(page)) {
        const dateItem = line.items.find(
          (item) => parseDateDdMmYy(item.str) ?? parseDateDdMmYyyy(item.str),
        );
        if (!dateItem) continue;
        const date = parseDateDdMmYy(dateItem.str) ?? parseDateDdMmYyyy(dateItem.str);
        if (!date) continue;

        const airportTokens = line.items.filter((item) => isAirportCodeToken(item.str));
        const timeTokens = line.items.filter((item) => isTimeToken(item.str));
        const unmatchedFields: string[] = [];

        const departureAirport = airportTokens[0] && toIcaoCode(airportTokens[0].str);
        const arrivalAirport = airportTokens[1] && toIcaoCode(airportTokens[1].str);
        if (!departureAirport || !arrivalAirport) {
          unmatchedFields.push('Departure or arrival airport could not be read from this row.');
        }

        const timeOut = timeTokens[0]?.str.trim();
        const timeIn = timeTokens[1]?.str.trim();
        if (!timeOut || !timeIn) unmatchedFields.push('Block times (out/in) could not be read.');

        const totalTimeMinutes = timeOut && timeIn ? minutesBetween(timeOut, timeIn) : undefined;
        if (totalTimeMinutes === undefined) unmatchedFields.push('Flight time could not be read.');

        const nightResult =
          departureAirport && arrivalAirport && timeOut && totalTimeMinutes !== undefined
            ? calculateDayNight({ date, departureAirport, arrivalAirport, departureTime: timeOut, totalTimeMinutes })
            : undefined;
        if (!nightResult) {
          unmatchedFields.push(
            'Day/night could not be computed — check the date, airports and time out.',
          );
        }

        candidates.push({
          rawSourceLine: line.text,
          confidence: unmatchedFields.length === 0 ? 'medium' : 'low',
          unmatchedFields,
          fields: {
            ...NEW_ENTRY_DEFAULTS,
            date,
            departureAirport,
            arrivalAirport,
            timeOut,
            timeIn,
            totalTimeMinutes: totalTimeMinutes ?? 0,
            ...(nightResult ?? {}),
            source: 'pdf_import',
          },
        });
      }
    }

    return { ruleId: this.id, candidates, crossChecks: [] };
  },
};
