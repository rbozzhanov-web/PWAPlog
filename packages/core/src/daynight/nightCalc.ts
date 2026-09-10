import { findAirportCoords, AirportCoords } from './airportDb';
import { isNight } from './sunPosition';
import { zuluTimeToUtc } from './timezone';

export interface NightCalcInput {
  /** ISO "YYYY-MM-DD" departure date (UTC/Zulu). */
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  /** "HH:MM" departure time, UTC/Zulu (standard pilot-logbook convention). */
  departureTime: string;
  totalTimeMinutes: number;
}

export interface NightCalcResult {
  dayMinutes: number;
  nightMinutes: number;
  dayTakeoffs: number;
  nightTakeoffs: number;
  dayLandings: number;
  nightLandings: number;
}

const SAMPLE_STEP_MINUTES = 1;
const RAD = Math.PI / 180;

/** Logbook convention: day/night are kept to the nearest 5 minutes. */
const ROUNDING_MINUTES = 5;

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Interpolates a point along the great-circle track between two airports, parameterized by
 * elapsed-time fraction (0 = departure, 1 = arrival), assuming constant ground speed. This is
 * the standard simplification EFB/logbook tools use when the actual flown track isn't known.
 */
function interpolateGreatCircle(from: AirportCoords, to: AirportCoords, fraction: number): AirportCoords {
  const lat1 = from.lat * RAD;
  const lon1 = from.lon * RAD;
  const lat2 = to.lat * RAD;
  const lon2 = to.lon * RAD;

  const angularDistance =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (angularDistance < 1e-9) return from; // same airport (e.g. a local training flight)

  const a = Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
  const b = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);

  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);

  return { lat: lat / RAD, lon: lon / RAD };
}

/**
 * Computes real day/night classification for a flight's takeoff, landing, and in-flight time
 * from its actual airports and times, using civil twilight (sun 6° below horizon) as the
 * ICAO/EASA-style night boundary. Returns undefined if either airport can't be resolved.
 */
export function calculateDayNight(input: NightCalcInput): NightCalcResult | undefined {
  const depCoords = findAirportCoords(input.departureAirport);
  const arrCoords = findAirportCoords(input.arrivalAirport);
  if (!depCoords || !arrCoords) return undefined;

  const departureUtc = zuluTimeToUtc(input.date, input.departureTime);
  if (!departureUtc.isValid) return undefined;

  const arrivalUtc = departureUtc.plus({ minutes: input.totalTimeMinutes });

  const isTakeoffNight = isNight(departureUtc.toJSDate(), depCoords);
  const isLandingNight = isNight(arrivalUtc.toJSDate(), arrCoords);

  let nightMinutes = 0;
  const totalMinutes = input.totalTimeMinutes;
  if (totalMinutes > 0) {
    for (let elapsed = 0; elapsed < totalMinutes; elapsed += SAMPLE_STEP_MINUTES) {
      const sampleWidth = Math.min(SAMPLE_STEP_MINUTES, totalMinutes - elapsed);
      const midpoint = elapsed + sampleWidth / 2;
      const fraction = midpoint / totalMinutes;
      const instant = departureUtc.plus({ minutes: midpoint }).toJSDate();
      const position = interpolateGreatCircle(depCoords, arrCoords, fraction);
      if (isNight(instant, position)) nightMinutes += sampleWidth;
    }
  }
  // Logbooks are kept to the nearest 5 minutes, so round the night figure — but only the night
  // figure, deriving day from it. Rounding both independently would let them stop summing to
  // block time (e.g. 02:32 total → 01:15 night + 01:15 day loses two minutes), and a logbook
  // whose columns don't add up to the total is wrong on its face.
  //
  // A flight that was entirely night (or entirely day) is the exception: it keeps the exact
  // block time. Rounding 263 minutes of unbroken night down to 260 would claim three minutes of
  // daylight that never happened, which is a worse error than the odd minute it tidies away.
  const isSingleCondition = nightMinutes === 0 || nightMinutes >= totalMinutes;
  nightMinutes = isSingleCondition
    ? Math.min(nightMinutes, totalMinutes)
    : roundToNearest(nightMinutes, ROUNDING_MINUTES);

  return {
    nightMinutes,
    dayMinutes: totalMinutes - nightMinutes,
    dayTakeoffs: isTakeoffNight ? 0 : 1,
    nightTakeoffs: isTakeoffNight ? 1 : 0,
    dayLandings: isLandingNight ? 0 : 1,
    nightLandings: isLandingNight ? 1 : 0,
  };
}
