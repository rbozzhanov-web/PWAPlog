import { getPosition, getTimes } from 'suncalc';

import { AirportCoords } from './airportDb';

/** Apparent solar elevation above the horizon, in degrees (suncalc v2 returns degrees directly). */
export function solarElevationDegrees(instant: Date, coords: AirportCoords): number {
  return getPosition(instant, coords.lat, coords.lon).altitude;
}

/**
 * True when this instant/location falls outside civil twilight (sun 6° below horizon) —
 * the ICAO/EASA-style "night" definition. Uses suncalc's own dawn/dusk event times rather than
 * thresholding `getPosition`'s altitude directly: `getPosition` bakes in a fixed atmospheric
 * refraction correction for any below-horizon angle, which shifts a raw "-6°" comparison by
 * several arcminutes (a few minutes of real time near sunrise/sunset) relative to the dawn/dusk
 * events getTimes() computes for exactly this threshold.
 */
export function isNight(instant: Date, coords: AirportCoords): boolean {
  const times = getTimes(instant, coords.lat, coords.lon);
  if (!times.dawn || !times.dusk) {
    // Near the poles the sun can stay continuously above or below civil twilight for the whole
    // day, so no dawn/dusk crossing exists. Fall back to the (refraction-shifted, but adequate
    // for this rare edge case) elevation check rather than guessing.
    return solarElevationDegrees(instant, coords) < -6;
  }
  return instant < times.dawn || instant > times.dusk;
}
